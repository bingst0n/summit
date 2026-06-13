import { describe, it, expect } from 'vitest'
import { needsBrief, toApiMessages, shouldGenerateTitle } from './conversation'
import { etHour } from './utils'
import type { ChatMessage } from './types'

// June dates are EDT (UTC-4): 13:00Z = 9 AM ET, 22:00Z = 6 PM ET, 23:00Z = 7 PM ET.
const MORNING = new Date('2026-06-07T13:00:00Z') // 9 AM ET
const AFTERNOON = new Date('2026-06-07T18:00:00Z') // 2 PM ET
const EVENING = new Date('2026-06-07T23:00:00Z') // 7 PM ET

const brief = (ts: string): ChatMessage => ({
  role: 'assistant',
  content: 'Morning! Calc derivatives are up today.',
  kind: 'brief',
  ts,
})

const userMsg = (content: string, ts?: string): ChatMessage => ({
  role: 'user',
  content,
  ...(ts ? { ts } : {}),
})

describe('etHour', () => {
  it('returns the Eastern hour, not the UTC hour', () => {
    expect(etHour(new Date('2026-06-07T22:00:00Z'))).toBe(18) // 6 PM EDT
    expect(etHour(new Date('2026-06-07T13:00:00Z'))).toBe(9)
  })

  it('returns 0 at Eastern midnight (h23, never 24)', () => {
    expect(etHour(new Date('2026-06-07T04:00:00Z'))).toBe(0)
  })

  it('handles winter standard time (UTC-5)', () => {
    expect(etHour(new Date('2026-01-07T00:00:00Z'))).toBe(19) // 7 PM EST
  })
})

describe('needsBrief', () => {
  it('briefs a brand-new conversation', () => {
    expect(needsBrief([], { now: MORNING, loggedToday: false })).toBe(true)
  })

  it('briefs when history exists but no brief was ever sent (legacy data)', () => {
    const messages: ChatMessage[] = [
      userMsg('hello'),
      { role: 'assistant', content: 'hey!' },
    ]
    expect(needsBrief(messages, { now: MORNING, loggedToday: false })).toBe(true)
  })

  it('briefs on a new day', () => {
    const messages = [brief('2026-06-06T23:00:00Z')] // yesterday evening ET
    expect(needsBrief(messages, { now: MORNING, loggedToday: false })).toBe(true)
  })

  it('does not re-brief later the same day once logged', () => {
    const messages = [brief('2026-06-07T13:00:00Z')]
    expect(needsBrief(messages, { now: EVENING, loggedToday: true })).toBe(false)
  })

  it('does not re-brief in the afternoon before the evening window', () => {
    const messages = [brief('2026-06-07T13:00:00Z')]
    expect(needsBrief(messages, { now: AFTERNOON, loggedToday: false })).toBe(false)
  })

  it('sends an evening nudge when unlogged and only briefed in the morning', () => {
    const messages = [brief('2026-06-07T13:00:00Z')]
    expect(needsBrief(messages, { now: EVENING, loggedToday: false })).toBe(true)
  })

  it('does not nudge twice in one evening', () => {
    const messages = [brief('2026-06-07T22:30:00Z')] // 6:30 PM ET brief
    expect(needsBrief(messages, { now: EVENING, loggedToday: false })).toBe(false)
  })

  it('skips the evening nudge if the user already chatted this evening', () => {
    const messages = [
      brief('2026-06-07T13:00:00Z'),
      userMsg('busy day, talk later', '2026-06-07T22:15:00Z'), // 6:15 PM ET
    ]
    expect(needsBrief(messages, { now: EVENING, loggedToday: false })).toBe(false)
  })

  it('ignores untimestamped legacy messages when checking evening activity', () => {
    const messages = [brief('2026-06-07T13:00:00Z'), userMsg('old message')]
    expect(needsBrief(messages, { now: EVENING, loggedToday: false })).toBe(true)
  })
})

describe('toApiMessages', () => {
  it('maps history and appends the new user message', () => {
    const history: ChatMessage[] = [
      userMsg('hi'),
      { role: 'assistant', content: 'hello!' },
    ]
    expect(toApiMessages(history, 'how am I doing?')).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello!' },
      { role: 'user', content: 'how am I doing?' },
    ])
  })

  it('prepends a synthetic user turn when history starts with an assistant brief', () => {
    const history = [brief('2026-06-07T13:00:00Z')]
    const result = toApiMessages(history, 'went well today')
    expect(result[0].role).toBe('user')
    expect(result[1]).toEqual({
      role: 'assistant',
      content: 'Morning! Calc derivatives are up today.',
    })
    expect(result[result.length - 1]).toEqual({ role: 'user', content: 'went well today' })
  })

  it('strips kind/ts metadata from messages sent to the API', () => {
    const history = [brief('2026-06-07T13:00:00Z')]
    const result = toApiMessages(history, 'hey')
    for (const m of result) {
      expect(Object.keys(m).sort()).toEqual(['content', 'role'])
    }
  })

  it('caps history at the last 40 messages', () => {
    const history: ChatMessage[] = Array.from({ length: 100 }, (_, i) =>
      i % 2 === 0 ? userMsg(`u${i}`) : { role: 'assistant' as const, content: `a${i}` }
    )
    const result = toApiMessages(history, 'latest')
    // 40 history + 1 new user message
    expect(result).toHaveLength(41)
    expect(result[0].content).toBe('u60')
  })

  it('drops empty messages so the API never sees blank content', () => {
    const history: ChatMessage[] = [
      userMsg('hi'),
      { role: 'assistant', content: '' },
    ]
    expect(toApiMessages(history, 'still there?')).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'user', content: 'still there?' },
    ])
  })

  it('handles an empty history', () => {
    expect(toApiMessages([], 'first message')).toEqual([
      { role: 'user', content: 'first message' },
    ])
  })
})

describe('shouldGenerateTitle', () => {
  it('returns false when a non-empty title already exists', () => {
    const messages: ChatMessage[] = [userMsg('hi'), { role: 'assistant', content: 'hey' }]
    expect(shouldGenerateTitle(messages, 'Existing title')).toBe(false)
  })

  it('returns true after the first user→assistant exchange', () => {
    const messages: ChatMessage[] = [userMsg('hi'), { role: 'assistant', content: 'hey' }]
    expect(shouldGenerateTitle(messages, null)).toBe(true)
  })

  it('returns false for a brief-only thread with no user reply yet', () => {
    expect(shouldGenerateTitle([brief('2026-06-07T13:00:00Z')], null)).toBe(false)
  })

  it('returns true for a brief thread once the user has replied', () => {
    const messages: ChatMessage[] = [
      brief('2026-06-07T13:00:00Z'),
      userMsg('went well'),
      { role: 'assistant', content: 'nice work' },
    ]
    expect(shouldGenerateTitle(messages, null)).toBe(true)
  })

  it('ignores empty-content messages', () => {
    const messages: ChatMessage[] = [userMsg('hi'), { role: 'assistant', content: '' }]
    expect(shouldGenerateTitle(messages, null)).toBe(false)
  })
})
