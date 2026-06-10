/**
 * The active tracking season. Day 1 = `start`, the summit = `end`.
 * When a new season begins (e.g. the school year), swap this one object —
 * the day counter, elevation graph, percent climbed, and default goal
 * deadlines all derive from it.
 */
export const SEASON = {
  name: 'Summer',
  start: '2026-06-15',
  end: '2026-08-31',
}

const TZ = 'America/New_York'

/** Whole-day difference between two YYYY-MM-DD strings (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000)
}

/** Pure calendar arithmetic on a YYYY-MM-DD string (DST-safe). */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().split('T')[0]
}

/** Total days in the season, inclusive of both endpoints. */
export function seasonLength(): number {
  return daysBetween(SEASON.start, SEASON.end) + 1
}

/**
 * Which day of the season a date is (start = day 1), clamped to
 * [0, seasonLength()] — 0 means the season hasn't started yet.
 */
export function seasonDay(dateStr: string): number {
  return Math.min(Math.max(daysBetween(SEASON.start, dateStr) + 1, 0), seasonLength())
}

/** Fraction of the season elapsed, 0..1. */
export function seasonProgress(dateStr: string): number {
  return seasonDay(dateStr) / seasonLength()
}

/**
 * Consecutive days with a check-in, counting back from today — or from
 * yesterday if today isn't logged yet (the streak isn't broken until a full
 * day is missed).
 */
export function logStreak(logDates: Iterable<string>, todayStr: string): number {
  const days = new Set(logDates)
  let cursor = days.has(todayStr) ? todayStr : addDays(todayStr, -1)
  let n = 0
  while (days.has(cursor)) {
    n++
    cursor = addDays(cursor, -1)
  }
  return n
}

/**
 * The calendar date in America/New_York as `YYYY-MM-DD`, optionally offset by a
 * whole number of days. Anchoring to ET (not UTC) is critical: the app runs
 * server-side on Vercel (UTC), and `new Date().toISOString()` would roll over to
 * "tomorrow" after ~8 PM ET — corrupting which tasks/logs are shown and the
 * nightly check-in. `base` is injectable for testing.
 */
export function localDate(offsetDays = 0, base: Date = new Date()): string {
  const etToday = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(base)
  if (offsetDays === 0) return etToday
  return addDays(etToday, offsetDays)
}

export function today(): string {
  return localDate(0)
}

/** The current hour (0–23) in America/New_York. h23 keeps midnight at 0, not 24. */
export function etHour(date: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(date)
  )
}

export function daysUntil(dateStr: string): number {
  const ms = Date.parse(dateStr + 'T00:00:00Z') - Date.parse(today() + 'T00:00:00Z')
  return Math.round(ms / 86_400_000)
}

/**
 * Bulk light-day action semantics: if every selected day is already light,
 * the action clears them; otherwise (mixed or none) it marks them all light.
 */
export function bulkLightAction(selected: string[], lightDays: Set<string>): 'mark' | 'clear' {
  return selected.length > 0 && selected.every(d => lightDays.has(d)) ? 'clear' : 'mark'
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}
