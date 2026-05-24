'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getGoals, getLogsForDate, upsertLog } from '@/lib/db'
import { today } from '@/lib/utils'
import type { Goal } from '@/lib/types'

type LogEntry = { goal_id: string; rating: number; notes: string }

const RATING_LABELS = ['', 'Minimal', 'Some', 'Good', 'Great', 'Excellent']

export default function CheckinPage() {
  const router = useRouter()
  const [goals, setGoals] = useState<Goal[]>([])
  const [logs, setLogs] = useState<Record<string, LogEntry>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const date = today()

  useEffect(() => {
    async function load() {
      const [allGoals, existing] = await Promise.all([getGoals(), getLogsForDate(date)])
      setGoals(allGoals)

      const map: Record<string, LogEntry> = {}
      for (const log of existing) {
        map[log.goal_id] = { goal_id: log.goal_id, rating: log.rating, notes: log.notes ?? '' }
      }
      for (const g of allGoals) {
        if (!map[g.id]) map[g.id] = { goal_id: g.id, rating: 3, notes: '' }
      }
      setLogs(map)
      setLoading(false)
    }
    load()
  }, [date])

  function setRating(goalId: string, rating: number) {
    setLogs(prev => ({ ...prev, [goalId]: { ...prev[goalId], rating } }))
  }

  function setNotes(goalId: string, notes: string) {
    setLogs(prev => ({ ...prev, [goalId]: { ...prev[goalId], notes } }))
  }

  async function handleSubmit() {
    if (goals.length === 0) return
    setSaving(true)
    try {
      await Promise.all(
        goals.map(g =>
          upsertLog({
            date,
            goal_id: g.id,
            rating: logs[g.id]?.rating ?? 3,
            notes: logs[g.id]?.notes || null,
          })
        )
      )
      setDone(true)
      setTimeout(() => router.push('/'), 1800)
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
        <p className="text-zinc-500 text-sm">See you tomorrow</p>
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
        <p className="text-zinc-500 text-sm mt-1">How much work did you put in today?</p>
      </div>

      {goals.length === 0 ? (
        <div className="bg-zinc-900 rounded-2xl p-8 text-center border border-zinc-800">
          <p className="text-zinc-400 text-sm">Add some goals first before checking in.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {goals.map(goal => {
            const log = logs[goal.id] ?? { rating: 3, notes: '' }
            return (
              <div key={goal.id} className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
                <div className="flex items-start justify-between mb-1">
                  <h3 className="font-semibold">{goal.title}</h3>
                  {goal.category && (
                    <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full shrink-0 ml-2">
                      {goal.category}
                    </span>
                  )}
                </div>

                {/* Star rating */}
                <div className="flex items-center gap-1 my-3">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(goal.id, n)}
                      className={`text-2xl leading-none transition-all active:scale-110 ${
                        n <= log.rating ? 'text-yellow-400' : 'text-zinc-700'
                      }`}
                    >
                      ★
                    </button>
                  ))}
                  <span className="text-xs text-zinc-500 ml-2">{RATING_LABELS[log.rating]}</span>
                </div>

                <textarea
                  placeholder="Notes (optional)"
                  value={log.notes}
                  onChange={e => setNotes(goal.id, e.target.value)}
                  rows={2}
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
