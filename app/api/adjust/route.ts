import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/claude'
import { ADJUSTMENT_SYSTEM } from '@/lib/prompts'
import { getGoal, getLogsForGoal, getFutureTasksForGoal, replaceFutureTasks, getTrackersForGoal } from '@/lib/db'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const { goal_id } = await req.json()
    if (!goal_id || typeof goal_id !== 'string') {
      return NextResponse.json({ error: 'goal_id required' }, { status: 400 })
    }

    const [goal, logs, futureTasks, trackers] = await Promise.all([
      getGoal(goal_id),
      getLogsForGoal(goal_id, 7),
      getFutureTasksForGoal(goal_id),
      getTrackersForGoal(goal_id),
    ])

    if (!goal || goal.type !== 'continuous' || futureTasks.length === 0) {
      return NextResponse.json({ ok: true })
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: ADJUSTMENT_SYSTEM,
      messages: [{
        role: 'user',
        content: JSON.stringify({
          goal,
          logs,
          futureTasks,
          trackers: trackers.map(t => ({
            name: t.name,
            kind: t.kind,
            current: t.current,
            total: t.total,
            unit: t.unit,
          })),
        }),
      }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      console.error('Failed to parse adjustment JSON:', text)
      return NextResponse.json({ ok: true, skipped: 'unparseable' })
    }

    // Validate shape before touching the DB — a malformed adjustment must not be
    // allowed to wipe the existing schedule via the delete-then-insert.
    const valid = Array.isArray(parsed)
      ? parsed.filter(
          (t): t is { date: string; description: string } =>
            !!t &&
            typeof t.date === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(t.date) &&
            typeof t.description === 'string' &&
            t.description.trim().length > 0
        )
      : []

    if (valid.length === 0) {
      console.error('Adjustment produced no valid tasks; keeping existing schedule.')
      return NextResponse.json({ ok: true, skipped: 'no valid tasks' })
    }

    await replaceFutureTasks(goal_id, valid)
    return NextResponse.json({ ok: true, count: valid.length })
  } catch (err) {
    console.error('Adjust error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
