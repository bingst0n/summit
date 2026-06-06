import Link from 'next/link'
import { getAllLogs, getGoals } from '@/lib/db'
import type { DailyLog, Goal } from '@/lib/types'

interface DayEntry {
  date: string
  logs: Array<{ log: DailyLog; goal: Goal | undefined }>
}

export default async function HistoryPage() {
  const [logs, goals] = await Promise.all([getAllLogs(), getGoals()])
  const goalMap = new Map(goals.map(g => [g.id, g]))

  // getAllLogs() is already ordered date-desc, so insertion order is correct.
  const byDate = new Map<string, DayEntry>()
  for (const log of logs) {
    if (!byDate.has(log.date)) byDate.set(log.date, { date: log.date, logs: [] })
    byDate.get(log.date)!.logs.push({ log, goal: goalMap.get(log.goal_id) })
  }
  const days = Array.from(byDate.values())

  return (
    <div className="px-4 pt-safe pb-safe">
      <div className="py-6">
        <h1 className="text-3xl font-bold tracking-tight">History</h1>
        <p className="text-zinc-500 text-sm mt-1">Your check-in log</p>
      </div>

      {days.length === 0 ? (
        <div className="bg-zinc-900 rounded-2xl p-8 text-center border border-zinc-800">
          <p className="text-zinc-400 text-sm mb-4">No check-ins yet.</p>
          <Link
            href="/advisor"
            className="inline-block bg-indigo-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl"
          >
            Open Advisor
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {days.map(({ date, logs }) => (
            <div key={date}>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                {new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
              <div className="space-y-2">
                {logs.map(({ log, goal }) => (
                  <div
                    key={log.id}
                    className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800"
                  >
                    {goal && (
                      <p className="text-xs font-semibold text-indigo-400 mb-1.5">{goal.title}</p>
                    )}
                    {log.notes ? (
                      <p className="text-sm text-zinc-300 leading-relaxed">{log.notes}</p>
                    ) : (
                      <p className="text-sm text-zinc-600 italic">No notes</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
