import { getGoals, getTasksInRange, getCalendarMarks } from '@/lib/db'
import { today } from '@/lib/utils'
import CalendarPageClient from '@/components/CalendarPageClient'

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams

  // Anchor the visible month on the deep-linked date when present (a "Coming
  // up" link can point into next month), otherwise on today in ET — the server
  // runs in UTC, so new Date().getMonth() shows the wrong month between 8 PM
  // and midnight ET at a month boundary.
  const anchor = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today()
  const [year, monthNum] = anchor.split('-').map(Number)
  const month = monthNum - 1

  const start = `${year}-${String(monthNum).padStart(2, '0')}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const end = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const [tasks, marks, goals] = await Promise.all([
    getTasksInRange(start, end),
    getCalendarMarks(),
    getGoals(),
  ])

  return (
    <CalendarPageClient
      key={date ?? 'default'}
      initialYear={year}
      initialMonth={month}
      initialTasks={tasks}
      initialGoals={goals}
      initialLightDayDates={marks.map(m => m.date)}
      initialDate={date ?? null}
    />
  )
}
