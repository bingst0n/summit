import { describe, it, expect } from 'vitest'
import { localDate, today, daysUntil, bulkLightAction } from './utils'

describe('localDate (America/New_York anchored)', () => {
  it('returns the Eastern date, not the UTC date, late in the evening', () => {
    // 2026-06-06T02:00:00Z is 2026-06-05 22:00 EDT (UTC-4). The UTC date is
    // already the 6th, but the Eastern calendar date is still the 5th.
    expect(localDate(0, new Date('2026-06-06T02:00:00Z'))).toBe('2026-06-05')
    expect(localDate(0, new Date('2026-06-06T03:59:00Z'))).toBe('2026-06-05')
  })

  it('rolls to the next day exactly at Eastern midnight', () => {
    // 04:00Z = 00:00 EDT
    expect(localDate(0, new Date('2026-06-06T04:00:00Z'))).toBe('2026-06-06')
  })

  it('handles winter standard time (UTC-5)', () => {
    // 2026-01-06T04:30:00Z = 2026-01-05 23:30 EST (UTC-5)
    expect(localDate(0, new Date('2026-01-06T04:30:00Z'))).toBe('2026-01-05')
  })

  it('offsets by whole calendar days from the Eastern date', () => {
    const base = new Date('2026-06-06T02:00:00Z') // Eastern: 2026-06-05
    expect(localDate(1, base)).toBe('2026-06-06')
    expect(localDate(-1, base)).toBe('2026-06-04')
    expect(localDate(30, base)).toBe('2026-07-05')
  })

  it('crosses month boundaries correctly', () => {
    const base = new Date('2026-07-01T02:00:00Z') // Eastern: 2026-06-30
    expect(localDate(0, base)).toBe('2026-06-30')
    expect(localDate(1, base)).toBe('2026-07-01')
  })

  it('always produces a YYYY-MM-DD string', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(localDate(5)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('daysUntil', () => {
  it('is 0 for today and positive for the future', () => {
    expect(daysUntil(today())).toBe(0)
    expect(daysUntil(localDate(5))).toBe(5)
    expect(daysUntil(localDate(-3))).toBe(-3)
  })
})

describe('bulkLightAction', () => {
  it('clears only when every selected day is already light', () => {
    const light = new Set(['2026-06-10', '2026-06-11'])
    expect(bulkLightAction(['2026-06-10', '2026-06-11'], light)).toBe('clear')
  })

  it('marks when the selection is mixed', () => {
    const light = new Set(['2026-06-10'])
    expect(bulkLightAction(['2026-06-10', '2026-06-12'], light)).toBe('mark')
  })

  it('marks when nothing selected is light', () => {
    expect(bulkLightAction(['2026-06-12'], new Set())).toBe('mark')
  })

  it('marks for an empty selection', () => {
    expect(bulkLightAction([], new Set(['2026-06-10']))).toBe('mark')
  })
})
