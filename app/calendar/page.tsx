'use client'
import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import type { DailyTask, Goal } from '@/lib/types'
import CalendarGrid from '@/components/CalendarGrid'
import DaySheet from '@/components/DaySheet'

function CalendarPageInner() {
  const searchParams = useSearchParams()
  const initialDate = searchParams.get('date') ?? null

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [tasks, setTasks] = useState<DailyTask[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [lightDays, setLightDays] = useState<Set<string>>(new Set())
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate)
  const [loading, setLoading] = useState(true)

  const fetchMonth = useCallback(async (y: number, m: number) => {
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

  useEffect(() => {
    fetchMonth(year, month)
  }, [year, month, fetchMonth])

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="px-4 pt-safe pb-4">
      <div className="py-6 flex items-center justify-between">
        <button onClick={prevMonth} className="text-zinc-400 p-1 active:text-zinc-200">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold">{monthLabel}</h1>
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

export default function CalendarPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="text-zinc-500 text-sm">Loading...</div></div>}>
      <CalendarPageInner />
    </Suspense>
  )
}
