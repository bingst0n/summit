import { NextResponse } from 'next/server'
import { runAdjustment } from '@/lib/adjust'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const goal_id = body?.goal_id
    if (!goal_id || typeof goal_id !== 'string') {
      return NextResponse.json({ error: 'goal_id required' }, { status: 400 })
    }
    const instruction = typeof body?.instruction === 'string' ? body.instruction : undefined

    const res = await runAdjustment(goal_id, instruction)
    if ('adjusted' in res) {
      return NextResponse.json({ ok: true, count: res.adjusted })
    }
    return NextResponse.json({ ok: true, skipped: res.skipped })
  } catch (err) {
    console.error('Adjust error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
