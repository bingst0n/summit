'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getGoals, getMilestones, toggleMilestone, deleteGoal } from '@/lib/db'
import { daysUntil, formatDate } from '@/lib/utils'
import type { Goal, Milestone } from '@/lib/types'

type GoalWithMilestones = Goal & { milestones: Milestone[] }

export default function GoalsPage() {
  const [goals, setGoals] = useState<GoalWithMilestones[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  async function load() {
    const allGoals = await getGoals()
    const withMilestones = await Promise.all(
      allGoals.map(async g => ({ ...g, milestones: await getMilestones(g.id) }))
    )
    setGoals(withMilestones)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleToggle(goalId: string, milestoneId: string, completed: boolean) {
    await toggleMilestone(milestoneId, completed)
    setGoals(prev =>
      prev.map(g =>
        g.id === goalId
          ? { ...g, milestones: g.milestones.map(m => m.id === milestoneId ? { ...m, completed } : m) }
          : g
      )
    )
  }

  async function handleDelete(goalId: string) {
    if (!confirm('Delete this goal and all its data?')) return
    await deleteGoal(goalId)
    setGoals(prev => prev.filter(g => g.id !== goalId))
    setExpanded(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="px-4 pt-safe">
      <div className="py-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Goals</h1>
        <Link
          href="/goals/new"
          className="bg-indigo-500 active:bg-indigo-600 text-white text-sm font-semibold px-3 py-2 rounded-xl transition-colors"
        >
          + New
        </Link>
      </div>

      {goals.length === 0 ? (
        <div className="bg-zinc-900 rounded-2xl p-8 text-center border border-zinc-800">
          <p className="text-zinc-400 text-sm mb-4">No goals yet. Add your first one!</p>
          <Link
            href="/goals/new"
            className="bg-indigo-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl"
          >
            Add Goal
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map(goal => {
            const completed = goal.milestones.filter(m => m.completed).length
            const total = goal.milestones.length
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0
            const isExpanded = expanded === goal.id

            return (
              <div key={goal.id} className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
                <button
                  className="w-full p-4 text-left active:bg-zinc-800 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : goal.id)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0 pr-3">
                      <h3 className="font-semibold">{goal.title}</h3>
                      {goal.category && (
                        <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full mt-1.5 inline-block">
                          {goal.category}
                        </span>
                      )}
                    </div>
                    <span className="text-zinc-600 text-xs mt-0.5">{isExpanded ? '▲' : '▼'}</span>
                  </div>

                  <div className="w-full bg-zinc-800 rounded-full h-1.5 mb-1.5">
                    <div
                      className="bg-indigo-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>{completed}/{total} milestones · {pct}%</span>
                    <span>Due {formatDate(goal.deadline)} · {daysUntil(goal.deadline)}d</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-zinc-800 px-4 pb-4 pt-3">
                    {goal.description && (
                      <p className="text-sm text-zinc-400 mb-4">{goal.description}</p>
                    )}

                    {total === 0 ? (
                      <p className="text-sm text-zinc-600">No milestones generated.</p>
                    ) : (
                      <>
                        <p className="text-xs text-zinc-600 font-medium uppercase tracking-wider mb-2">
                          Milestones
                        </p>
                        <div className="space-y-2.5">
                          {goal.milestones.map(m => (
                            <label key={m.id} className="flex items-start gap-3 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={m.completed}
                                onChange={e => handleToggle(goal.id, m.id, e.target.checked)}
                                className="w-4 h-4 mt-0.5 rounded accent-indigo-500 shrink-0"
                              />
                              <div>
                                <span
                                  className={`text-sm leading-tight block ${
                                    m.completed ? 'line-through text-zinc-600' : 'text-zinc-200'
                                  }`}
                                >
                                  {m.title}
                                </span>
                                <span className="text-xs text-zinc-600">{formatDate(m.target_date)}</span>
                              </div>
                            </label>
                          ))}
                        </div>
                      </>
                    )}

                    <button
                      onClick={() => handleDelete(goal.id)}
                      className="mt-5 text-xs text-red-500 active:text-red-400"
                    >
                      Delete goal
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
