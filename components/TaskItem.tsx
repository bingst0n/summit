'use client'
import { useState } from 'react'
import type { DailyTask, Goal } from '@/lib/types'

interface TaskItemProps {
  task: DailyTask
  goal: Goal
  onToggle?: (id: string, completed: boolean) => void
}

export default function TaskItem({ task, goal, onToggle }: TaskItemProps) {
  const [completed, setCompleted] = useState(task.completed)
  const [pending, setPending] = useState(false)

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
      className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
        completed ? 'border-zinc-800/50 bg-zinc-900/50' : 'border-zinc-800 bg-zinc-900'
      }`}
    >
      <button
        onClick={handleToggle}
        disabled={pending}
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          completed
            ? 'border-transparent'
            : 'border-zinc-600'
        }`}
        style={completed ? { backgroundColor: goal.color } : {}}
        aria-label={completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {completed && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-relaxed ${completed ? 'line-through text-zinc-500' : 'text-zinc-200'}`}>
          {task.description}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: goal.color }}
          />
          <span className="text-xs text-zinc-500">{goal.title}</span>
        </div>
      </div>
    </div>
  )
}
