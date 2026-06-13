import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/claude'
import {
  ADVISOR_SYSTEM,
  COMPRESSION_SYSTEM,
} from '@/lib/prompts'
import {
  getGoals,
  getTodayTasks,
  getRecentLogs,
  getLightDays,
  getConversationState,
  upsertConversationState,
  getTrackers,
  getTasksInRange,
} from '@/lib/db'
import { today, localDate } from '@/lib/utils'
import { toApiMessages } from '@/lib/conversation'
import { buildTrackersSummary } from '@/lib/tracker'
import { buildUpcomingSummary } from '@/lib/appEdit'
import { extractFirstUrl, fetchPageText } from '@/lib/fetchPage'
import type { ChatMessage } from '@/lib/types'

export const maxDuration = 60

export async function GET() {
  try {
    const state = await getConversationState()
    return NextResponse.json({ messages: state.recent_messages })
  } catch (err) {
    console.error('Advisor history error:', err)
    return NextResponse.json({ messages: [] })
  }
}

export async function POST(req: Request) {
  let message: string
  try {
    const body = await req.json()
    message = body.message
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }

  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }

  const date = today()
  const time = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  })
  const horizonStr = localDate(30)

  const [goals, todayTasks, recentLogs, lightDays, state, trackers, upcomingTasks] = await Promise.all([
    getGoals(),
    getTodayTasks(date),
    getRecentLogs(7),
    getLightDays(date, horizonStr),
    getConversationState(),
    getTrackers(),
    getTasksInRange(localDate(1), localDate(14)),
  ])

  const goalsSummary = goals.length === 0
    ? 'No goals set.'
    : goals.map(g => `- [id:${g.id}] ${g.title} (${g.type}, due ${g.deadline})`).join('\n')

  const trackersSummary = buildTrackersSummary(goals, trackers)
  const upcomingSummary = buildUpcomingSummary(goals, upcomingTasks)

  const tasksSummary = todayTasks.length === 0
    ? 'No tasks scheduled today.'
    : todayTasks.map(t => {
        const goal = goals.find(g => g.id === t.goal_id)
        return `- [${t.completed ? 'x' : ' '}] ${t.description} (${goal?.title ?? 'unknown'})`
      }).join('\n')

  const logsSummary = recentLogs.length === 0
    ? 'No recent logs.'
    : recentLogs.slice(0, 14).map(l => {
        const goal = goals.find(g => g.id === l.goal_id)
        return `${l.date} (${goal?.title ?? 'unknown'}): ${l.notes}`
      }).join('\n')

  const lightDaySummary = lightDays.length === 0
    ? 'None.'
    : lightDays.join(', ')

  const systemPrompt = ADVISOR_SYSTEM({
    date,
    time,
    goals: goalsSummary,
    trackers: trackersSummary,
    todayTasks: tasksSummary,
    upcoming: upcomingSummary,
    recentLogs: logsSummary,
    lightDays: lightDaySummary,
    summary: state.summary,
  })

  // If the user pasted a link, fetch it now and show the page text to the model
  // only — the persisted conversation keeps the message as typed, so page dumps
  // never bloat conversation_state or the compression loop.
  let modelMessage = message
  const url = extractFirstUrl(message)
  if (url) {
    const page = await fetchPageText(url)
    modelMessage = page.ok
      ? `${message}\n\n<fetched_page url="${url}">\n${page.text}\n</fetched_page>`
      : `${message}\n\n<fetched_page url="${url}" error="${page.error.replace(/"/g, '&quot;')}"></fetched_page>`
  }

  const messagesForApi = toApiMessages(state.recent_messages, modelMessage)

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages: messagesForApi,
  })

  let fullResponse = ''

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === 'content_block_delta' &&
              chunk.delta.type === 'text_delta'
            ) {
              const text = chunk.delta.text
              fullResponse += text
              controller.enqueue(new TextEncoder().encode(text))
            }
          }
          controller.close()
        } catch (err) {
          console.error('Advisor chat stream error:', err)
          try { controller.error(err) } catch { /* already errored */ }
        }

        // Don't persist an empty turn (stream died before producing any text).
        if (!fullResponse) return

        // Persist whatever streamed (even a partial response) so the turn
        // isn't lost if the stream errored midway. Re-read state right before
        // writing: generation took seconds, and the brief route may have
        // appended in the meantime — persisting from the pre-stream snapshot
        // would silently clobber it.
        try {
          const fresh = await getConversationState()
          const ts = new Date().toISOString()
          const updatedMessages: ChatMessage[] = [
            ...fresh.recent_messages,
            { role: 'user', content: message, ts },
            { role: 'assistant', content: fullResponse, ts },
          ]

          if (updatedMessages.length <= 20) {
            await upsertConversationState({
              summary: fresh.summary,
              recent_messages: updatedMessages,
            })
            return
          }

          // Compress oldest 10 into summary
          const toCompress = updatedMessages.slice(0, 10)
          const remaining = updatedMessages.slice(10)

          const compressionText = toCompress
            .map(m => `${m.role}: ${m.content}`)
            .join('\n\n')

          try {
            const compressionMsg = await anthropic.messages.create({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 256,
              system: COMPRESSION_SYSTEM,
              messages: [{ role: 'user', content: compressionText }],
            })
            const newSummaryChunk =
              compressionMsg.content[0].type === 'text'
                ? compressionMsg.content[0].text
                : ''

            const combinedSummary = fresh.summary
              ? `${fresh.summary}\n\n${newSummaryChunk}`
              : newSummaryChunk

            await upsertConversationState({
              summary: combinedSummary,
              recent_messages: remaining,
            })
          } catch {
            // Compression failed — save without compressing
            await upsertConversationState({
              summary: fresh.summary,
              recent_messages: updatedMessages.slice(-20),
            })
          }
        } catch (err) {
          console.error('Failed to persist conversation state:', err)
        }
      },
    }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  )
}
