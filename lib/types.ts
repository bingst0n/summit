export type Goal = {
  id: string
  title: string
  description: string | null
  deadline: string // YYYY-MM-DD
  category: string | null
  created_at: string
}

export type Milestone = {
  id: string
  goal_id: string
  title: string
  target_date: string
  completed: boolean
}

export type DailyLog = {
  id: string
  date: string // YYYY-MM-DD
  goal_id: string
  notes: string | null
  rating: number // 1-5
}
