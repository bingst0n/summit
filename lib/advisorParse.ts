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
    return valid.length > 0 ? valid : null
  } catch {
    return null
  }
}

export function stripTags(text: string): string {
  return text
    .replace(/<goal_data>[\s\S]*?<\/goal_data>/g, '')
    .replace(/<delete_goal>[\s\S]*?<\/delete_goal>/g, '')
    .replace(/<check_in>[\s\S]*?<\/check_in>/g, '')
    .trim()
}
