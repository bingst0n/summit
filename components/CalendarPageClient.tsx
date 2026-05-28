'use client'
import { useState, useCallback } from 'react'
import type { DailyTask, Goal } from '@/lib/types'
import CalendarGrid from '@/components/CalendarGrid'
import DaySheet from '@/components/DaySheet'

interface CalendarPageClientProps {
  initialYear: number
  initialMonth: number
  initialTasks: DailyTask[]
  initialGoals: Goal[]
  initialLightDayDates: string[]
  initialDate: string | null
}

export default function CalendarPageClient({
  initialYear,
  initialMonth,
  initialTasks,
  initialGoals,
  initialLightDayDates,
  initialDate,
}: CalendarPageClientProps) {
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [tasks, setTasks] = useState(initialTasks)
  const [goals, setGoals] = useState(initialGoals)
  const [lightDays, setLightDays] = useState(new Set(initialLightDayDates))
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate)
  const [loading, setLoading] = useState(false)

  const fetchMonth = useCallback(async (y: number, m: number) => {
    setLoading(true)
    const start = `${y}-${String(m + 1).padStart(2, '0')}-01`
    const lastDay = new Date(y, m + 1, 0).getDate()
    const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const [tasksRes, marksRes, goalsRes] = await Promise.all([
      fetch(`/api/tasks?start=${start}&end=${end}`).then(r => r.json()),
      fetch('/api/calendar-marks').then(r => r.json()),
      fetch(`/api/dashboard?date=${start}`).then(r => r.json()),
    ])

    setTasks(tasksRes.tasks ?? [])
    setLightDays(new Set((marksRes.marks ?? []).map((m: { date: string }) => m.date)))
    setGoals(goalsRes.goals ?? [])
    setLoading(false)
  }, [])

  function prevMonth() {
    const newYear = month === 0 ? year - 1 : year
    const newMonth = month === 0 ? 11 : month - 1
    setYear(newYear)
    setMonth(newMonth)
    fetchMonth(newYear, newMonth)
  }

  function nextMonth() {
    const newYear = month === 11 ? year + 1 : year
    const newMonth = month === 11 ? 0 : month + 1
    setYear(newYear)
    setMonth(newMonth)
    fetchMonth(newYear, newMonth)
  }

  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const selectedDayTasks = selectedDate ? tasks.filter(t => t.date === selectedDate) : []

  function handleLightToggle(date: string, isLight: boolean) {
    setLightDays(prev => {
      const next = new Set(prev)
      if (isLight) next.add(date)
      else next.delete(date)
      return next
    })
  }

  return (
    <div className="px-4 pt-safe pb-4">
      <div className="py-6 flex items-center justify-between">
        <button onClick={prevMonth} className="text-zinc-400 p-1 active:text-zinc-200">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className={`text-lg font-semibold transition-opacity ${loading ? 'opacity-50' : ''}`}>
          {monthLabel}
        </h1>
        <button onClick={nextMonth} className="text-zinc-400 p-1 active:text-zinc-200">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <CalendarGrid
        year={year}
        month={month}
        tasks={tasks}
        goals={goals}
        lightDays={lightDays}
        selectedDate={selectedDate}
        onSelectDate={d => setSelectedDate(prev => prev === d ? null : d)}
      />

      {selectedDate && (
        <DaySheet
          date={selectedDate}
          tasks={selectedDayTasks}
          goals={goals}
          isLight={lightDays.has(selectedDate)}
          onClose={() => setSelectedDate(null)}
          onLightToggle={handleLightToggle}
        />
      )}
    </div>
  )
}
