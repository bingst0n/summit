import { anthropic } from './claude'
import { ADJUSTMENT_SYSTEM } from './prompts'
import {
  getGoal,
  getLogsForGoal,
  getFutureTasksForGoal,
  getTrackersForGoal,
  replaceFutureTasks,
} from './db'
import { nextStepLabel } from './tracker'

export type AdjustmentResult = { adjusted: number } | { skipped: string }

/**
 * Redistribute a goal's future tasks (tomorrow onward) via the adjustment LLM.
 * `instruction` is an explicit user request (from the app_edit redistribute op)
 * that the model follows even when the logs suggest otherwise.
 */
export async function runAdjustment(goalId: string, instruction?: string): Promise<AdjustmentResult> {
  const [goal, logs, futureTasks, trackers] = await Promise.all([
    getGoal(goalId),
    getLogsForGoal(goalId, 7),
    getFutureTasksForGoal(goalId),
    getTrackersForGoal(goalId),
  ])

  if (!goal || goal.type !== 'continuous' || futureTasks.length === 0) {
    return { skipped: 'nothing to adjust' }
  }

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: ADJUSTMENT_SYSTEM,
    messages: [{
      role: 'user',
      content: JSON.stringify({
        goal,
        logs,
        futureTasks,
        trackers: trackers.map(t => ({
          name: t.name,
          kind: t.kind,
          current: t.current,
          total: t.total,
          unit: t.unit,
          next: nextStepLabel(t),
        })),
        ...(instruction ? { instruction } : {}),
      }),
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    console.error('Failed to parse adjustment JSON:', text)
    return { skipped: 'unparseable' }
  }

  // Validate shape before touching the DB — a malformed adjustment must not be
  // allowed to wipe the existing schedule via the delete-then-insert.
  const valid = Array.isArray(parsed)
    ? parsed.filter(
        (t): t is { date: string; description: string } =>
          !!t &&
          typeof t.date === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(t.date) &&
          typeof t.description === 'string' &&
          t.description.trim().length > 0
      )
    : []

  if (valid.length === 0) {
    console.error('Adjustment produced no valid tasks; keeping existing schedule.')
    return { skipped: 'no valid tasks' }
  }

  await replaceFutureTasks(goalId, valid)
  return { adjusted: valid.length }
}
