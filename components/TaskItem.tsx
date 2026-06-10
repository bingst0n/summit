'use client'
import { useState } from 'react'
import type { DailyTask, Goal } from '@/lib/types'

interface TaskItemProps {
  task: DailyTask
  goal: Goal
  /** Larger "NOW" card treatment. */
  big?: boolean
  /** 0–100: renders a glowing progress edge along the card bottom. */
  edgePct?: number
  /** Extra row (e.g. status chips) under the meta line. */
  footer?: React.ReactNode
  onToggle?: (id: string, completed: boolean) => void
}

export default function TaskItem({ task, goal, big = false, edgePct, footer, onToggle }: TaskItemProps) {
  const [completed, setCompleted] = useState(task.completed)
  const [serverValue, setServerValue] = useState(task.completed)
  const [pending, setPending] = useState(false)

  // Re-sync optimistic state when the server sends a new value (e.g. after
  // router.refresh()). React's "adjust state during render" pattern — no effect.
  if (task.completed !== serverValue) {
    setServerValue(task.completed)
    setCompleted(task.completed)
  }

  async function handleToggle() {
    if (pending) return
    const next = !completed
    setCompleted(next)
    setPending(true)
    try {
      await fetch(`/api/tasks/${task.id}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: next }),
      })
      onToggle?.(task.id, next)
    } catch {
      setCompleted(!next)
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      className={`relative overflow-hidden flex items-start gap-3 rounded-2xl border transition-colors ${
        big ? 'p-4' : 'p-3'
      } ${completed ? 'border-line/50 bg-panel/50' : 'border-line bg-panel'}`}
    >
      <button
        onClick={handleToggle}
        disabled={pending}
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          completed
            ? 'bg-ember border-ember'
            : 'border-[#3a587f] hover:border-ice'
        }`}
        aria-label={completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {completed && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#2a1006" strokeWidth="3.5">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p
          className={`leading-snug ${big ? 'text-[17px] font-bold' : 'text-sm font-medium'} ${
            completed ? 'line-through text-mut' : 'text-fg'
          }`}
        >
          {task.description}
        </p>
        <div className="flex items-center gap-1.5 mt-1.5">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: goal.color }}
          />
          <span className="font-mono text-[10.5px] tracking-[0.08em] text-mut uppercase">{goal.title}</span>
        </div>
        {footer}
      </div>

      {edgePct !== undefined && (
        <span className="glow-edge" style={{ width: `${Math.min(Math.max(edgePct, 0), 100)}%` }} />
      )}
    </div>
  )
}
