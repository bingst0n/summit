'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getGoals, getLogsForDate, getMilestones } from '@/lib/db'
import { today, daysUntil, formatDate } from '@/lib/utils'
import type { Goal, DailyLog, Milestone } from '@/lib/types'

type GoalWithData = Goal & { milestones: Milestone[]; todayLog?: DailyLog }

const SUMMER_END = '2025-08-31'

export default function Dashboard() {
  const [goals, setGoals] = useState<GoalWithData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [allGoals, todayLogs] = await Promise.all([
        getGoals(),
        getLogsForDate(today()),
      ])
      const goalsWithData = await Promise.all(
        allGoals.map(async g => ({
          ...g,
          milestones: await getMilestones(g.id),
          todayLog: todayLogs.find(l => l.goal_id === g.id),
        }))
      )
      setGoals(goalsWithData)
      setLoading(false)
    }
    load()
  }, [])

  const checkedInToday = goals.length > 0 && goals.every(g => g.todayLog)
  const daysLeft = daysUntil(SUMMER_END)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    )
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
      {goals.length > 0 && (
        <div
          className={`rounded-2xl p-4 mb-6 border ${
            checkedInToday
              ? 'bg-green-950/40 border-green-900/50'
              : 'bg-indigo-950/40 border-indigo-900/50'
          }`}
        >
          {checkedInToday ? (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-green-300 text-sm">Logged for today</p>
                <p className="text-xs text-green-600 mt-0.5">Great work — keep it up</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-indigo-300 text-sm">Check in for today</p>
                <p className="text-xs text-indigo-600 mt-0.5">Log your daily progress</p>
              </div>
              <Link
                href="/checkin"
                className="bg-indigo-500 active:bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                Log Now
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Goals section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-300">Goals</h2>
          <Link href="/goals/new" className="text-indigo-400 text-sm font-medium">
            + Add
          </Link>
        </div>

        {goals.length === 0 ? (
          <div className="bg-zinc-900 rounded-2xl p-8 text-center border border-zinc-800">
            <p className="text-zinc-400 text-sm mb-4">No goals yet. Add one to get started.</p>
            <Link
              href="/goals/new"
              className="bg-indigo-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl"
            >
              Add First Goal
            </Link>
          </div>
        ) : (
          goals.map(goal => {
            const completed = goal.milestones.filter(m => m.completed).length
            const total = goal.milestones.length
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0
            const nextMilestone = goal.milestones.find(m => !m.completed)

            return (
              <Link
                key={goal.id}
                href="/goals"
                className="block bg-zinc-900 rounded-2xl p-4 border border-zinc-800 active:bg-zinc-800 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 pr-3">
                    <h3 className="font-semibold truncate">{goal.title}</h3>
                    {goal.category && (
                      <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full mt-1.5 inline-block">
                        {goal.category}
                      </span>
                    )}
                  </div>
                  {goal.todayLog ? (
                    <span className="text-yellow-400 text-lg shrink-0">
                      {'★'.repeat(goal.todayLog.rating)}{'☆'.repeat(5 - goal.todayLog.rating)}
                    </span>
                  ) : (
                    <span className="text-zinc-600 text-lg shrink-0">{'☆'.repeat(5)}</span>
                  )}
                </div>

                <div className="w-full bg-zinc-800 rounded-full h-1.5 mb-2">
                  <div
                    className="bg-indigo-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>{completed}/{total} milestones · {pct}%</span>
                  <span>{daysUntil(goal.deadline)}d left</span>
                </div>

                {nextMilestone && (
                  <p className="text-xs text-zinc-600 mt-1.5">
                    Next: {nextMilestone.title} · {formatDate(nextMilestone.target_date)}
                  </p>
                )}
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
