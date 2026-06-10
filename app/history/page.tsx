import Link from 'next/link'
import { getAllLogs, getGoals } from '@/lib/db'
import type { DailyLog, Goal } from '@/lib/types'

// Without this, Next prerenders the page at build time and new check-ins
// never appear until the next deploy.
export const dynamic = 'force-dynamic'

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
        <p className="font-mono text-[11px] tracking-[0.18em] text-mut">📓 LOGBOOK</p>
        <h1 className="text-3xl font-bold tracking-tight mt-1">History</h1>
      </div>

      {days.length === 0 ? (
        <div className="bg-panel rounded-2xl p-8 text-center border border-line">
          <p className="text-mut text-sm mb-4">Nothing in the logbook yet.</p>
          <Link
            href="/advisor"
            className="inline-block bg-ember hover:bg-ember2 text-ember-ink text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
          >
            Open Advisor
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {days.map(({ date, logs }) => (
            <div key={date}>
              <p className="font-mono text-[10.5px] font-semibold text-mut uppercase tracking-[0.14em] mb-2">
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
                    className="bg-panel rounded-2xl p-4 border border-line"
                  >
                    {goal && (
                      <p className="font-mono text-[10.5px] tracking-[0.08em] text-ice uppercase mb-1.5">{goal.title}</p>
                    )}
                    {log.notes ? (
                      <p className="text-sm text-fg/85 leading-relaxed">{log.notes}</p>
                    ) : (
                      <p className="text-sm text-mut/70 italic">No notes</p>
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
