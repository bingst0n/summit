import { supabase } from './supabase'
import type { Goal, DailyTask, DailyLog } from './types'

export async function getGoals(): Promise<Goal[]> {
  const { data } = await supabase.from('goals').select('*').order('created_at')
  return data ?? []
}

export async function getGoal(id: string): Promise<Goal | null> {
  const { data } = await supabase.from('goals').select('*').eq('id', id).single()
  return data
}

export async function createGoal(
  goal: Omit<Goal, 'id' | 'created_at'>
): Promise<Goal> {
  const { data, error } = await supabase.from('goals').insert(goal).select().single()
  if (error) throw error
  return data
}

export async function deleteGoal(id: string) {
  const { error } = await supabase.from('goals').delete().eq('id', id)
  if (error) throw error
}

export async function getTodayTasks(date: string): Promise<DailyTask[]> {
  const { data } = await supabase
    .from('daily_tasks')
    .select('*')
    .eq('date', date)
    .order('created_at')
  return data ?? []
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
  const { error } = await supabase.from('daily_tasks').insert(rows)
  if (error) throw error
}

export async function getFutureTasksForGoal(goalId: string): Promise<DailyTask[]> {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const date = tomorrow.toISOString().split('T')[0]
  const { data } = await supabase
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
  const { error: delErr } = await supabase
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
  const { error } = await supabase.from('daily_tasks').insert(rows)
  if (error) throw error
}

export async function getLogsForDate(date: string): Promise<DailyLog[]> {
  const { data } = await supabase.from('daily_logs').select('*').eq('date', date)
  return data ?? []
}

export async function getLogsForGoal(goalId: string, days: number): Promise<DailyLog[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const date = since.toISOString().split('T')[0]
  const { data } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('goal_id', goalId)
    .gte('date', date)
    .order('date', { ascending: false })
  return data ?? []
}

export async function upsertLog(log: {
  date: string
  goal_id: string
  notes: string
}) {
  const { error } = await supabase
    .from('daily_logs')
    .upsert(log, { onConflict: 'date,goal_id' })
  if (error) throw error
}
