export type GoalType = 'continuous' | 'oneshot'

export interface Goal {
  id: string
  type: GoalType
  title: string
  description: string | null
  deadline: string
  raw_input: string | null
  created_at: string
}

export interface DailyTask {
  id: string
  goal_id: string
  date: string
  description: string
  created_at: string
}

export interface DailyLog {
  id: string
  date: string
  goal_id: string
  notes: string
  created_at: string
}
