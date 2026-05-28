import { NextResponse } from 'next/server'
import { getCalendarMarks, toggleCalendarMark } from '@/lib/db'

export async function GET() {
  try {
    const marks = await getCalendarMarks()
    return NextResponse.json({ marks })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { date } = await req.json()

  if (!date || typeof date !== 'string') {
    return NextResponse.json({ error: 'date required' }, { status: 400 })
  }

  try {
    const isLight = await toggleCalendarMark(date)
    return NextResponse.json({ ok: true, isLight })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
