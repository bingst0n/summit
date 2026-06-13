import type { DailyTask, Goal } from './types'

/**
 * The advisor's generic edit vocabulary. One <app_edit> tag carries an ordered
 * list of these ops; /api/app-edit validates each against live ids and
 * executes them best-effort (a failed op never aborts the rest).
 */
export interface OpTaskDelete { op: 'task_delete'; goal_id: string | null; from: string; to: string; match?: string }
export interface OpTaskShift { op: 'task_shift'; goal_id: string | null; from: string; to: string; days: number; match?: string }
export interface OpTaskAdd { op: 'task_add'; goal_id: string; date: string; description: string }
export interface OpTaskEdit { op: 'task_edit'; goal_id: string; date: string; match?: string; description: string }
export interface OpTaskComplete { op: 'task_complete'; goal_id: string; date: string; match?: string; completed: boolean }
export interface OpLightDay { op: 'light_day'; date: string; light: boolean }
export interface OpTrackerEdit { op: 'tracker_edit'; tracker_id: string; name?: string; total?: number; current?: number; unit?: string }
export interface OpGoalEdit { op: 'goal_edit'; goal_id: string; title?: string; description?: string; deadline?: string }
export interface OpRedistribute { op: 'redistribute'; goal_id: string; note?: string }

export type AppEditOp =
  | OpTaskDelete
  | OpTaskShift
  | OpTaskAdd
  | OpTaskEdit
  | OpTaskComplete
  | OpLightDay
  | OpTrackerEdit
  | OpGoalEdit
  | OpRedistribute

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_SHIFT_DAYS = 90

export interface ValidateCtx {
  goalIds: Set<string>
  trackerIds: Set<string>
}

type Validated = { ok: true; value: AppEditOp } | { ok: false; error: string }

function isDate(v: unknown): v is string {
  return typeof v === 'string' && DATE_RE.test(v)
}

function optMatch(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/**
 * Shape-validate one op against live ids. Tracker number rules (clamping,
 * steps-integer total) are deferred to normalizeTrackerPatch at execution.
 */
export function validateOp(input: unknown, ctx: ValidateCtx): Validated {
  if (!input || typeof input !== 'object') return { ok: false, error: 'op must be an object' }
  const o = input as Record<string, unknown>

  const optionalGoalId = (): { ok: boolean; id: string | null } => {
    if (o.goal_id === null || o.goal_id === undefined) return { ok: true, id: null }
    if (typeof o.goal_id === 'string' && ctx.goalIds.has(o.goal_id)) return { ok: true, id: o.goal_id }
    return { ok: false, id: null }
  }
  const requiredGoalId = (): string | null =>
    typeof o.goal_id === 'string' && ctx.goalIds.has(o.goal_id) ? o.goal_id : null

  switch (o.op) {
    case 'task_delete':
    case 'task_shift': {
      const g = optionalGoalId()
      if (!g.ok) return { ok: false, error: `${o.op}: unknown goal_id` }
      if (!isDate(o.from) || !isDate(o.to)) return { ok: false, error: `${o.op}: from/to must be YYYY-MM-DD` }
      if (o.from > o.to) return { ok: false, error: `${o.op}: from is after to` }
      if (o.op === 'task_shift') {
        if (
          typeof o.days !== 'number' ||
          !Number.isInteger(o.days) ||
          o.days === 0 ||
          Math.abs(o.days) > MAX_SHIFT_DAYS
        ) {
          return { ok: false, error: 'task_shift: days must be a non-zero integer within ±90' }
        }
        return { ok: true, value: { op: 'task_shift', goal_id: g.id, from: o.from, to: o.to, days: o.days, match: optMatch(o.match) } }
      }
      return { ok: true, value: { op: 'task_delete', goal_id: g.id, from: o.from, to: o.to, match: optMatch(o.match) } }
    }
    case 'task_add': {
      const gid = requiredGoalId()
      if (!gid) return { ok: false, error: 'task_add: unknown goal_id' }
      if (!isDate(o.date)) return { ok: false, error: 'task_add: date must be YYYY-MM-DD' }
      if (typeof o.description !== 'string' || !o.description.trim()) return { ok: false, error: 'task_add: description required' }
      return { ok: true, value: { op: 'task_add', goal_id: gid, date: o.date, description: o.description.trim() } }
    }
    case 'task_edit': {
      const gid = requiredGoalId()
      if (!gid) return { ok: false, error: 'task_edit: unknown goal_id' }
      if (!isDate(o.date)) return { ok: false, error: 'task_edit: date must be YYYY-MM-DD' }
      if (typeof o.description !== 'string' || !o.description.trim()) return { ok: false, error: 'task_edit: description required' }
      return { ok: true, value: { op: 'task_edit', goal_id: gid, date: o.date, match: optMatch(o.match), description: o.description.trim() } }
    }
    case 'task_complete': {
      const gid = requiredGoalId()
      if (!gid) return { ok: false, error: 'task_complete: unknown goal_id' }
      if (!isDate(o.date)) return { ok: false, error: 'task_complete: date must be YYYY-MM-DD' }
      if (typeof o.completed !== 'boolean') return { ok: false, error: 'task_complete: completed must be boolean' }
      return { ok: true, value: { op: 'task_complete', goal_id: gid, date: o.date, match: optMatch(o.match), completed: o.completed } }
    }
    case 'light_day': {
      if (!isDate(o.date)) return { ok: false, error: 'light_day: date must be YYYY-MM-DD' }
      if (typeof o.light !== 'boolean') return { ok: false, error: 'light_day: light must be boolean' }
      return { ok: true, value: { op: 'light_day', date: o.date, light: o.light } }
    }
    case 'tracker_edit': {
      if (typeof o.tracker_id !== 'string' || !ctx.trackerIds.has(o.tracker_id)) {
        return { ok: false, error: 'tracker_edit: unknown tracker_id' }
      }
      const value: OpTrackerEdit = { op: 'tracker_edit', tracker_id: o.tracker_id }
      if (o.name !== undefined) {
        if (typeof o.name !== 'string' || !o.name.trim()) return { ok: false, error: 'tracker_edit: name must be non-empty' }
        value.name = o.name.trim()
      }
      if (o.total !== undefined) {
        if (typeof o.total !== 'number') return { ok: false, error: 'tracker_edit: total must be a number' }
        value.total = o.total
      }
      if (o.current !== undefined) {
        if (typeof o.current !== 'number') return { ok: false, error: 'tracker_edit: current must be a number' }
        value.current = o.current
      }
      if (o.unit !== undefined) {
        if (typeof o.unit !== 'string') return { ok: false, error: 'tracker_edit: unit must be a string' }
        value.unit = o.unit
      }
      if (value.name === undefined && value.total === undefined && value.current === undefined && value.unit === undefined) {
        return { ok: false, error: 'tracker_edit: no fields to change' }
      }
      return { ok: true, value }
    }
    case 'goal_edit': {
      const gid = requiredGoalId()
      if (!gid) return { ok: false, error: 'goal_edit: unknown goal_id' }
      const value: OpGoalEdit = { op: 'goal_edit', goal_id: gid }
      if (o.title !== undefined) {
        if (typeof o.title !== 'string' || !o.title.trim()) return { ok: false, error: 'goal_edit: title must be non-empty' }
        value.title = o.title.trim()
      }
      if (o.description !== undefined) {
        if (typeof o.description !== 'string') return { ok: false, error: 'goal_edit: description must be a string' }
        value.description = o.description
      }
      if (o.deadline !== undefined) {
        if (!isDate(o.deadline)) return { ok: false, error: 'goal_edit: deadline must be YYYY-MM-DD' }
        value.deadline = o.deadline
      }
      if (value.title === undefined && value.description === undefined && value.deadline === undefined) {
        return { ok: false, error: 'goal_edit: no fields to change' }
      }
      return { ok: true, value }
    }
    case 'redistribute': {
      const gid = requiredGoalId()
      if (!gid) return { ok: false, error: 'redistribute: unknown goal_id' }
      const note = typeof o.note === 'string' && o.note.trim() ? o.note.trim() : undefined
      return { ok: true, value: { op: 'redistribute', goal_id: gid, note } }
    }
    default:
      return { ok: false, error: `unknown op "${String(o.op)}"` }
  }
}

/** Case-insensitive substring filter on task descriptions; no match = all. */
export function filterByMatch<T extends { description: string }>(tasks: T[], match?: string): T[] {
  if (!match) return tasks
  const m = match.toLowerCase()
  return tasks.filter(t => t.description.toLowerCase().includes(m))
}

/** Compact per-task listing for the advisor's upcoming-schedule context. */
export function buildUpcomingSummary(goals: Goal[], tasks: DailyTask[]): string {
  if (tasks.length === 0) return 'No upcoming tasks.'
  const titleById = new Map(goals.map(g => [g.id, g.title]))
  return tasks
    .map(t => `${t.date} (${titleById.get(t.goal_id) ?? 'unknown goal'}): ${t.description}${t.completed ? ' [done]' : ''}`)
    .join('\n')
}
