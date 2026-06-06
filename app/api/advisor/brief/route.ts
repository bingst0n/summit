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

export const maxDuration = 30

export async function GET() {
  const date = today()
  const time = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  })
  const horizonStr = localDate(30)

  const [goals, todayTasks, todayLogs, recentLogs, lightDays] = await Promise.all([
    getGoals(),
    getTodayTasks(date),
    getLogsForDate(date),
    getRecentLogs(7),
    getLightDays(date, horizonStr),
  ])

  const loggedToday = todayLogs.length > 0

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

  const systemPrompt = ADVISOR_BRIEF_SYSTEM({
    date,
    time,
    goals: goalsSummary,
    todayTasks: tasksSummary,
    loggedToday,
    recentLogs: logsSummary,
    lightDays: lightDaySummary,
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

        // Save brief as first assistant message in conversation_state
        try {
          const state = await getConversationState()
          const messages = [
            { role: 'assistant' as const, content: fullText },
            ...state.recent_messages,
          ]
          await upsertConversationState({
            summary: state.summary,
            recent_messages: messages.slice(0, 20),
          })
        } catch (err) {
          console.error('Failed to persist brief to conversation state:', err)
        }
      },
    }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  )
}
