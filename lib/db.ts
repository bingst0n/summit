import { supabase, supabaseServer } from './supabase'
import { localDate, addDays } from './utils'
import { filterByMatch } from './appEdit'
import { stripTags } from './advisorParse'
import type { Goal, DailyTask, DailyLog, CalendarMark, Conversation, ConversationSummary, ChatMessage, Tracker } from './types'

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

export async function updateGoal(
  id: string,
  patch: Partial<Pick<Goal, 'title' | 'description' | 'deadline'>>
) {
  const { error } = await db().from('goals').update(patch).eq('id', id)
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
  const date = localDate(1)
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
  const date = localDate(1)
  if (tasks.length === 0) return // never wipe the schedule with nothing to replace it

  // Snapshot the current future tasks so a failed insert can be rolled back
  // instead of leaving the goal with no schedule at all.
  const { data: snapshot } = await db()
    .from('daily_tasks')
    .select('date, description')
    .eq('goal_id', goalId)
    .gte('date', date)

  const { error: delErr } = await db()
    .from('daily_tasks')
    .delete()
    .eq('goal_id', goalId)
    .gte('date', date)
  if (delErr) throw delErr

  const rows = tasks.map(t => ({
    goal_id: goalId,
    date: t.date,
    description: t.description,
  }))
  const { error } = await db().from('daily_tasks').insert(rows)
  if (error) {
    // Restore the snapshot so the check-in doesn't destroy the existing plan.
    if (snapshot && snapshot.length > 0) {
      await db()
        .from('daily_tasks')
        .insert(snapshot.map(t => ({ goal_id: goalId, date: t.date, description: t.description })))
    }
    throw error
  }
}

/** Slim columns for computing per-goal progress + drift on the dashboard. */
export async function getTaskStats(): Promise<Array<Pick<DailyTask, 'goal_id' | 'date' | 'completed'>>> {
  const { data } = await db()
    .from('daily_tasks')
    .select('goal_id, date, completed')
  return data ?? []
}

/** Delete incomplete tasks in [from, to] (all goals when goalId is null). Returns count. */
export async function deleteTasksInRange(
  goalId: string | null,
  from: string,
  to: string,
  match?: string
): Promise<number> {
  let q = db().from('daily_tasks').select('id, description, completed').gte('date', from).lte('date', to)
  if (goalId) q = q.eq('goal_id', goalId)
  const { data } = await q
  const targets = filterByMatch((data ?? []).filter(t => !t.completed), match)
  if (targets.length === 0) return 0
  const { error } = await db().from('daily_tasks').delete().in('id', targets.map(t => t.id))
  if (error) throw error
  return targets.length
}

/** Shift incomplete tasks in [from, to] by `days`. Returns count. */
export async function shiftTasks(
  goalId: string | null,
  from: string,
  to: string,
  days: number,
  match?: string
): Promise<number> {
  let q = db().from('daily_tasks').select('id, date, description, completed').gte('date', from).lte('date', to)
  if (goalId) q = q.eq('goal_id', goalId)
  const { data } = await q
  const targets = filterByMatch((data ?? []).filter(t => !t.completed), match)
  for (const t of targets) {
    const { error } = await db().from('daily_tasks').update({ date: addDays(t.date, days) }).eq('id', t.id)
    if (error) throw error
  }
  return targets.length
}

export async function createDailyTask(goalId: string, date: string, description: string) {
  const { error } = await db().from('daily_tasks').insert({ goal_id: goalId, date, description })
  if (error) throw error
}

export async function getTasksForGoalDate(goalId: string, date: string): Promise<DailyTask[]> {
  const { data } = await db()
    .from('daily_tasks')
    .select('*')
    .eq('goal_id', goalId)
    .eq('date', date)
    .order('created_at')
  return data ?? []
}

export async function updateTaskDescription(id: string, description: string) {
  const { error } = await db().from('daily_tasks').update({ description }).eq('id', id)
  if (error) throw error
}

export async function setTasksCompleted(ids: string[], completed: boolean) {
  if (ids.length === 0) return
  const { error } = await db().from('daily_tasks').update({ completed }).in('id', ids)
  if (error) throw error
}

export async function getLogsForDate(date: string): Promise<DailyLog[]> {
  const { data } = await db().from('daily_logs').select('*').eq('date', date)
  return data ?? []
}

export async function getLogsForGoal(goalId: string, days: number): Promise<DailyLog[]> {
  const date = localDate(-days)
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
  const date = localDate(-days)
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

export async function setLightDays(dates: string[], light: boolean) {
  if (dates.length === 0) return
  if (light) {
    const rows = dates.map(date => ({ date, capacity: 'light' as const }))
    const { error } = await db()
      .from('calendar_marks')
      .upsert(rows, { onConflict: 'date', ignoreDuplicates: true })
    if (error) throw error
  } else {
    const { error } = await db().from('calendar_marks').delete().in('date', dates)
    if (error) throw error
  }
}

export async function getTrackers(): Promise<Tracker[]> {
  const { data } = await db().from('trackers').select('*').order('created_at')
  return data ?? []
}

export async function getTrackersForGoal(goalId: string): Promise<Tracker[]> {
  const { data } = await db()
    .from('trackers')
    .select('*')
    .eq('goal_id', goalId)
    .order('created_at')
  return data ?? []
}

export async function getTracker(id: string): Promise<Tracker | null> {
  const { data } = await db().from('trackers').select('*').eq('id', id).single()
  return data
}

export async function createTrackers(
  rows: Array<Omit<Tracker, 'id' | 'created_at' | 'updated_at'>>
): Promise<Tracker[]> {
  const { data, error } = await db().from('trackers').insert(rows).select()
  if (error) throw error
  return data ?? []
}

export async function updateTracker(
  id: string,
  patch: Partial<Pick<Tracker, 'current' | 'name' | 'total' | 'unit'>>
): Promise<Tracker> {
  const { data, error } = await db()
    .from('trackers')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTracker(id: string) {
  const { error } = await db().from('trackers').delete().eq('id', id)
  if (error) throw error
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const { data } = await db()
    .from('conversations')
    .select('id,title,messages,created_at,updated_at')
    .order('updated_at', { ascending: false })
  return (data ?? []).map(row => {
    const msgs = (row.messages as ChatMessage[]) ?? []
    const last = msgs[msgs.length - 1]
    return {
      id: row.id as string,
      title: (row.title as string | null) ?? null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      lastSnippet: last ? stripTags(last.content).trim().slice(0, 80) : '',
    }
  })
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const { data } = await db().from('conversations').select('*').eq('id', id).single()
  return (data as Conversation) ?? null
}

export async function createConversation(seed: ChatMessage[] = []): Promise<Conversation> {
  const { data, error } = await db()
    .from('conversations')
    .insert({ messages: seed })
    .select()
    .single()
  if (error) throw error
  return data as Conversation
}

// Re-reads before writing so a concurrent append (e.g. a brief landing in the
// same row) isn't clobbered, mirroring the old single-row write discipline.
export async function appendMessages(id: string, msgs: ChatMessage[]): Promise<void> {
  const { data } = await db().from('conversations').select('messages').eq('id', id).single()
  const existing = (data?.messages as ChatMessage[]) ?? []
  const { error } = await db()
    .from('conversations')
    .update({ messages: [...existing, ...msgs], updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function setConversationTitle(id: string, title: string): Promise<void> {
  const { error } = await db().from('conversations').update({ title, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await db().from('conversations').delete().eq('id', id)
  if (error) throw error
}

// Flattened, ts-sorted message list across all conversations — the brief gate
// (needsBrief) only inspects the latest brief and any activity "this evening",
// both of which survive flattening once sorted chronologically.
export async function getAllConversationMessages(): Promise<ChatMessage[]> {
  const { data } = await db().from('conversations').select('messages')
  const all = (data ?? []).flatMap(r => (r.messages as ChatMessage[]) ?? [])
  return all.sort((a, b) =>
    (a.ts ?? '') < (b.ts ?? '') ? -1 : (a.ts ?? '') > (b.ts ?? '') ? 1 : 0
  )
}
