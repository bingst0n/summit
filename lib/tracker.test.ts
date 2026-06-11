import { describe, it, expect } from 'vitest'
import {
  trackerFraction,
  blendedPct,
  pipTapTarget,
  clampCurrent,
  nextStepLabel,
  normalizeNewTracker,
  normalizeTrackerPatch,
  buildTrackersSummary,
} from './tracker'
import type { Goal, Tracker } from './types'

const steps = (over: Partial<Tracker> = {}): Tracker => ({
  id: 't1',
  goal_id: 'g1',
  name: 'Module 21',
  kind: 'steps',
  total: 22,
  current: 12,
  unit: 'parts',
  step_labels: null,
  source_url: null,
  created_at: '',
  updated_at: '',
  ...over,
})

const counter = (over: Partial<Tracker> = {}): Tracker => ({
  ...steps({ id: 't2', name: 'Practice tests', kind: 'counter', total: 10, current: 4, unit: 'tests' }),
  ...over,
})

describe('trackerFraction', () => {
  it('divides current by total', () => {
    expect(trackerFraction({ current: 12, total: 22 })).toBeCloseTo(12 / 22)
  })
  it('clamps to [0, 1]', () => {
    expect(trackerFraction({ current: 15, total: 10 })).toBe(1)
    expect(trackerFraction({ current: -3, total: 10 })).toBe(0)
  })
  it('returns 0 for non-positive total', () => {
    expect(trackerFraction({ current: 5, total: 0 })).toBe(0)
  })
})

describe('blendedPct', () => {
  it('averages fractions equally and rounds', () => {
    // 0.5 and 1.0 -> 75
    expect(blendedPct([{ current: 5, total: 10 }, { current: 4, total: 4 }])).toBe(75)
  })
  it('returns 0 for no trackers', () => {
    expect(blendedPct([])).toBe(0)
  })
})

describe('pipTapTarget', () => {
  it('tapping a pip sets position to it', () => {
    expect(pipTapTarget(12, 15)).toBe(15)
    expect(pipTapTarget(12, 3)).toBe(3)
  })
  it('tapping the current pip steps back one', () => {
    expect(pipTapTarget(12, 12)).toBe(11)
  })
  it('tapping pip 1 at position 1 clears to 0', () => {
    expect(pipTapTarget(1, 1)).toBe(0)
  })
})

describe('clampCurrent', () => {
  it('clamps into [0, total]', () => {
    expect(clampCurrent(-2, 10)).toBe(0)
    expect(clampCurrent(12, 10)).toBe(10)
    expect(clampCurrent(7, 10)).toBe(7)
  })
})

describe('nextStepLabel', () => {
  it('names the next part from the unit noun', () => {
    expect(nextStepLabel(steps())).toBe('part 13')
  })
  it('uses the label when step_labels exist', () => {
    const t = steps({ total: 3, current: 1, step_labels: ['Intro', 'Limits', 'Derivatives'] })
    expect(nextStepLabel(t)).toBe('Limits')
  })
  it('returns null when complete or not steps', () => {
    expect(nextStepLabel(steps({ current: 22 }))).toBeNull()
    expect(nextStepLabel(counter())).toBeNull()
  })
})

describe('normalizeNewTracker', () => {
  const goalIds = new Set(['g1'])

  it('accepts a minimal counter', () => {
    const res = normalizeNewTracker(
      { goal_id: 'g1', name: ' Practice tests ', kind: 'counter', total: 10, unit: 'tests' },
      goalIds
    )
    expect(res).toEqual({
      ok: true,
      value: {
        goal_id: 'g1',
        name: 'Practice tests',
        kind: 'counter',
        total: 10,
        current: 0,
        unit: 'tests',
        step_labels: null,
        source_url: null,
      },
    })
  })
  it('defaults steps unit to parts and derives total from labels', () => {
    const res = normalizeNewTracker(
      { goal_id: 'g1', name: 'Units', kind: 'steps', total: 99, step_labels: ['a', 'b', 'c'] },
      goalIds
    )
    expect(res.ok && res.value.total).toBe(3)
    expect(res.ok && res.value.unit).toBe('parts')
    expect(res.ok && res.value.step_labels).toEqual(['a', 'b', 'c'])
  })
  it('accepts steps without labels when total is an integer', () => {
    const res = normalizeNewTracker({ goal_id: 'g1', name: 'M21', kind: 'steps', total: 22 }, goalIds)
    expect(res.ok && res.value.total).toBe(22)
  })
  it('rejects non-integer steps total', () => {
    const res = normalizeNewTracker({ goal_id: 'g1', name: 'M21', kind: 'steps', total: 2.5 }, goalIds)
    expect(res.ok).toBe(false)
  })
  it('clamps current into range', () => {
    const res = normalizeNewTracker(
      { goal_id: 'g1', name: 'x', kind: 'counter', total: 10, current: 99 },
      goalIds
    )
    expect(res.ok && res.value.current).toBe(10)
  })
  it('rejects unknown goal, bad kind, empty name, missing total', () => {
    expect(normalizeNewTracker({ goal_id: 'nope', name: 'x', kind: 'steps', total: 5 }, goalIds).ok).toBe(false)
    expect(normalizeNewTracker({ goal_id: 'g1', name: 'x', kind: 'list', total: 5 }, goalIds).ok).toBe(false)
    expect(normalizeNewTracker({ goal_id: 'g1', name: '  ', kind: 'steps', total: 5 }, goalIds).ok).toBe(false)
    expect(normalizeNewTracker({ goal_id: 'g1', name: 'x', kind: 'counter' }, goalIds).ok).toBe(false)
    expect(normalizeNewTracker(null, goalIds).ok).toBe(false)
  })
})

describe('normalizeTrackerPatch', () => {
  const existing = { kind: 'steps' as const, total: 22, current: 12 }

  it('passes through a current update, clamped', () => {
    expect(normalizeTrackerPatch({ current: 13 }, existing)).toEqual({ ok: true, value: { current: 13 } })
    expect(normalizeTrackerPatch({ current: 99 }, existing)).toEqual({ ok: true, value: { current: 22 } })
  })
  it('re-clamps current when total shrinks', () => {
    expect(normalizeTrackerPatch({ total: 10 }, existing)).toEqual({ ok: true, value: { total: 10, current: 10 } })
  })
  it('trims name and rejects empty', () => {
    expect(normalizeTrackerPatch({ name: ' New ' }, existing)).toEqual({ ok: true, value: { name: 'New' } })
    expect(normalizeTrackerPatch({ name: '  ' }, existing).ok).toBe(false)
  })
  it('rejects non-integer steps total and junk input', () => {
    expect(normalizeTrackerPatch({ total: 2.5 }, existing).ok).toBe(false)
    expect(normalizeTrackerPatch({}, existing).ok).toBe(false)
    expect(normalizeTrackerPatch(null, existing).ok).toBe(false)
  })
})

describe('buildTrackersSummary', () => {
  const goals = [
    { id: 'g1', title: 'Math Modules' } as Goal,
    { id: 'g2', title: 'SAT Prep' } as Goal,
  ]

  it('groups by goal with tids, state, and next label', () => {
    const out = buildTrackersSummary(goals, [steps(), counter({ goal_id: 'g2' })])
    expect(out).toBe(
      'Math Modules:\n' +
        '- [tid:t1] Module 21 (steps, 12/22 parts, next: part 13)\n' +
        'SAT Prep:\n' +
        '- [tid:t2] Practice tests (counter, 4/10 tests)'
    )
  })
  it('says so when there are none', () => {
    expect(buildTrackersSummary(goals, [])).toBe('No trackers.')
  })
  it('skips goals without trackers', () => {
    expect(buildTrackersSummary(goals, [steps()])).not.toContain('SAT Prep')
  })
})
