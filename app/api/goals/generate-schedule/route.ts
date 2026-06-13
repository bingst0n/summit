import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/claude'
import { SCHEDULE_GENERATION_SYSTEM } from '@/lib/prompts'
import { createGoal, createDailyTasks, getGoals } from '@/lib/db'
import { today as etToday, localDate, SEASON } from '@/lib/utils'

export const maxDuration = 60

// Expedition palette: ember, ice, moss, warn, violet, rose — readable as dots
// and progress bars against the ink-blue panels.
const GOAL_COLORS = ['#ff7847', '#9ecfff', '#79d49a', '#ffc46b', '#c792ea', '#f47fa4']

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
  // Never schedule before the season starts — goals created pre-season begin on Day 1.
  const today = etToday()
  const startDate = today < SEASON.start ? SEASON.start : today
  const horizonStr = localDate(30)
  const scheduleEnd = goalData.deadline < horizonStr ? goalData.deadline : horizonStr

  // Inverted window (e.g. a deadline before the season even starts): nothing to
  // schedule now. Save the goal; the adjustment loop fills it in once the season opens.
  if (scheduleEnd < startDate) {
    return NextResponse.json({ goal, taskCount: 0 })
  }

  const userPrompt = `Goal: ${goalData.title}
Description: ${goalData.description ?? ''}
Schedule through: ${scheduleEnd}
Start date: ${startDate}`

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
