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

export function daysUntil(dateStr: string): number {
  const ms = Date.parse(dateStr + 'T00:00:00Z') - Date.parse(today() + 'T00:00:00Z')
  return Math.round(ms / 86_400_000)
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}
