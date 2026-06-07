export const SUMMER_END = '2026-08-31'

const TZ = 'America/New_York'

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
  // Pure calendar arithmetic on the ET date (DST-safe — no instant math).
  const [y, m, d] = etToday.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + offsetDays)
  return dt.toISOString().split('T')[0]
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
