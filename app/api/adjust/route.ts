import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/claude'
import { ADJUSTMENT_SYSTEM } from '@/lib/prompts'
import { getGoal, getLogsForGoal, getFutureTasksForGoal, replaceFutureTasks } from '@/lib/db'

export async function POST(req: Request) {
  const { goal_id } = await req.json()

  const [goal, logs, futureTasks] = await Promise.all([
    getGoal(goal_id),
    getLogsForGoal(goal_id, 7),
    getFutureTasksForGoal(goal_id),
  ])

  if (!goal || goal.type !== 'continuous' || futureTasks.length === 0) {
    return NextResponse.json({ ok: true })
  }

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: ADJUSTMENT_SYSTEM,
    messages: [{
      role: 'user',
      content: JSON.stringify({ goal, logs, futureTasks }),
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  let adjustedTasks: Array<{ date: string; description: string }> = []
  try {
    adjustedTasks = JSON.parse(text)
  } catch {
    console.error('Failed to parse adjustment JSON:', text)
    return NextResponse.json({ ok: true })
  }

  await replaceFutureTasks(goal_id, adjustedTasks)

  return NextResponse.json({ ok: true })
}
