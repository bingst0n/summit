import { NextResponse } from 'next/server'
import { upsertLog } from '@/lib/db'

export async function POST(req: Request) {
  const { date, logs } = await req.json() as {
    date: string
    logs: Array<{ goal_id: string; notes: string }>
  }
  await Promise.all(logs.map(l => upsertLog({ date, goal_id: l.goal_id, notes: l.notes })))
  return NextResponse.json({ ok: true })
}
