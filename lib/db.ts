import { supabase, supabaseServer } from './supabase'
import type { Goal, DailyTask, DailyLog, CalendarMark, ConversationState } from './types'

function db() {
  if (typeof window === 'undefined' && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return supabaseServer()
  }
  return supabase
}

export async function getGoals(): Promise<Goal[]> {
  const { data } = await db().from('goals').select('*').order('created_at')
  return data ?? []
}

export async function getGoal(id: string): Promise<Goal | null> {
  const { data } = await db().from('goals').select('*').eq('id', id).single()
  return data
}

export async function createGoal(
  goal: Omit<Goal, 'id' | 'created_at'>
): Promise<Goal> {
  const { data, error } = await db().from('goals').insert(goal).select().single()
  if (error) throw error
  return data
}

export async function deleteGoal(id: string) {
  const { error } = await db().from('goals').delete().eq('id', id)
  if (error) throw error
}

export async function getTodayTasks(date: string): Promise<DailyTask[]> {
  const { data } = await db()
    .from('daily_tasks')
    .select('*')
    .eq('date', date)
    .order('created_at')
  return data ?? []
}

export async function getTasksInRange(start: string, end: string): Promise<DailyTask[]> {
  const { data } = await db()
    .from('daily_tasks')
    .select('*')
    .gte('date', start)
    .lte('date', end)
    .order('date')
  return data ?? []
}

export async function completeTask(id: string, completed: boolean) {
  const { error } = await db()
    .from('daily_tasks')
    .update({ completed })
    .eq('id', id)
  if (error) throw error
}

export async function createDailyTasks(
  goalId: string,
  tasks: Array<{ date: string; description: string }>
) {
  const rows = tasks.map(t => ({
    goal_id: goalId,
    date: t.date,
    description: t.description,
  }))
  const { error } = await db().from('daily_tasks').insert(rows)
  if (error) throw error
}

export async function getFutureTasksForGoal(goalId: string): Promise<DailyTask[]> {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const date = tomorrow.toISOString().split('T')[0]
  const { data } = await db()
    .from('daily_tasks')
    .select('*')
    .eq('goal_id', goalId)
    .gte('date', date)
    .order('date')
  return data ?? []
}

export async function replaceFutureTasks(
  goalId: string,
  tasks: Array<{ date: string; description: string }>
) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const date = tomorrow.toISOString().split('T')[0]
  const { error: delErr } = await db()
    .from('daily_tasks')
    .delete()
    .eq('goal_id', goalId)
    .gte('date', date)
  if (delErr) throw delErr
  if (tasks.length === 0) return
  const rows = tasks.map(t => ({
    goal_id: goalId,
    date: t.date,
    description: t.description,
  }))
  const { error } = await db().from('daily_tasks').insert(rows)
  if (error) throw error
}

export async function getLogsForDate(date: string): Promise<DailyLog[]> {
  const { data } = await db().from('daily_logs').select('*').eq('date', date)
  return data ?? []
}

export async function getLogsForGoal(goalId: string, days: number): Promise<DailyLog[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const date = since.toISOString().split('T')[0]
  const { data } = await db()
    .from('daily_logs')
    .select('*')
    .eq('goal_id', goalId)
    .gte('date', date)
    .order('date', { ascending: false })
  return data ?? []
}

export async function getAllLogs(): Promise<DailyLog[]> {
  const { data } = await db()
    .from('daily_logs')
    .select('*')
    .order('date', { ascending: false })
  return data ?? []
}

export async function getRecentLogs(days: number): Promise<DailyLog[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const date = since.toISOString().split('T')[0]
  const { data } = await db()
    .from('daily_logs')
    .select('*')
    .gte('date', date)
    .order('date', { ascending: false })
  return data ?? []
}

export async function upsertLog(log: {
  date: string
  goal_id: string
  notes: string
}) {
  const { error } = await db()
    .from('daily_logs')
    .upsert(log, { onConflict: 'date,goal_id' })
  if (error) throw error
}

export async function getCalendarMarks(): Promise<CalendarMark[]> {
  const { data } = await db()
    .from('calendar_marks')
    .select('*')
    .order('date')
  return data ?? []
}

export async function getLightDays(start: string, end: string): Promise<string[]> {
  const { data } = await db()
    .from('calendar_marks')
    .select('date')
    .gte('date', start)
    .lte('date', end)
  return (data ?? []).map((r: { date: string }) => r.date)
}

export async function toggleCalendarMark(date: string): Promise<boolean> {
  const { data: existing } = await db()
    .from('calendar_marks')
    .select('date')
    .eq('date', date)
    .single()

  if (existing) {
    const { error } = await db().from('calendar_marks').delete().eq('date', date)
    if (error) throw error
    return false
  } else {
    const { error } = await db().from('calendar_marks').insert({ date, capacity: 'light' })
    if (error) throw error
    return true
  }
}

export async function getConversationState(): Promise<ConversationState> {
  const { data } = await db()
    .from('conversation_state')
    .select('*')
    .eq('id', 1)
    .single()
  return data ?? { id: 1, summary: '', recent_messages: [], updated_at: new Date().toISOString() }
}

export async function upsertConversationState(
  state: Pick<ConversationState, 'summary' | 'recent_messages'>
) {
  const { error } = await db()
    .from('conversation_state')
    .upsert({ id: 1, ...state, updated_at: new Date().toISOString() })
  if (error) throw error
}
