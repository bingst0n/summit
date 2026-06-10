'use client'
import { useState, useCallback, useRef } from 'react'
import type { DailyTask, Goal } from '@/lib/types'
import { bulkLightAction } from '@/lib/utils'
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
  const [selectMode, setSelectMode] = useState(false)
  const [pickedDays, setPickedDays] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)
  const reqId = useRef(0)

  // Note: the open day is seeded from initialDate. A deep-link like
  // /calendar?date=... re-syncs because the parent keys this component on the
  // date param (remount), which avoids a setState-in-effect.

  const fetchMonth = useCallback(async (y: number, m: number) => {
    const id = ++reqId.current
    setLoading(true)
    const start = `${y}-${String(m + 1).padStart(2, '0')}-01`
    const lastDay = new Date(y, m + 1, 0).getDate()
    const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const safeJson = <T,>(r: Response): Promise<T> =>
      r.ok ? (r.json() as Promise<T>) : Promise.resolve({} as T)
    try {
      const [tasksRes, marksRes, goalsRes] = await Promise.all([
        fetch(`/api/tasks?start=${start}&end=${end}`).then(safeJson<{ tasks?: DailyTask[] }>),
        fetch('/api/calendar-marks').then(safeJson<{ marks?: { date: string }[] }>),
        fetch(`/api/dashboard?date=${start}`).then(safeJson<{ goals?: Goal[] }>),
      ])
      // Ignore a stale response if a newer month was requested meanwhile.
      if (id !== reqId.current) return
      setTasks(tasksRes.tasks ?? [])
      setLightDays(new Set((marksRes.marks ?? []).map(mk => mk.date)))
      setGoals(goalsRes.goals ?? [])
    } catch (err) {
      console.error('Calendar month fetch failed:', err)
    } finally {
      if (id === reqId.current) setLoading(false)
    }
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
  const bulkAction = bulkLightAction([...pickedDays], lightDays)

  function handleLightToggle(date: string, isLight: boolean) {
    setLightDays(prev => {
      const next = new Set(prev)
      if (isLight) next.add(date)
      else next.delete(date)
      return next
    })
  }

  function enterSelectMode() {
    setSelectMode(true)
    setSelectedDate(null) // close the day sheet
    setPickedDays(new Set())
  }

  function exitSelectMode() {
    setSelectMode(false)
    setPickedDays(new Set())
  }

  function handleDayTap(d: string) {
    if (selectMode) {
      setPickedDays(prev => {
        const next = new Set(prev)
        if (next.has(d)) next.delete(d)
        else next.add(d)
        return next
      })
    } else {
      setSelectedDate(prev => (prev === d ? null : d))
    }
  }

  async function applyBulkLight() {
    if (applying || pickedDays.size === 0) return
    const dates = [...pickedDays]
    const makeLight = bulkAction === 'mark'
    setApplying(true)
    const prev = new Set(lightDays)
    // Optimistic: converge all picked days to the target state.
    setLightDays(s => {
      const next = new Set(s)
      for (const d of dates) {
        if (makeLight) next.add(d)
        else next.delete(d)
      }
      return next
    })
    try {
      const res = await fetch('/api/calendar-marks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dates, light: makeLight }),
      })
      if (!res.ok) throw new Error(`calendar-marks bulk ${res.status}`)
      exitSelectMode()
    } catch {
      setLightDays(prev) // revert the optimistic update
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="px-4 pt-safe pb-4">
      <div className="py-6 flex items-center justify-between">
        <button onClick={prevMonth} className="text-mut p-1 hover:text-fg active:text-fg">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className={`text-lg font-semibold transition-opacity ${loading ? 'opacity-50' : ''}`}>
          {monthLabel}
        </h1>
        <button onClick={nextMonth} className="text-mut p-1 hover:text-fg active:text-fg">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Select / Cancel (bulk light-day editing) */}
      <div className="flex items-center justify-between -mt-3 mb-2 min-h-7">
        <span className="font-mono text-[10.5px] tracking-[0.06em] text-mut">
          {selectMode ? 'Tap days to select' : ''}
        </span>
        <button
          onClick={selectMode ? exitSelectMode : enterSelectMode}
          className="font-mono text-[11.5px] tracking-[0.08em] text-ember hover:text-ember2 active:text-ember2 py-1 px-1"
        >
          {selectMode ? 'Cancel' : 'Select'}
        </button>
      </div>

      <CalendarGrid
        year={year}
        month={month}
        tasks={tasks}
        goals={goals}
        lightDays={lightDays}
        selectedDate={selectedDate}
        onSelectDate={handleDayTap}
        selectMode={selectMode}
        selectedDays={pickedDays}
      />

      {selectedDate && !selectMode && (
        <DaySheet
          date={selectedDate}
          tasks={selectedDayTasks}
          goals={goals}
          isLight={lightDays.has(selectedDate)}
          onClose={() => setSelectedDate(null)}
          onLightToggle={handleLightToggle}
        />
      )}

      {/* Bulk action bar — floats above the TabBar on mobile, above the
          bottom edge (offset past the sidebar) on desktop */}
      {selectMode && pickedDays.size > 0 && (
        <div className="fixed inset-x-0 z-30 animate-sheet-up above-tabbar md:left-60">
          <div className="max-w-lg mx-auto px-4 pb-2 md:max-w-3xl">
            <div className="flex items-center justify-between bg-panel/95 backdrop-blur border border-line rounded-2xl px-4 py-3 shadow-lg">
              <span className="font-mono text-[11.5px] text-fg/85">
                {pickedDays.size} day{pickedDays.size !== 1 ? 's' : ''} selected
              </span>
              <button
                onClick={applyBulkLight}
                disabled={applying}
                className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50 ${
                  bulkAction === 'clear'
                    ? 'bg-panel2 text-fg hover:bg-line active:bg-line'
                    : 'bg-warn text-warn-ink hover:brightness-110 active:brightness-90'
                }`}
              >
                {applying ? 'Saving…' : bulkAction === 'clear' ? 'Remove light' : 'Mark as light'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
