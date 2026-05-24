import { supabase } from './supabase'
import type { Goal, DailyLog, Milestone } from './types'

export async function getGoals(): Promise<Goal[]> {
  const { data } = await supabase.from('goals').select('*').order('deadline')
  return data ?? []
}

export async function createGoal(goal: Omit<Goal, 'id' | 'created_at'>): Promise<Goal> {
  const { data, error } = await supabase.from('goals').insert(goal).select().single()
  if (error) throw error
  return data
}

export async function deleteGoal(id: string) {
  const { error } = await supabase.from('goals').delete().eq('id', id)
  if (error) throw error
}

export async function getMilestones(goalId: string): Promise<Milestone[]> {
  const { data } = await supabase
    .from('milestones')
    .select('*')
    .eq('goal_id', goalId)
    .order('target_date')
  return data ?? []
}

export async function createMilestones(milestones: Omit<Milestone, 'id'>[]) {
  const { error } = await supabase.from('milestones').insert(milestones)
  if (error) throw error
}

export async function toggleMilestone(id: string, completed: boolean) {
  const { error } = await supabase.from('milestones').update({ completed }).eq('id', id)
  if (error) throw error
}

export async function getLogsForDate(date: string): Promise<DailyLog[]> {
  const { data } = await supabase.from('daily_logs').select('*').eq('date', date)
  return data ?? []
}

export async function upsertLog(log: { date: string; goal_id: string; notes: string | null; rating: number }) {
  const { error } = await supabase
    .from('daily_logs')
    .upsert(log, { onConflict: 'date,goal_id' })
  if (error) throw error
}
