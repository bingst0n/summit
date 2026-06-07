import { anthropic } from '@/lib/claude'
import { ADVISOR_BRIEF_SYSTEM } from '@/lib/prompts'
import {
  getGoals,
  getTodayTasks,
  getLogsForDate,
  getRecentLogs,
  getLightDays,
  getConversationState,
  upsertConversationState,
} from '@/lib/db'
import { today, localDate } from '@/lib/utils'
import { needsBrief } from '@/lib/conversation'
import type { ChatMessage } from '@/lib/types'

export const maxDuration = 30

export async function GET() {
  const date = today()

  // Cheap gate first: most opens don't need a brief at all, so don't pay for
  // the full context fetch (let alone the LLM call) until we know we do.
  const [state, todayLogs] = await Promise.all([
    getConversationState(),
    getLogsForDate(date),
  ])
  const loggedToday = todayLogs.length > 0

  if (!needsBrief(state.recent_messages, { loggedToday })) {
    return new Response(null, { status: 204 })
  }

  const time = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  })
  const horizonStr = localDate(30)

  const [goals, todayTasks, recentLogs, lightDays] = await Promise.all([
    getGoals(),
    getTodayTasks(date),
    getRecentLogs(7),
    getLightDays(date, horizonStr),
  ])

  const goalsSummary = goals.length === 0
    ? 'No goals set.'
    : goals.map(g => `- ${g.title} (${g.type}, due ${g.deadline})`).join('\n')

  const tasksSummary = todayTasks.length === 0
    ? 'No tasks scheduled today.'
    : todayTasks.map(t => {
        const goal = goals.find(g => g.id === t.goal_id)
        return `- [${t.completed ? 'x' : ' '}] ${t.description} (${goal?.title ?? 'unknown goal'})`
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

  const recentConversation = state.recent_messages.length === 0
    ? 'None yet — this is your first message to the user.'
    : state.recent_messages
        .slice(-6)
        .map(m => `${m.role === 'assistant' ? 'You' : 'User'}: ${m.content}`)
        .join('\n\n')

  const systemPrompt = ADVISOR_BRIEF_SYSTEM({
    date,
    time,
    goals: goalsSummary,
    todayTasks: tasksSummary,
    loggedToday,
    recentLogs: logsSummary,
    lightDays: lightDaySummary,
    summary: state.summary,
    recentConversation,
  })

  let fullText = ''

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    system: systemPrompt,
    messages: [{ role: 'user', content: 'Brief me.' }],
  })

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
              fullText += text
              controller.enqueue(new TextEncoder().encode(text))
            }
          }
          controller.close()
        } catch (err) {
          console.error('Advisor brief stream error:', err)
          try { controller.error(err) } catch { /* already errored */ }
        }

        if (!fullText) return

        // Append the brief to the conversation in chronological order.
        // Re-read state right before writing: generation took seconds, and a
        // concurrent request (double-mount, second device) may have persisted
        // a brief already — in that case drop this one instead of stacking.
        try {
          const fresh = await getConversationState()
          if (!needsBrief(fresh.recent_messages, { loggedToday })) return

          const briefMessage: ChatMessage = {
            role: 'assistant',
            content: fullText,
            kind: 'brief',
            ts: new Date().toISOString(),
          }
          await upsertConversationState({
            summary: fresh.summary,
            recent_messages: [...fresh.recent_messages, briefMessage].slice(-20),
          })
        } catch (err) {
          console.error('Failed to persist brief to conversation state:', err)
        }
      },
    }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  )
}
