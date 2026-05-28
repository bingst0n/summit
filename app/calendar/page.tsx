import { getGoals, getTasksInRange, getCalendarMarks } from '@/lib/db'
import CalendarPageClient from '@/components/CalendarPageClient'

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  const start = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const [tasks, marks, goals] = await Promise.all([
    getTasksInRange(start, end),
    getCalendarMarks(),
    getGoals(),
  ])

  return (
    <CalendarPageClient
      initialYear={year}
      initialMonth={month}
      initialTasks={tasks}
      initialGoals={goals}
      initialLightDayDates={marks.map(m => m.date)}
      initialDate={date ?? null}
    />
  )
}
