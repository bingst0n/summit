import { describe, it, expect } from 'vitest'
import { validateOp, filterByMatch, buildUpcomingSummary, type ValidateCtx } from './appEdit'
import type { DailyTask, Goal } from './types'

const ctx: ValidateCtx = { goalIds: new Set(['g1']), trackerIds: new Set(['t1']) }

const task = (over: Partial<DailyTask> = {}): DailyTask => ({
  id: 'tk1',
  goal_id: 'g1',
  date: '2026-06-13',
  description: 'M21 parts 10-12',
  completed: false,
  created_at: '',
  ...over,
})

describe('validateOp: task_delete / task_shift', () => {
  it('accepts a range delete for all goals (goal_id null)', () => {
    expect(validateOp({ op: 'task_delete', goal_id: null, from: '2026-06-10', to: '2026-06-14' }, ctx)).toEqual({
      ok: true,
      value: { op: 'task_delete', goal_id: null, from: '2026-06-10', to: '2026-06-14', match: undefined },
    })
  })
  it('accepts a scoped delete with match', () => {
    const res = validateOp({ op: 'task_delete', goal_id: 'g1', from: '2026-06-13', to: '2026-06-13', match: ' SAT ' }, ctx)
    expect(res.ok && res.value).toEqual({ op: 'task_delete', goal_id: 'g1', from: '2026-06-13', to: '2026-06-13', match: 'SAT' })
  })
  it('rejects unknown goal, bad dates, inverted range', () => {
    expect(validateOp({ op: 'task_delete', goal_id: 'nope', from: '2026-06-10', to: '2026-06-14' }, ctx).ok).toBe(false)
    expect(validateOp({ op: 'task_delete', goal_id: null, from: 'June 10', to: '2026-06-14' }, ctx).ok).toBe(false)
    expect(validateOp({ op: 'task_delete', goal_id: null, from: '2026-06-15', to: '2026-06-14' }, ctx).ok).toBe(false)
  })
  it('accepts a shift and bounds days', () => {
    expect(validateOp({ op: 'task_shift', goal_id: null, from: '2026-06-12', to: '2026-06-14', days: 3 }, ctx).ok).toBe(true)
    expect(validateOp({ op: 'task_shift', goal_id: null, from: '2026-06-12', to: '2026-06-14', days: 0 }, ctx).ok).toBe(false)
    expect(validateOp({ op: 'task_shift', goal_id: null, from: '2026-06-12', to: '2026-06-14', days: 2.5 }, ctx).ok).toBe(false)
    expect(validateOp({ op: 'task_shift', goal_id: null, from: '2026-06-12', to: '2026-06-14', days: 91 }, ctx).ok).toBe(false)
  })
})

describe('validateOp: task_add / task_edit / task_complete', () => {
  it('accepts and trims task_add', () => {
    const res = validateOp({ op: 'task_add', goal_id: 'g1', date: '2026-06-20', description: ' Timed SAT section ' }, ctx)
    expect(res.ok && res.value).toEqual({ op: 'task_add', goal_id: 'g1', date: '2026-06-20', description: 'Timed SAT section' })
  })
  it('task_add requires a known goal, valid date, non-empty description', () => {
    expect(validateOp({ op: 'task_add', goal_id: null, date: '2026-06-20', description: 'x' }, ctx).ok).toBe(false)
    expect(validateOp({ op: 'task_add', goal_id: 'g1', date: 'tomorrow', description: 'x' }, ctx).ok).toBe(false)
    expect(validateOp({ op: 'task_add', goal_id: 'g1', date: '2026-06-20', description: '  ' }, ctx).ok).toBe(false)
  })
  it('accepts task_edit and task_complete', () => {
    expect(validateOp({ op: 'task_edit', goal_id: 'g1', date: '2026-06-13', match: 'M21', description: 'New text' }, ctx).ok).toBe(true)
    expect(validateOp({ op: 'task_complete', goal_id: 'g1', date: '2026-06-13', completed: true }, ctx).ok).toBe(true)
    expect(validateOp({ op: 'task_complete', goal_id: 'g1', date: '2026-06-13', completed: 'yes' }, ctx).ok).toBe(false)
  })
})

describe('validateOp: light_day / tracker_edit / goal_edit / redistribute', () => {
  it('accepts light_day, rejects non-boolean', () => {
    expect(validateOp({ op: 'light_day', date: '2026-06-20', light: true }, ctx).ok).toBe(true)
    expect(validateOp({ op: 'light_day', date: '2026-06-20', light: 'yes' }, ctx).ok).toBe(false)
  })
  it('tracker_edit requires a known tracker and at least one field', () => {
    expect(validateOp({ op: 'tracker_edit', tracker_id: 't1', total: 25 }, ctx).ok).toBe(true)
    expect(validateOp({ op: 'tracker_edit', tracker_id: 't1' }, ctx).ok).toBe(false)
    expect(validateOp({ op: 'tracker_edit', tracker_id: 'nope', total: 25 }, ctx).ok).toBe(false)
    expect(validateOp({ op: 'tracker_edit', tracker_id: 't1', name: '  ' }, ctx).ok).toBe(false)
  })
  it('goal_edit requires a known goal and at least one field, valid deadline', () => {
    expect(validateOp({ op: 'goal_edit', goal_id: 'g1', deadline: '2026-08-15' }, ctx).ok).toBe(true)
    expect(validateOp({ op: 'goal_edit', goal_id: 'g1' }, ctx).ok).toBe(false)
    expect(validateOp({ op: 'goal_edit', goal_id: 'g1', deadline: 'August' }, ctx).ok).toBe(false)
  })
  it('redistribute requires a known goal; note optional and trimmed', () => {
    const res = validateOp({ op: 'redistribute', goal_id: 'g1', note: ' lighter weekends ' }, ctx)
    expect(res.ok && res.value).toEqual({ op: 'redistribute', goal_id: 'g1', note: 'lighter weekends' })
    expect(validateOp({ op: 'redistribute', goal_id: 'zzz' }, ctx).ok).toBe(false)
  })
  it('rejects unknown ops and junk', () => {
    expect(validateOp({ op: 'drop_table' }, ctx).ok).toBe(false)
    expect(validateOp(null, ctx).ok).toBe(false)
    expect(validateOp('delete stuff', ctx).ok).toBe(false)
  })
})

describe('filterByMatch', () => {
  const tasks = [task(), task({ id: 'tk2', description: 'SAT reading drill' })]
  it('case-insensitive substring filter', () => {
    expect(filterByMatch(tasks, 'sat')).toHaveLength(1)
    expect(filterByMatch(tasks, 'sat')[0].id).toBe('tk2')
  })
  it('no match returns all', () => {
    expect(filterByMatch(tasks)).toHaveLength(2)
    expect(filterByMatch(tasks, undefined)).toHaveLength(2)
  })
})

describe('buildUpcomingSummary', () => {
  const goals = [{ id: 'g1', title: 'Math modules' } as Goal]
  it('formats one line per task with [done] marker', () => {
    const out = buildUpcomingSummary(goals, [task(), task({ id: 'tk2', date: '2026-06-14', description: 'M21 parts 13-15', completed: true })])
    expect(out).toBe(
      '2026-06-13 (Math modules): M21 parts 10-12\n' +
      '2026-06-14 (Math modules): M21 parts 13-15 [done]'
    )
  })
  it('handles empty', () => {
    expect(buildUpcomingSummary(goals, [])).toBe('No upcoming tasks.')
  })
})
