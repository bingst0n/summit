'use client'
import { useState } from 'react'
import type { DailyTask, Goal } from '@/lib/types'

interface DaySheetProps {
  date: string
  tasks: DailyTask[]
  goals: Goal[]
  isLight: boolean
  onClose: () => void
  onLightToggle: (date: string, isLight: boolean) => void
}

function formatDateHeader(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export default function DaySheet({ date, tasks, goals, isLight, onClose, onLightToggle }: DaySheetProps) {
  const [toggling, setToggling] = useState(false)
  const goalMap = Object.fromEntries(goals.map(g => [g.id, g]))

  // Controlled off the `isLight` prop (the parent's lightDays set is the single
  // source of truth), so switching days always shows that day's real state.
  async function handleLightToggle() {
    if (toggling) return
    setToggling(true)
    const optimistic = !isLight
    onLightToggle(date, optimistic) // optimistic; prop flips on parent re-render
    try {
      const res = await fetch('/api/calendar-marks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      if (!res.ok) throw new Error(`calendar-marks ${res.status}`)
      const data = await res.json()
      // Reconcile with the server's authoritative toggle result.
      if (typeof data.isLight === 'boolean' && data.isLight !== optimistic) {
        onLightToggle(date, data.isLight)
      }
    } catch {
      onLightToggle(date, isLight) // revert to the pre-toggle state
    } finally {
      setToggling(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Sheet on mobile; centered modal on desktop (day-sheet swaps the
          slide-up animation for a fade at md+ so the centering transform
          isn't fought by the keyframe). */}
      <div className="day-sheet fixed z-50 bg-zinc-900 overflow-y-auto bottom-0 inset-x-0 border-t border-zinc-800 rounded-t-2xl max-h-[70vh] md:bottom-auto md:inset-x-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[26rem] md:max-w-[calc(100vw-2rem)] md:max-h-[80vh] md:rounded-2xl md:border md:border-zinc-800 md:shadow-2xl">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-[env(safe-area-inset-bottom,24px)] md:px-5 md:pb-5">
          {/* Handle (mobile affordance only) */}
          <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-4 md:hidden" />

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-base">{formatDateHeader(date)}</h2>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-sm">Done</button>
          </div>

          {/* Light-day toggle */}
          <div className="flex items-center justify-between py-3 border-b border-zinc-800 mb-4">
            <div>
              <p className="text-sm font-medium text-zinc-200">Light day</p>
              <p className="text-xs text-zinc-500 mt-0.5">Fewer tasks scheduled by the advisor</p>
            </div>
            <button
              onClick={handleLightToggle}
              disabled={toggling}
              role="switch"
              aria-checked={isLight}
              aria-label="Light day"
              className={`w-12 h-6 rounded-full transition-colors relative ${
                isLight ? 'bg-amber-500' : 'bg-zinc-700'
              }`}
            >
              {/* left-0.5 is load-bearing: without an explicit horizontal anchor,
                  an absolutely-positioned knob falls back to its *static* position,
                  which the button's UA text-align:center puts at the track's center
                  — the knob then renders past the right edge when toggled on. */}
              <span
                className={`absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  isLight ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Tasks */}
          {tasks.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-4">No tasks scheduled</p>
          ) : (
            <div className="space-y-2">
              {tasks.map(task => {
                const goal = goalMap[task.goal_id]
                return (
                  <div key={task.id} className="flex items-start gap-3 py-2">
                    <span
                      className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                      style={{ backgroundColor: goal?.color ?? '#6366f1' }}
                    />
                    <div>
                      <p className="text-sm text-zinc-200">{task.description}</p>
                      {goal && <p className="text-xs text-zinc-500 mt-0.5">{goal.title}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
