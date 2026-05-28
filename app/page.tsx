import Link from 'next/link'
import type { DailyTask } from '@/lib/types'
import { getGoals, getTodayTasks, getLogsForDate, getTasksInRange } from '@/lib/db'
import { today, daysUntil, SUMMER_END } from '@/lib/utils'
import TaskItem from '@/components/TaskItem'

export default async function HomePage() {
  const date = today()

  const upcomingDays = Array.from({ length: 3 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i + 1)
    return d.toISOString().split('T')[0]
  })

  const [goals, todayTasks, todayLogs, upcomingArr] = await Promise.all([
    getGoals(),
    getTodayTasks(date),
    getLogsForDate(date),
    getTasksInRange(upcomingDays[0], upcomingDays[upcomingDays.length - 1]),
  ])

  const goalMap = Object.fromEntries(goals.map(g => [g.id, g]))
  const loggedToday = todayLogs.length > 0
  const daysLeft = daysUntil(SUMMER_END)

  const upcomingTasks: Record<string, DailyTask[]> = {}
  for (const task of upcomingArr) {
    if (!upcomingTasks[task.date]) upcomingTasks[task.date] = []
    upcomingTasks[task.date].push(task)
  }

  return (
    <div className="px-4 pt-safe">
      {/* Header */}
      <div className="py-6">
        <p className="text-zinc-500 text-sm">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <h1 className="text-3xl font-bold mt-1 tracking-tight">Summit</h1>
        <p className="text-zinc-500 text-sm mt-1">{daysLeft} days left this summer</p>
      </div>

      {/* Check-in banner */}
      <div className={`rounded-2xl p-4 mb-6 border ${
        loggedToday ? 'bg-green-950/40 border-green-900/50' : 'bg-indigo-950/40 border-indigo-900/50'
      }`}>
        {loggedToday ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-green-300 text-sm">Logged for today</p>
              <p className="text-xs text-green-600 mt-0.5">Schedule adjusting in the background</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-indigo-300 text-sm">Tell the advisor how your day went</p>
              <p className="text-xs text-indigo-600 mt-0.5">Log your progress</p>
            </div>
            <Link
              href="/advisor"
              className="bg-indigo-500 active:bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              Log Now
            </Link>
          </div>
        )}
      </div>

      {/* Today's tasks */}
      {todayTasks.length > 0 && (
        <div className="mb-6">
          <h2 className="text-base font-semibold text-zinc-300 mb-3">Today</h2>
          <div className="space-y-2">
            {todayTasks.map(task => {
              const goal = goalMap[task.goal_id]
              if (!goal) return null
              return <TaskItem key={task.id} task={task} goal={goal} />
            })}
          </div>
        </div>
      )}

      {/* Coming up */}
      {upcomingDays.some(d => (upcomingTasks[d]?.length ?? 0) > 0) && (
        <div className="mb-6">
          <h2 className="text-base font-semibold text-zinc-300 mb-2">Coming up</h2>
          <div className="space-y-1">
            {upcomingDays.map(d => {
              const count = upcomingTasks[d]?.length ?? 0
              if (count === 0) return null
              return (
                <Link
                  key={d}
                  href={`/calendar?date=${d}`}
                  className="flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 active:bg-zinc-800"
                >
                  <span className="text-sm text-zinc-300">
                    {new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  <span className="text-xs text-zinc-500">{count} task{count !== 1 ? 's' : ''}</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {goals.length === 0 && (
        <div className="bg-zinc-900 rounded-2xl p-8 text-center border border-zinc-800">
          <p className="text-zinc-400 text-sm mb-4">No goals yet. Talk to the advisor to add one.</p>
          <Link
            href="/advisor"
            className="inline-block bg-indigo-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl"
          >
            Open Advisor
          </Link>
        </div>
      )}
    </div>
  )
}
