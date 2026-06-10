'use client'
import type { DailyTask, Goal } from '@/lib/types'
import { today as currentDate } from '@/lib/utils'

interface CalendarGridProps {
  year: number
  month: number  // 0-indexed (0=Jan)
  tasks: DailyTask[]
  goals: Goal[]
  lightDays: Set<string>
  selectedDate: string | null
  onSelectDate: (date: string) => void
  selectMode?: boolean
  selectedDays?: Set<string>
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export default function CalendarGrid({
  year,
  month,
  tasks,
  goals,
  lightDays,
  selectedDate,
  onSelectDate,
  selectMode = false,
  selectedDays,
}: CalendarGridProps) {
  const today = currentDate()
  const goalMap = Object.fromEntries(goals.map(g => [g.id, g]))

  // Build map: date → Set of goal colors
  const taskColors: Record<string, Set<string>> = {}
  for (const task of tasks) {
    if (!taskColors[task.date]) taskColors[task.date] = new Set()
    const goal = goalMap[task.goal_id]
    if (goal) taskColors[task.date].add(goal.color)
  }

  const firstDay = new Date(year, month, 1).getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  const dayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {dayLabels.map(d => (
          <div key={d} className="text-center font-mono text-[10px] tracking-[0.1em] text-mut/70 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />

          const dateStr = toDateStr(year, month, day)
          const isToday = dateStr === today
          const isSelected = !selectMode && dateStr === selectedDate
          const isPicked = selectMode && (selectedDays?.has(dateStr) ?? false)
          const isLight = lightDays.has(dateStr)
          const colors = taskColors[dateStr] ? Array.from(taskColors[dateStr]) : []

          return (
            <button
              key={i}
              onClick={() => onSelectDate(dateStr)}
              aria-pressed={selectMode ? isPicked : undefined}
              className={`relative flex flex-col items-center py-2 md:py-3 rounded-lg transition-colors ${
                isPicked
                  ? 'bg-ice/15 ring-2 ring-ice'
                  : isSelected
                  ? 'bg-ember'
                  : isLight
                  ? 'bg-warn/10 hover:bg-warn/15'
                  : 'hover:bg-panel2/70 active:bg-panel2'
              }`}
            >
              <span
                className={`text-sm font-medium leading-none ${
                  isSelected
                    ? 'text-ember-ink font-bold'
                    : isToday
                    ? 'text-ember'
                    : 'text-fg/80'
                }`}
              >
                {day}
              </span>
              {isLight && !isSelected && (
                <span className="text-[8px] font-mono text-warn leading-none mt-0.5">light</span>
              )}
              {colors.length > 0 && (
                <div className="flex gap-0.5 mt-1">
                  {colors.slice(0, 4).map((color, ci) => (
                    <span
                      key={ci}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
