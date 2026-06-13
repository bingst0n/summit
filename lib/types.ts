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

export type TrackerKind = 'steps' | 'counter'

export interface Tracker {
  id: string
  goal_id: string
  name: string
  kind: TrackerKind
  /** steps: number of steps (integer). counter: the target value. */
  total: number
  /** steps: last completed position (0 = not started). counter: current value. */
  current: number
  /** counter: "tests", "problems", "%". steps: the step noun, default "parts". */
  unit: string | null
  /** steps only: optional labels, length === total. */
  step_labels: string[] | null
  /** Set when built from a pasted course link. */
  source_url: string | null
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Set on proactive daily briefs so the brief route can rate-limit itself. */
  kind?: 'brief'
  /** ISO timestamp. Absent on messages persisted before timestamps existed. */
  ts?: string
}

export interface ConversationState {
  id: number
  summary: string
  recent_messages: ChatMessage[]
  updated_at: string
}

export interface Conversation {
  id: string
  title: string | null
  messages: ChatMessage[]
  created_at: string
  updated_at: string
}

export interface ConversationSummary {
  id: string
  title: string | null
  created_at: string
  updated_at: string
  lastSnippet: string
}
