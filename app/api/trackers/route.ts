import { NextResponse } from 'next/server'
import { getGoals, getTrackers, createTrackers } from '@/lib/db'
import { normalizeNewTracker, type NewTracker } from '@/lib/tracker'

export async function GET() {
  try {
    return NextResponse.json({ trackers: await getTrackers() })
  } catch (err) {
    console.error('List trackers error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const input = body?.trackers
    if (!Array.isArray(input) || input.length === 0) {
      return NextResponse.json({ error: 'trackers array required' }, { status: 400 })
    }

    const goalIds = new Set((await getGoals()).map(g => g.id))
    const rows: NewTracker[] = []
    for (const t of input) {
      const res = normalizeNewTracker(t, goalIds)
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
      rows.push(res.value)
    }

    const created = await createTrackers(rows)
    return NextResponse.json({ trackers: created })
  } catch (err) {
    console.error('Create trackers error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
