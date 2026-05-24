'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getGoals, getLogsForDate, getTodayTasks } from '@/lib/db'
import { today } from '@/lib/utils'
import type { Goal, DailyTask } from '@/lib/types'

export default function CheckinPage() {
  const router = useRouter()
  const [goals, setGoals] = useState<Goal[]>([])
  const [todayTasks, setTodayTasks] = useState<DailyTask[]>([])
  const [logs, setLogs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const date = today()

  useEffect(() => {
    async function load() {
      const [allGoals, existing, tasks] = await Promise.all([
        getGoals(),
        getLogsForDate(date),
        getTodayTasks(date),
      ])
      setGoals(allGoals)
      setTodayTasks(tasks)
      const map: Record<string, string> = {}
      for (const log of existing) map[log.goal_id] = log.notes
      for (const g of allGoals) if (!map[g.id]) map[g.id] = ''
      setLogs(map)
      setLoading(false)
    }
    load()
  }, [date])

  async function handleSubmit() {
    setSaving(true)
    try {
      await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          logs: goals.map(g => ({ goal_id: g.id, notes: logs[g.id] ?? '' })),
        }),
      })
      // Fire-and-forget schedule adjustment for continuous goals
      goals
        .filter(g => g.type === 'continuous')
        .forEach(g => {
          fetch('/api/adjust', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goal_id: g.id }),
          }).catch(() => {})
        })
      setDone(true)
      setTimeout(() => router.push('/'), 1500)
    } catch {
      alert('Failed to save. Try again.')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="w-20 h-20 bg-green-500/20 border border-green-500/40 rounded-full flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-xl font-bold">Logged!</p>
        <p className="text-zinc-500 text-sm">Schedule adjusting in the background</p>
      </div>
    )
  }

  return (
    <div className="px-4 pt-safe">
      <div className="py-6">
        <p className="text-zinc-500 text-sm">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <h1 className="text-3xl font-bold mt-1 tracking-tight">Check In</h1>
        <p className="text-zinc-500 text-sm mt-1">What did you work on today?</p>
      </div>

      {goals.length === 0 ? (
        <div className="bg-zinc-900 rounded-2xl p-8 text-center border border-zinc-800">
          <p className="text-zinc-400 text-sm">Add some goals first before checking in.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {goals.map(goal => {
            const task = todayTasks.find(t => t.goal_id === goal.id)
            return (
              <div key={goal.id} className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-sm">{goal.title}</h3>
                  <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded-full">
                    {goal.type}
                  </span>
                </div>
                {task && (
                  <p className="text-xs text-indigo-400 mb-3 leading-relaxed">{task.description}</p>
                )}
                <textarea
                  placeholder="What did you do? What didn't happen? Anything come up?"
                  value={logs[goal.id] ?? ''}
                  onChange={e => setLogs(prev => ({ ...prev, [goal.id]: e.target.value }))}
                  rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm placeholder:text-zinc-600 outline-none resize-none transition-colors"
                />
              </div>
            )
          })}

          <div className="pb-safe pt-2">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="w-full bg-indigo-500 active:bg-indigo-600 text-white font-semibold py-4 rounded-2xl disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Check-in'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
