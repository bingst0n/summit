import { NextResponse } from 'next/server'
import {
  getGoals,
  getTrackers,
  getTracker,
  updateTracker,
  updateGoal,
  setLightDays,
  deleteTasksInRange,
  shiftTasks,
  createDailyTask,
  getTasksForGoalDate,
  updateTaskDescription,
  setTasksCompleted,
} from '@/lib/db'
import { validateOp, filterByMatch, type AppEditOp } from '@/lib/appEdit'
import { normalizeTrackerPatch } from '@/lib/tracker'
import { runAdjustment } from '@/lib/adjust'
import type { Goal } from '@/lib/types'

export const maxDuration = 60 // redistribute ops call the adjustment LLM

const MAX_OPS = 25

interface OpResult {
  ok: boolean
  detail: string
}

async function executeOp(op: AppEditOp): Promise<OpResult> {
  switch (op.op) {
    case 'task_delete': {
      const n = await deleteTasksInRange(op.goal_id, op.from, op.to, op.match)
      return { ok: true, detail: `deleted ${n} task${n === 1 ? '' : 's'}` }
    }
    case 'task_shift': {
      const n = await shiftTasks(op.goal_id, op.from, op.to, op.days, op.match)
      return { ok: true, detail: `moved ${n} task${n === 1 ? '' : 's'}` }
    }
    case 'task_add': {
      await createDailyTask(op.goal_id, op.date, op.description)
      return { ok: true, detail: `added task on ${op.date}` }
    }
    case 'task_edit': {
      const matches = filterByMatch(await getTasksForGoalDate(op.goal_id, op.date), op.match)
      if (matches.length === 0) return { ok: false, detail: `task_edit: no matching task on ${op.date}` }
      if (matches.length > 1) return { ok: false, detail: `task_edit: ${matches.length} tasks match on ${op.date} — be more specific` }
      await updateTaskDescription(matches[0].id, op.description)
      return { ok: true, detail: `edited task on ${op.date}` }
    }
    case 'task_complete': {
      const matches = filterByMatch(await getTasksForGoalDate(op.goal_id, op.date), op.match)
      if (matches.length === 0) return { ok: false, detail: `task_complete: no matching task on ${op.date}` }
      if (op.match && matches.length > 1) return { ok: false, detail: `task_complete: ${matches.length} tasks match — be more specific` }
      await setTasksCompleted(matches.map(t => t.id), op.completed)
      return { ok: true, detail: `marked ${matches.length} task${matches.length === 1 ? '' : 's'} ${op.completed ? 'done' : 'not done'}` }
    }
    case 'light_day': {
      await setLightDays([op.date], op.light)
      return { ok: true, detail: `${op.light ? 'marked' : 'unmarked'} ${op.date} as a light day` }
    }
    case 'tracker_edit': {
      const existing = await getTracker(op.tracker_id)
      if (!existing) return { ok: false, detail: 'tracker_edit: tracker not found' }
      const patch: Record<string, unknown> = {}
      if (op.name !== undefined) patch.name = op.name
      if (op.total !== undefined) patch.total = op.total
      if (op.current !== undefined) patch.current = op.current
      if (op.unit !== undefined) patch.unit = op.unit
      const res = normalizeTrackerPatch(patch, existing)
      if (!res.ok) return { ok: false, detail: `tracker_edit: ${res.error}` }
      await updateTracker(op.tracker_id, res.value)
      return { ok: true, detail: `updated tracker "${existing.name}"` }
    }
    case 'goal_edit': {
      const patch: Partial<Pick<Goal, 'title' | 'description' | 'deadline'>> = {}
      if (op.title !== undefined) patch.title = op.title
      if (op.description !== undefined) patch.description = op.description
      if (op.deadline !== undefined) patch.deadline = op.deadline
      await updateGoal(op.goal_id, patch)
      return { ok: true, detail: 'updated goal' }
    }
    case 'redistribute': {
      const res = await runAdjustment(op.goal_id, op.note)
      if ('adjusted' in res) {
        return { ok: true, detail: `rescheduled ${res.adjusted} task${res.adjusted === 1 ? '' : 's'}` }
      }
      return { ok: false, detail: `redistribute: ${res.skipped}` }
    }
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const ops = body?.ops
    if (!Array.isArray(ops) || ops.length === 0) {
      return NextResponse.json({ error: 'ops array required' }, { status: 400 })
    }
    if (ops.length > MAX_OPS) {
      return NextResponse.json({ error: `too many ops (max ${MAX_OPS})` }, { status: 400 })
    }

    const [goals, trackers] = await Promise.all([getGoals(), getTrackers()])
    const ctx = {
      goalIds: new Set(goals.map(g => g.id)),
      trackerIds: new Set(trackers.map(t => t.id)),
    }

    // Sequential, best-effort: a failed op records an error and the rest continue.
    const results: OpResult[] = []
    for (const raw of ops) {
      const v = validateOp(raw, ctx)
      if (!v.ok) {
        results.push({ ok: false, detail: v.error })
        continue
      }
      try {
        results.push(await executeOp(v.value))
      } catch (err) {
        console.error('App-edit op error:', err)
        results.push({ ok: false, detail: String(err) })
      }
    }

    const applied = results.filter(r => r.ok).length
    return NextResponse.json({ results, applied, failed: results.length - applied })
  } catch (err) {
    console.error('App-edit error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
