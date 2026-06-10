import { describe, it, expect } from 'vitest'
import {
  localDate, today, daysUntil, bulkLightAction,
  SEASON, addDays, daysBetween, seasonLength, seasonDay, seasonProgress, logStreak,
} from './utils'

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

describe('season helpers', () => {
  it('day 1 is the season start, last day is the season end', () => {
    expect(seasonDay(SEASON.start)).toBe(1)
    expect(seasonDay(SEASON.end)).toBe(seasonLength())
  })

  it('clamps to 0 before the season and to the length after it', () => {
    expect(seasonDay(addDays(SEASON.start, -3))).toBe(0)
    expect(seasonDay(addDays(SEASON.end, 5))).toBe(seasonLength())
  })

  it('summer 2026: Jun 15 → Aug 31 is 78 days', () => {
    expect(daysBetween('2026-06-15', '2026-08-31')).toBe(77)
    expect(seasonLength()).toBe(78)
  })

  it('progress runs 0..1', () => {
    expect(seasonProgress(addDays(SEASON.start, -1))).toBe(0)
    expect(seasonProgress(SEASON.end)).toBe(1)
    const mid = seasonProgress(addDays(SEASON.start, 38))
    expect(mid).toBeGreaterThan(0.4)
    expect(mid).toBeLessThan(0.6)
  })

  it('addDays crosses months and years', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
})

describe('logStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(logStreak(['2026-06-08', '2026-06-09', '2026-06-10'], '2026-06-10')).toBe(3)
  })

  it('survives an unlogged today by counting from yesterday', () => {
    expect(logStreak(['2026-06-08', '2026-06-09'], '2026-06-10')).toBe(2)
  })

  it('breaks on a missed day', () => {
    expect(logStreak(['2026-06-06', '2026-06-07', '2026-06-09'], '2026-06-10')).toBe(1)
    expect(logStreak(['2026-06-05'], '2026-06-10')).toBe(0)
  })

  it('is 0 with no logs', () => {
    expect(logStreak([], '2026-06-10')).toBe(0)
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
