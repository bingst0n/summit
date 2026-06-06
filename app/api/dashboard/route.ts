import { NextResponse } from 'next/server'
import { getGoals, getTodayTasks, getLogsForDate } from '@/lib/db'
import { today } from '@/lib/utils'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? today()

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
