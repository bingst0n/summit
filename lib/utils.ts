import type { Milestone } from './types'

export function today(): string {
  return new Date().toISOString().split('T')[0]
}

export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function generateMilestones(goalId: string, deadline: string): Omit<Milestone, 'id'>[] {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(deadline + 'T00:00:00')
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))

  if (totalDays <= 0) return []

  const weeks = Math.max(1, Math.ceil(totalDays / 7))
  const milestones: Omit<Milestone, 'id'>[] = []

  for (let i = 1; i <= weeks; i++) {
    const date = new Date(start)
    date.setDate(date.getDate() + Math.round((i / weeks) * totalDays))
    if (date > end) date.setTime(end.getTime())
    milestones.push({
      goal_id: goalId,
      title: `Week ${i} checkpoint`,
      target_date: date.toISOString().split('T')[0],
      completed: false,
    })
  }

  return milestones
}
