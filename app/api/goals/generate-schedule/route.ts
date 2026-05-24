import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/claude'
import { SCHEDULE_GENERATION_SYSTEM } from '@/lib/prompts'
import { createGoal, createDailyTasks } from '@/lib/db'

export async function POST(req: Request) {
  const { goalData, rawInput } = await req.json()

  const goal = await createGoal({
    type: goalData.type,
    title: goalData.title,
    description: goalData.description ?? null,
    deadline: goalData.deadline,
    raw_input: rawInput ?? null,
  })

  if (goalData.type === 'oneshot') {
    return NextResponse.json({ goal })
  }

  const today = new Date().toISOString().split('T')[0]
  const userPrompt = `Goal: ${goalData.title}
Description: ${goalData.description ?? ''}
Deadline: ${goalData.deadline}
Daily time commitment: ${goalData.daily_minutes ?? 30} minutes
Start date: ${today}`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: SCHEDULE_GENERATION_SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  let tasks: Array<{ date: string; description: string }> = []
  try {
    tasks = JSON.parse(text)
  } catch {
    console.error('Failed to parse schedule JSON:', text)
  }

  if (tasks.length > 0) {
    await createDailyTasks(goal.id, tasks)
  }

  return NextResponse.json({ goal })
}
