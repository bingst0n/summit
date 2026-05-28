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
  const [lightState, setLightState] = useState(isLight)
  const [toggling, setToggling] = useState(false)
  const goalMap = Object.fromEntries(goals.map(g => [g.id, g]))

  async function handleLightToggle() {
    if (toggling) return
    setToggling(true)
    const next = !lightState
    setLightState(next)
    try {
      await fetch('/api/calendar-marks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      onLightToggle(date, next)
    } catch {
      setLightState(!next)
    } finally {
      setToggling(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 inset-x-0 z-50 bg-zinc-900 border-t border-zinc-800 rounded-t-2xl max-h-[70vh] overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-[env(safe-area-inset-bottom,24px)]">
          {/* Handle */}
          <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-4" />

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-base">{formatDateHeader(date)}</h2>
            <button onClick={onClose} className="text-zinc-500 text-sm">Done</button>
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
              className={`w-12 h-6 rounded-full transition-colors relative ${
                lightState ? 'bg-amber-500' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  lightState ? 'translate-x-[26px]' : 'translate-x-0.5'
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
