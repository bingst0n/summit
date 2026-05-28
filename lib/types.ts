export type GoalType = 'continuous' | 'oneshot'

export interface Goal {
  id: string
  type: GoalType
  title: string
  description: string | null
  deadline: string
  raw_input: string | null
  color: string
  created_at: string
}

export interface DailyTask {
  id: string
  goal_id: string
  date: string
  description: string
  completed: boolean
  created_at: string
}

export interface DailyLog {
  id: string
  date: string
  goal_id: string
  notes: string
  created_at: string
}

export interface CalendarMark {
  date: string
  capacity: 'light'
  created_at: string
}

export interface ConversationState {
  id: number
  summary: string
  recent_messages: Array<{ role: 'user' | 'assistant'; content: string }>
  updated_at: string
}
