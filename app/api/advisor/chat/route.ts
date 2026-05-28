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
} from '@/lib/db'

export const maxDuration = 60

export async function GET() {
  const state = await getConversationState()
  return NextResponse.json({ messages: state.recent_messages })
}

export async function POST(req: Request) {
  const { message } = await req.json()

  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }

  const now = new Date()
  const date = now.toISOString().split('T')[0]
  const horizonDate = new Date(now)
  horizonDate.setDate(horizonDate.getDate() + 30)
  const horizonStr = horizonDate.toISOString().split('T')[0]

  const [goals, todayTasks, recentLogs, lightDays, state] = await Promise.all([
    getGoals(),
    getTodayTasks(date),
    getRecentLogs(7),
    getLightDays(date, horizonStr),
    getConversationState(),
  ])

  const goalsSummary = goals.length === 0
    ? 'No goals set.'
    : goals.map(g => `- [id:${g.id}] ${g.title} (${g.type}, due ${g.deadline})`).join('\n')

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
    goals: goalsSummary,
    todayTasks: tasksSummary,
    recentLogs: logsSummary,
    lightDays: lightDaySummary,
    summary: state.summary,
  })

  const historyMessages = state.recent_messages.slice(-10)
  const messagesForApi = [
    ...historyMessages,
    { role: 'user' as const, content: message },
  ]

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: messagesForApi,
  })

  let fullResponse = ''

  return new Response(
    new ReadableStream({
      async start(controller) {
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

        const updatedMessages = [
          ...state.recent_messages,
          { role: 'user' as const, content: message },
          { role: 'assistant' as const, content: fullResponse },
        ]

        if (updatedMessages.length <= 20) {
          await upsertConversationState({
            summary: state.summary,
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

          const combinedSummary = state.summary
            ? `${state.summary}\n\n${newSummaryChunk}`
            : newSummaryChunk

          await upsertConversationState({
            summary: combinedSummary,
            recent_messages: remaining,
          })
        } catch {
          // Compression failed — save without compressing
          await upsertConversationState({
            summary: state.summary,
            recent_messages: updatedMessages.slice(-20),
          })
        }
      },
    }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  )
}
