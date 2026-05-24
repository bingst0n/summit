'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getGoals, deleteGoal } from '@/lib/db'
import { daysUntil, formatDate } from '@/lib/utils'
import type { Goal } from '@/lib/types'

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const allGoals = await getGoals()
    setGoals(allGoals)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleDelete(goalId: string) {
    if (!confirm('Delete this goal and all its data?')) return
    await deleteGoal(goalId)
    setGoals(prev => prev.filter(g => g.id !== goalId))
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
          href="/chat"
          className="bg-indigo-500 active:bg-indigo-600 text-white text-sm font-semibold px-3 py-2 rounded-xl transition-colors"
        >
          + New
        </Link>
      </div>

      {goals.length === 0 ? (
        <div className="bg-zinc-900 rounded-2xl p-8 text-center border border-zinc-800">
          <p className="text-zinc-400 text-sm mb-4">No goals yet. Add your first one!</p>
          <Link
            href="/chat"
            className="bg-indigo-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl"
          >
            Add Goal
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map(goal => (
            <div key={goal.id} className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex-1 min-w-0 pr-3">
                    <h3 className="font-semibold">{goal.title}</h3>
                    {goal.description && (
                      <p className="text-sm text-zinc-400 mt-1">{goal.description}</p>
                    )}
                  </div>
                  <span className="text-xs text-zinc-500 shrink-0">
                    {daysUntil(goal.deadline)}d left
                  </span>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-zinc-500">Due {formatDate(goal.deadline)}</span>
                  <button
                    onClick={() => handleDelete(goal.id)}
                    className="text-xs text-red-500 active:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
