import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/claude'
import { ADVISOR_SYSTEM, TITLE_SYSTEM } from '@/lib/prompts'
import {
  getGoals,
  getTodayTasks,
  getRecentLogs,
  getLightDays,
  getTrackers,
  getTasksInRange,
  getConversation,
  createConversation,
  appendMessages,
  setConversationTitle,
} from '@/lib/db'
import { today, localDate } from '@/lib/utils'
import { toApiMessages, shouldGenerateTitle } from '@/lib/conversation'
import { buildTrackersSummary } from '@/lib/tracker'
import { buildUpcomingSummary } from '@/lib/appEdit'
import { extractFirstUrl, fetchPageText } from '@/lib/fetchPage'
import { stripTags } from '@/lib/advisorParse'
import type { ChatMessage } from '@/lib/types'

export const maxDuration = 60

// Compact transcript of the first exchange, fed to Haiku for title generation.
function titleInput(messages: ChatMessage[]): string {
  const firstUser = messages.find(m => m.role === 'user' && m.content.trim())
  const firstAssistant = messages.find(
    m => m.role === 'assistant' && m.kind !== 'brief' && m.content.trim()
  )
  return [
    firstUser && `User: ${firstUser.content.trim()}`,
    firstAssistant && `Advisor: ${stripTags(firstAssistant.content).trim()}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export async function POST(req: Request) {
  let message: string
  let conversationId: string | null
  try {
    const body = await req.json()
    message = body.message
    conversationId = typeof body.conversationId === 'string' ? body.conversationId : null
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }

  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }

  // Load the target thread, or lazily create one (first message of a new chat).
  let convo = conversationId ? await getConversation(conversationId) : null
  if (!convo) convo = await createConversation()
  const convoId = convo.id
  const history = convo.messages

  const date = today()
  const time = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  })
  const horizonStr = localDate(30)

  const [goals, todayTasks, recentLogs, lightDays, trackers, upcomingTasks] = await Promise.all([
    getGoals(),
    getTodayTasks(date),
    getRecentLogs(7),
    getLightDays(date, horizonStr),
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

  const lightDaySummary = lightDays.length === 0 ? 'None.' : lightDays.join(', ')

  const systemPrompt = ADVISOR_SYSTEM({
    date,
    time,
    goals: goalsSummary,
    trackers: trackersSummary,
    todayTasks: tasksSummary,
    upcoming: upcomingSummary,
    recentLogs: logsSummary,
    lightDays: lightDaySummary,
  })

  // If the user pasted a link, fetch it now and show the page text to the model
  // only — the persisted message keeps the text as typed, so page dumps never
  // bloat the stored conversation.
  let modelMessage = message
  const url = extractFirstUrl(message)
  if (url) {
    const page = await fetchPageText(url)
    modelMessage = page.ok
      ? `${message}\n\n<fetched_page url="${url}">\n${page.text}\n</fetched_page>`
      : `${message}\n\n<fetched_page url="${url}" error="${page.error.replace(/"/g, '&quot;')}"></fetched_page>`
  }

  const messagesForApi = toApiMessages(history, modelMessage)

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
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
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

        // Don't persist an empty turn (stream died before any text).
        if (!fullResponse) return

        try {
          const ts = new Date().toISOString()
          await appendMessages(convoId, [
            { role: 'user', content: message, ts },
            { role: 'assistant', content: fullResponse, ts },
          ])

          // Title the thread once its first real exchange exists. Best-effort:
          // a failure leaves title null and the UI falls back to a date label.
          const after = await getConversation(convoId)
          if (after && shouldGenerateTitle(after.messages, after.title)) {
            try {
              const titleMsg = await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 24,
                system: TITLE_SYSTEM,
                messages: [{ role: 'user', content: titleInput(after.messages) }],
              })
              const title =
                titleMsg.content[0].type === 'text' ? titleMsg.content[0].text.trim() : ''
              if (title) await setConversationTitle(convoId, title)
            } catch (err) {
              console.error('Title generation failed:', err)
            }
          }
        } catch (err) {
          console.error('Failed to persist conversation:', err)
        }
      },
    }),
    {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Conversation-Id': convoId,
      },
    }
  )
}
