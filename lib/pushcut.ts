import { etHour, seasonDay, today } from './utils'

export type ReminderSlot = 'morning' | 'midday' | 'evening'

/**
 * Map the current ET hour to the nearest reminder slot — hour-based rather
 * than exact so a delayed cron run (GitHub Actions schedules can drift) still
 * picks the intended message.
 */
export function slotForHour(h: number): ReminderSlot {
  if (h < 11) return 'morning'
  if (h < 16) return 'midday'
  return 'evening'
}

const REMINDERS: Record<ReminderSlot, { title: (day: string) => string; text: string; path: string }> = {
  morning: {
    title: day => `Summit · ${day}`,
    text: 'Morning: lock in and start your first task before anything else.',
    path: '/',
  },
  midday: {
    title: day => `Summit · ${day}`,
    text: 'Midday check: stay focused — knock out the next task on your list.',
    path: '/',
  },
  evening: {
    title: day => `Summit · ${day}`,
    text: 'Evening: finish up your tasks, then log your day with the advisor.',
    path: '/advisor',
  },
}

export async function sendCheckinNotification(slot?: ReminderSlot) {
  const apiKey = process.env.PUSHCUT_API_KEY
  const name = process.env.PUSHCUT_NOTIFICATION_NAME
  if (!apiKey || !name) {
    throw new Error('PUSHCUT_API_KEY or PUSHCUT_NOTIFICATION_NAME is not set')
  }

  const resolved = slot ?? slotForHour(etHour())
  const day = seasonDay(today())
  const dayLabel = day > 0 ? `Day ${day}` : 'Starting soon'
  const reminder = REMINDERS[resolved]
  // Fall back to prod so a missing env var can't produce "undefined/advisor".
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lockin-lake.vercel.app'

  const res = await fetch(`https://api.pushcut.io/v1/notifications/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'API-Key': apiKey },
    body: JSON.stringify({
      title: reminder.title(dayLabel),
      text: reminder.text,
      url: `${base}${reminder.path}`,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Pushcut error: ${res.status} ${body}`)
  }

  return resolved
}
