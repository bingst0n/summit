import { NextResponse } from 'next/server'
import { getCalendarMarks, toggleCalendarMark, setLightDays } from '@/lib/db'

export async function GET() {
  try {
    const marks = await getCalendarMarks()
    return NextResponse.json({ marks })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  let body: { date?: unknown; dates?: unknown; light?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }

  // Bulk form: { dates: string[], light: boolean } — sets explicitly (no toggle),
  // so mixed selections converge instead of flipping every which way.
  if (Array.isArray(body.dates)) {
    const dates = body.dates.filter(
      (d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
    )
    if (dates.length === 0 || typeof body.light !== 'boolean') {
      return NextResponse.json({ error: 'dates[] and light required' }, { status: 400 })
    }
    try {
      await setLightDays(dates, body.light)
      return NextResponse.json({ ok: true, count: dates.length, light: body.light })
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 })
    }
  }

  // Single-date toggle (used by the day sheet)
  const { date } = body
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
