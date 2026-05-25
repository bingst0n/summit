import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/claude'
import { SCHEDULE_GENERATION_SYSTEM } from '@/lib/prompts'
import { createGoal, createDailyTasks } from '@/lib/db'

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
Start date: ${today}`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
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
