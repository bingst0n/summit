import Link from 'next/link'
import type { DailyTask } from '@/lib/types'
import { getGoals, getTodayTasks, getLogsForDate, getTasksInRange, getTaskStats, getAllLogs } from '@/lib/db'
import { today, localDate, daysUntil, SEASON, seasonDay, seasonLength, seasonProgress, logStreak } from '@/lib/utils'
import TaskItem from '@/components/TaskItem'
import ElevationProfile from '@/components/ElevationProfile'

// Without this, Next prerenders the page at build time and the dashboard
// (today's tasks, logged-today banner, dates) is frozen until the next deploy.
export const dynamic = 'force-dynamic'

const CHIP = 'inline-flex items-center gap-1.5 bg-panel2 rounded-lg px-2.5 py-1 font-mono text-[10.5px] font-medium tracking-[0.05em]'

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-[12px] tracking-[0.16em] text-mut font-semibold mt-6 mb-2.5">
      {children}
    </h2>
  )
}

export default async function HomePage() {
  const date = today()
  const upcomingDays = Array.from({ length: 3 }, (_, i) => localDate(i + 1))

  const [goals, todayTasks, todayLogs, upcomingArr, taskStats, allLogs] = await Promise.all([
    getGoals(),
    getTodayTasks(date),
    getLogsForDate(date),
    getTasksInRange(upcomingDays[0], upcomingDays[upcomingDays.length - 1]),
    getTaskStats(),
    getAllLogs(),
  ])

  const goalMap = Object.fromEntries(goals.map(g => [g.id, g]))
  const loggedToday = todayLogs.length > 0
  const streak = logStreak(allLogs.map(l => l.date), date)

  const dayNum = seasonDay(date)
  const len = seasonLength()
  const fraction = seasonProgress(date)
  const pct = Math.round(fraction * 100)
  const daysLeft = Math.max(0, daysUntil(SEASON.end))
  const preSeason = dayNum === 0

  const doneCount = todayTasks.filter(t => t.completed).length
  const incomplete = todayTasks.filter(t => !t.completed)
  const nowTask = incomplete[0]
  const upNext = incomplete.slice(1)
  const cleared = todayTasks.filter(t => t.completed)

  // Per-goal progress + schedule drift (incomplete tasks dated before today).
  const stats: Record<string, { total: number; done: number; overdue: number }> = {}
  for (const t of taskStats) {
    const s = (stats[t.goal_id] ??= { total: 0, done: 0, overdue: 0 })
    s.total++
    if (t.completed) s.done++
    else if (t.date < date) s.overdue++
  }

  const upcomingTasks: Record<string, DailyTask[]> = {}
  for (const task of upcomingArr) {
    if (!upcomingTasks[task.date]) upcomingTasks[task.date] = []
    upcomingTasks[task.date].push(task)
  }
  const hasUpcoming = upcomingDays.some(d => (upcomingTasks[d]?.length ?? 0) > 0)

  const dateLabel = new Date()
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })
    .replace(',', '')
    .toUpperCase()
  const altLine = [
    dateLabel,
    todayTasks.length > 0 ? `${doneCount}/${todayTasks.length} TASKS DONE` : null,
    `${daysLeft} DAY${daysLeft === 1 ? '' : 'S'} LEFT`,
  ].filter(Boolean).join(' · ')

  return (
    <div className="px-4 pt-safe pb-24 md:pb-0">
      {/* Header */}
      <div className="pt-5 pb-4">
        <div className="flex justify-between items-center font-mono text-[11px] tracking-[0.18em] text-mut">
          <span>SUMMIT</span>
          {preSeason ? (
            <span className="text-ice">STARTS IN {daysUntil(SEASON.start)} DAY{daysUntil(SEASON.start) === 1 ? '' : 'S'}</span>
          ) : (
            streak > 0 && <span className="text-moss">● STREAK {streak}</span>
          )}
        </div>
        <h1 className="text-[32px] font-bold tracking-tight mt-2.5 leading-none">
          Day {dayNum} <span className="text-mut font-medium">/ {len}</span>
        </h1>
        <p className="font-mono text-[12.5px] text-ice mt-2.5">{altLine}</p>
      </div>

      <ElevationProfile
        fraction={fraction}
        leftLabel={`${pct}% COMPLETE`}
        rightLabel={`${daysLeft} DAY${daysLeft === 1 ? '' : 'S'} LEFT`}
      />

      <div className="md:grid md:grid-cols-5 md:gap-8 md:items-start">
        {/* Today's tasks */}
        <div className="md:col-span-3">
          {nowTask && (
            <>
              <SectionHead>NOW</SectionHead>
              <TaskItem
                task={nowTask}
                goal={goalMap[nowTask.goal_id] ?? goals[0]}
                big
                edgePct={todayTasks.length > 0 ? (doneCount / todayTasks.length) * 100 : 0}
                footer={
                  <div className="flex gap-2 mt-2.5 flex-wrap">
                    <span className={`${CHIP} text-moss`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-moss shadow-[0_0_8px_#79d49a]" />
                      IN PROGRESS
                    </span>
                    <span className={`${CHIP} text-fg/80`}>{doneCount}/{todayTasks.length} TODAY</span>
                  </div>
                }
              />
            </>
          )}

          {upNext.length > 0 && (
            <>
              <SectionHead>UP NEXT</SectionHead>
              <div className="space-y-2">
                {upNext.map(task => {
                  const goal = goalMap[task.goal_id]
                  if (!goal) return null
                  return <TaskItem key={task.id} task={task} goal={goal} />
                })}
              </div>
            </>
          )}

          {cleared.length > 0 && (
            <>
              <SectionHead>DONE</SectionHead>
              <div className="space-y-2">
                {cleared.map(task => {
                  const goal = goalMap[task.goal_id]
                  if (!goal) return null
                  return <TaskItem key={task.id} task={task} goal={goal} />
                })}
              </div>
            </>
          )}

          {todayTasks.length === 0 && goals.length > 0 && (
            <>
              <SectionHead>TODAY</SectionHead>
              <div className="bg-panel border border-line rounded-2xl p-6 text-center">
                <p className="text-mut text-sm">No tasks today — rest day.</p>
              </div>
            </>
          )}
        </div>

        {/* Goals + coming up */}
        <div className="md:col-span-2">
          {goals.length > 0 && (
            <>
              <SectionHead>GOALS</SectionHead>
              <div className="flex gap-2.5 overflow-x-auto pb-1 md:flex-col md:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {goals.map(g => {
                  const s = stats[g.id] ?? { total: 0, done: 0, overdue: 0 }
                  const pctDone = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0
                  const behind = s.overdue > 0
                  return (
                    <Link
                      key={g.id}
                      href="/calendar"
                      className="flex-none min-w-[140px] md:min-w-0 bg-panel border border-line rounded-2xl p-3 hover:border-[#2a4060] transition-colors"
                    >
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                        <span className="text-[13px] font-bold truncate">{g.title}</span>
                      </div>
                      <div className="h-[5px] rounded-full bg-[#243652] overflow-hidden">
                        <span
                          className={`block h-full rounded-full ${behind ? 'bg-gradient-to-r from-ember to-ember2' : 'bg-moss'}`}
                          style={{ width: `${pctDone}%` }}
                        />
                      </div>
                      <p className="font-mono text-[10.5px] text-mut mt-2">
                        {s.total === 0 ? (
                          <span className="text-ice">NO SCHEDULE YET</span>
                        ) : (
                          <>
                            {s.done}/{s.total} ·{' '}
                            {behind ? (
                              <span className="text-warn">{s.overdue} DAY{s.overdue === 1 ? '' : 'S'} BEHIND</span>
                            ) : (
                              <span className="text-moss">ON PACE</span>
                            )}
                          </>
                        )}
                      </p>
                    </Link>
                  )
                })}
              </div>
            </>
          )}

          {hasUpcoming && (
            <>
              <SectionHead>COMING UP</SectionHead>
              <div className="space-y-1.5">
                {upcomingDays.map(d => {
                  const count = upcomingTasks[d]?.length ?? 0
                  if (count === 0) return null
                  return (
                    <Link
                      key={d}
                      href={`/calendar?date=${d}`}
                      className="flex items-center justify-between px-3.5 py-3 rounded-xl bg-panel border border-line hover:border-[#2a4060] active:bg-panel2 transition-colors"
                    >
                      <span className="font-mono text-[11.5px] tracking-[0.06em] text-fg/85">
                        {new Date(d + 'T00:00:00')
                          .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                          .replace(',', '')
                          .toUpperCase()}
                      </span>
                      <span className="font-mono text-[10.5px] text-mut">
                        {count} TASK{count !== 1 ? 'S' : ''}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Empty state */}
      {goals.length === 0 && (
        <div className="bg-panel border border-line rounded-2xl p-8 text-center mt-6">
          <p className="text-mut text-sm mb-5">No goals yet. Talk to your advisor to add one.</p>
          <Link
            href="/advisor"
            className="inline-block bg-ember hover:bg-ember2 text-ember-ink text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
          >
            Open Advisor
          </Link>
        </div>
      )}

      {/* Check-in bar: pinned above the tab bar on mobile, inline on desktop */}
      <Link
        href="/advisor"
        className="fixed inset-x-3 above-tabbar z-30 mx-auto max-w-[400px] block md:static md:inset-auto md:max-w-none md:mt-8"
      >
        <div className="relative overflow-hidden bg-panel/95 backdrop-blur border border-line rounded-2xl px-4 pt-3 pb-3.5 shadow-[0_-12px_44px_rgba(0,0,0,0.45)] md:shadow-none md:hover:border-[#2a4060] transition-colors">
          <p className="font-mono text-[10.5px] tracking-[0.06em] text-mut">
            {loggedToday
              ? `LOGGED TODAY${streak > 0 ? ` · STREAK ${streak}` : ''}`
              : `DAILY CHECK-IN${streak > 0 ? ` · STREAK ${streak}` : ''}`}
          </p>
          <div className="flex justify-between items-center mt-1">
            <span className="font-bold text-[16px]">
              {loggedToday ? 'Logged — schedule adjusting.' : 'How did today go?'}
            </span>
            <span className="text-mut text-sm">›</span>
          </div>
          <span
            className={`glow-edge ${loggedToday ? 'moss' : ''}`}
            style={{ width: loggedToday ? '100%' : '34%' }}
          />
        </div>
      </Link>
    </div>
  )
}
