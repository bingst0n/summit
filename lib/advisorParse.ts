import type { GoalType } from './types'

export interface ParsedGoalData {
  type: GoalType
  title: string
  description: string
  deadline: string
}

export interface ParsedDeleteGoal {
  id: string
  title: string
}

export interface CheckInEntry {
  goal_id: string
  notes: string
  /** Recap says the user finished this goal's planned work today — check the task(s) off. */
  done?: boolean
}

export function extractGoalData(text: string): ParsedGoalData | null {
  const match = text.match(/<goal_data>([\s\S]*?)<\/goal_data>/)
  if (!match) return null
  try {
    return JSON.parse(match[1].trim())
  } catch {
    return null
  }
}

export function extractDeleteGoal(text: string): ParsedDeleteGoal | null {
  const match = text.match(/<delete_goal>([\s\S]*?)<\/delete_goal>/)
  if (!match) return null
  try {
    return JSON.parse(match[1].trim())
  } catch {
    return null
  }
}

export interface ParsedAppEdit {
  summary: string
  /** Raw op objects — validated server-side by /api/app-edit, not at parse time. */
  ops: unknown[]
}

export function extractAppEdit(text: string): ParsedAppEdit | null {
  const match = text.match(/<app_edit>([\s\S]*?)<\/app_edit>/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1].trim())
    if (!parsed || typeof parsed.summary !== 'string' || !parsed.summary.trim()) return null
    if (!Array.isArray(parsed.ops) || parsed.ops.length === 0) return null
    return { summary: parsed.summary.trim(), ops: parsed.ops }
  } catch {
    return null
  }
}

export function extractCheckIn(text: string): CheckInEntry[] | null {
  const match = text.match(/<check_in>([\s\S]*?)<\/check_in>/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1].trim())
    if (!Array.isArray(parsed)) return null
    const valid = parsed.filter(
      (e): e is CheckInEntry =>
        !!e && typeof e.goal_id === 'string' && typeof e.notes === 'string'
    )
    const cleaned: CheckInEntry[] = valid.map(e => ({
      goal_id: e.goal_id,
      notes: e.notes,
      ...(typeof (e as Record<string, unknown>).done === 'boolean'
        ? { done: (e as Record<string, unknown>).done as boolean }
        : {}),
    }))
    return cleaned.length > 0 ? cleaned : null
  } catch {
    return null
  }
}

export interface ParsedTrackerCreate {
  goal_id: string
  name: string
  kind: 'steps' | 'counter'
  total?: number
  unit?: string
  step_labels?: string[]
  source_url?: string
}

export interface ParsedTrackerUpdate {
  tracker_id: string
  current: number
}

export interface ParsedTrackerDelete {
  id: string
  name: string
}

// All extractors match the FIRST tag occurrence only — the advisor is instructed to emit one tag per message.
export function extractTrackerCreate(text: string): ParsedTrackerCreate[] | null {
  const match = text.match(/<tracker_create>([\s\S]*?)<\/tracker_create>/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1].trim())
    if (!Array.isArray(parsed)) return null
    const valid = parsed.filter(
      (t): t is ParsedTrackerCreate =>
        !!t &&
        typeof t.goal_id === 'string' &&
        typeof t.name === 'string' &&
        (t.kind === 'steps' || t.kind === 'counter') &&
        (typeof t.total === 'number' ||
          (Array.isArray(t.step_labels) &&
            t.step_labels.length > 0 &&
            t.step_labels.every((l: unknown) => typeof l === 'string')))
    )
    return valid.length > 0 ? valid : null
  } catch {
    return null
  }
}

export function extractTrackerUpdate(text: string): ParsedTrackerUpdate[] | null {
  const match = text.match(/<tracker_update>([\s\S]*?)<\/tracker_update>/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1].trim())
    if (!Array.isArray(parsed)) return null
    const valid = parsed.filter(
      (t): t is ParsedTrackerUpdate =>
        !!t && typeof t.tracker_id === 'string' && typeof t.current === 'number'
    )
    return valid.length > 0 ? valid : null
  } catch {
    return null
  }
}

export function extractTrackerDelete(text: string): ParsedTrackerDelete | null {
  const match = text.match(/<tracker_delete>([\s\S]*?)<\/tracker_delete>/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1].trim())
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.name !== 'string') return null
    return { id: parsed.id, name: parsed.name }
  } catch {
    return null
  }
}

export function stripTags(text: string): string {
  return text
    .replace(/<goal_data>[\s\S]*?<\/goal_data>/g, '')
    .replace(/<delete_goal>[\s\S]*?<\/delete_goal>/g, '')
    .replace(/<check_in>[\s\S]*?<\/check_in>/g, '')
    .replace(/<app_edit>[\s\S]*?<\/app_edit>/g, '')
    .replace(/<tracker_create>[\s\S]*?<\/tracker_create>/g, '')
    .replace(/<tracker_update>[\s\S]*?<\/tracker_update>/g, '')
    .replace(/<tracker_delete>[\s\S]*?<\/tracker_delete>/g, '')
    .trim()
}
