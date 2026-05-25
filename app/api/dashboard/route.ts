import { NextResponse } from 'next/server'
import { getGoals, getTodayTasks, getLogsForDate } from '@/lib/db'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  try {
    const [goals, todayTasks, todayLogs] = await Promise.all([
      getGoals(),
      getTodayTasks(date),
      getLogsForDate(date),
    ])
    return NextResponse.json({ goals, todayTasks, todayLogs })
  } catch (err) {
    console.error('Dashboard fetch error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
