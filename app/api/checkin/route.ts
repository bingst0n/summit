import { NextResponse } from 'next/server'
import { upsertLog } from '@/lib/db'

export async function POST(req: Request) {
  let date: string
  let logs: Array<{ goal_id: string; notes: string }>
  try {
    const body = await req.json()
    date = body.date
    logs = body.logs
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }

  if (!date || !Array.isArray(logs)) {
    return NextResponse.json({ error: 'date and logs[] required' }, { status: 400 })
  }

  const valid = logs.filter(
    l => l && typeof l.goal_id === 'string' && typeof l.notes === 'string'
  )

  // allSettled so one bad log doesn't abort the others. upsertLog is idempotent
  // (unique on date,goal_id), so a client retry after a partial failure is safe.
  const results = await Promise.allSettled(
    valid.map(l => upsertLog({ date, goal_id: l.goal_id, notes: l.notes }))
  )
  const failed = results.filter(r => r.status === 'rejected').length
  if (failed > 0) {
    console.error(`checkin: ${failed}/${valid.length} logs failed to save`)
    return NextResponse.json(
      { error: `${failed} of ${valid.length} logs failed to save`, saved: valid.length - failed },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, saved: valid.length })
}
