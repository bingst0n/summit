import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/claude'
import { SCHEDULE_GENERATION_SYSTEM } from '@/lib/prompts'
import { createGoal, createDailyTasks, getGoals } from '@/lib/db'
import { today as etToday, localDate } from '@/lib/utils'

export const maxDuration = 60

const GOAL_COLORS = ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#0ea5e9']

function extractJsonArray(text: string): string {
  const trimmed = text.trim()
  if (trimmed.startsWith('[')) return trimmed
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenceMatch) return fenceMatch[1].trim()
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/)
  if (arrayMatch) return arrayMatch[0]
  return trimmed
}

export async function POST(req: Request) {
  const { goalData, rawInput } = await req.json()

  const existingGoals = await getGoals()
  const color = GOAL_COLORS[existingGoals.length % GOAL_COLORS.length]

  let goal
  try {
    goal = await createGoal({
      type: goalData.type,
      title: goalData.title,
      description: goalData.description ?? null,
      deadline: goalData.deadline,
      raw_input: rawInput ?? null,
      color,
    })
  } catch (err) {
    console.error('Failed to create goal:', err)
    return NextResponse.json({ error: 'Failed to save goal', details: String(err) }, { status: 500 })
  }

  if (goalData.type === 'oneshot') {
    return NextResponse.json({ goal })
  }

  // ET, not UTC — toISOString() rolls over to "tomorrow" after ~8 PM ET, which
  // would make the generated schedule skip today.
  const today = etToday()
  const horizonStr = localDate(30)
  const scheduleEnd = goalData.deadline < horizonStr ? goalData.deadline : horizonStr

  const userPrompt = `Goal: ${goalData.title}
Description: ${goalData.description ?? ''}
Schedule through: ${scheduleEnd}
Start date: ${today}`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: SCHEDULE_GENERATION_SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const rawText = message.content[0].type === 'text' ? message.content[0].text : '[]'
  let tasks: Array<{ date: string; description: string }> = []
  try {
    tasks = JSON.parse(extractJsonArray(rawText))
  } catch {
    console.error('Failed to parse schedule JSON. Raw LLM output:', rawText)
    return NextResponse.json({ goal, error: 'Failed to generate schedule', rawText }, { status: 500 })
  }

  console.log(`Parsed ${tasks.length} tasks, first date: ${tasks[0]?.date}`)

  try {
    if (tasks.length > 0) {
      await createDailyTasks(goal.id, tasks)
    }
  } catch (err) {
    console.error('Failed to insert tasks into daily_tasks:', err)
    return NextResponse.json({ goal, error: 'Failed to save tasks', details: String(err) }, { status: 500 })
  }

  return NextResponse.json({ goal, taskCount: tasks.length })
}
