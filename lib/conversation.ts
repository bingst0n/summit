import { localDate, etHour } from './utils'
import type { ChatMessage } from './types'

const EVENING_HOUR = 17 // 5 PM ET — when the "how did today go?" window opens

/**
 * Whether the advisor should proactively send a brief right now.
 *
 * Policy: one brief per Eastern day (the first time the app is opened), plus
 * a single evening nudge if the user was briefed in the morning but still
 * hasn't logged by 5 PM and hasn't touched the conversation since. Everything
 * else just resumes the existing conversation — no LLM call at all.
 */
export function needsBrief(
  messages: ChatMessage[],
  opts: { now?: Date; loggedToday: boolean }
): boolean {
  const now = opts.now ?? new Date()
  const todayStr = localDate(0, now)

  const lastBrief = [...messages].reverse().find(m => m.kind === 'brief' && m.ts)
  if (!lastBrief) return true

  const briefTime = new Date(lastBrief.ts!)
  if (localDate(0, briefTime) !== todayStr) return true

  // Evening nudge: unlogged, past 5 PM, last brief was a morning brief, and
  // the conversation has been quiet since the evening window opened.
  if (opts.loggedToday) return false
  if (etHour(now) < EVENING_HOUR) return false
  if (etHour(briefTime) >= EVENING_HOUR) return false

  const activeThisEvening = messages.some(m => {
    if (!m.ts) return false
    const t = new Date(m.ts)
    return localDate(0, t) === todayStr && etHour(t) >= EVENING_HOUR
  })
  return !activeThisEvening
}

/**
 * Convert stored history + the new user message into the Messages API shape:
 * metadata stripped, capped at the last 40 turns, no blank content, and a
 * guaranteed leading user turn (the API rejects assistant-first arrays, and a
 * brief-opened conversation starts with an assistant message).
 */
export function toApiMessages(
  history: ChatMessage[],
  userMessage: string
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const trimmed = history
    .slice(-40)
    .filter(m => m.content.trim().length > 0)
    .map(m => ({ role: m.role, content: m.content }))

  if (trimmed[0]?.role === 'assistant') {
    trimmed.unshift({ role: 'user', content: '(I just opened the app.)' })
  }

  return [...trimmed, { role: 'user', content: userMessage }]
}

/**
 * Whether a conversation has earned an LLM-generated title: it has none yet and
 * at least one non-empty message from each side (the first real exchange is
 * complete). Brief-seeded threads stay untitled until the user actually replies.
 */
export function shouldGenerateTitle(
  messages: ChatMessage[],
  title: string | null
): boolean {
  if (title && title.trim().length > 0) return false
  const hasUser = messages.some(m => m.role === 'user' && m.content.trim().length > 0)
  const hasAssistant = messages.some(m => m.role === 'assistant' && m.content.trim().length > 0)
  return hasUser && hasAssistant
}
