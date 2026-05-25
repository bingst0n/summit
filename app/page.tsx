'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { today, daysUntil, SUMMER_END } from '@/lib/utils'
import type { Goal, DailyTask, DailyLog } from '@/lib/types'

export default function Dashboard() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [todayTasks, setTodayTasks] = useState<DailyTask[]>([])
  const [todayLogs, setTodayLogs] = useState<DailyLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const date = today()
    fetch(`/api/dashboard?date=${date}`)
      .then(r => r.json())
      .then(({ goals: g, todayTasks: t, todayLogs: l }) => {
        setGoals(g ?? [])
        setTodayTasks(t ?? [])
        setTodayLogs(l ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const continuousGoals = goals.filter(g => g.type === 'continuous')
  const oneshotGoals = goals.filter(g => g.type === 'oneshot')
  const loggedIds = new Set(todayLogs.map(l => l.goal_id))
  const allLogged = continuousGoals.length > 0 && continuousGoals.every(g => loggedIds.has(g.id))
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
      {continuousGoals.length > 0 && (
        <div
          className={`rounded-2xl p-4 mb-6 border ${
            allLogged
              ? 'bg-green-950/40 border-green-900/50'
              : 'bg-indigo-950/40 border-indigo-900/50'
          }`}
        >
          {allLogged ? (
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
                <p className="font-semibold text-indigo-300 text-sm">Check in for today</p>
                <p className="text-xs text-indigo-600 mt-0.5">Log your progress</p>
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

      {/* Today's tasks */}
      {todayTasks.length > 0 && (
        <div className="mb-6">
          <h2 className="text-base font-semibold text-zinc-300 mb-3">Today</h2>
          <div className="space-y-2">
            {todayTasks.map(task => {
              const goal = goals.find(g => g.id === task.goal_id)
              const logged = loggedIds.has(task.goal_id)
              return (
                <div
                  key={task.id}
                  className={`bg-zinc-900 rounded-2xl p-4 border ${
                    logged ? 'border-green-900/40' : 'border-zinc-800'
                  }`}
                >
                  <p className={`text-sm leading-relaxed ${logged ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>
                    {task.description}
                  </p>
                  {goal && (
                    <p className="text-xs text-zinc-600 mt-1.5">{goal.title}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* One-shot projects queue */}
      {oneshotGoals.length > 0 && (
        <div className="mb-6">
          <h2 className="text-base font-semibold text-zinc-300 mb-3">Projects</h2>
          <div className="space-y-2">
            {oneshotGoals.map(goal => (
              <div key={goal.id} className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
                <p className="font-semibold text-sm">{goal.title}</p>
                {goal.description && (
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{goal.description}</p>
                )}
                <p className="text-xs text-zinc-600 mt-1.5">
                  Due {new Date(goal.deadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {' · '}{daysUntil(goal.deadline)}d left
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {goals.length === 0 && (
        <div className="bg-zinc-900 rounded-2xl p-8 text-center border border-zinc-800">
          <p className="text-zinc-400 text-sm mb-4">No goals yet. Add one to get started.</p>
          <Link
            href="/chat"
            className="bg-indigo-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl"
          >
            Add First Goal
          </Link>
        </div>
      )}

      {/* Footer links */}
      {goals.length > 0 && (
        <div className="flex justify-between pb-safe pt-2">
          <Link href="/history" className="text-zinc-500 text-sm font-medium">
            History
          </Link>
          <Link href="/chat" className="text-indigo-400 text-sm font-medium">
            + Add Goal
          </Link>
        </div>
      )}
    </div>
  )
}
