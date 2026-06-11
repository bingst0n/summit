import type { Goal, Tracker, TrackerKind } from './types'

/** Fraction complete, clamped to [0, 1]. */
export function trackerFraction(t: Pick<Tracker, 'current' | 'total'>): number {
  if (t.total <= 0) return 0
  return Math.min(Math.max(t.current / t.total, 0), 1)
}

/** Unweighted mean of tracker fractions as a whole percent. */
export function blendedPct(trackers: Array<Pick<Tracker, 'current' | 'total'>>): number {
  if (trackers.length === 0) return 0
  const sum = trackers.reduce((acc, t) => acc + trackerFraction(t), 0)
  return Math.round((sum / trackers.length) * 100)
}

/**
 * Pip-tap semantics: tapping pip n means "I'm through n" — except tapping the
 * pip that is already the position steps back one, so the tracker can be
 * walked down to zero.
 */
export function pipTapTarget(current: number, tapped: number): number {
  return Math.max(tapped === current ? tapped - 1 : tapped, 0)
}

export function clampCurrent(current: number, total: number): number {
  return Math.min(Math.max(current, 0), total)
}

/** Human name of the next step ("part 13", or the real label when known). */
export function nextStepLabel(
  t: Pick<Tracker, 'kind' | 'current' | 'total' | 'step_labels' | 'unit'>
): string | null {
  if (t.kind !== 'steps' || t.current >= t.total) return null
  const idx = Math.floor(t.current)
  const label = t.step_labels?.[idx]
  if (label) return label
  // Naive -s strip covers Summit's step nouns (parts, units, chapters…);
  // irregular nouns should use step_labels instead.
  const noun = (t.unit ?? 'parts').replace(/s$/, '')
  return `${noun} ${idx + 1}`
}

export type NewTracker = Omit<Tracker, 'id' | 'created_at' | 'updated_at'>

type Normalized<T> = { ok: true; value: T } | { ok: false; error: string }

/** Validate + canonicalize tracker input (from the advisor tag or the manual form). */
export function normalizeNewTracker(input: unknown, goalIds: Set<string>): Normalized<NewTracker> {
  if (!input || typeof input !== 'object') return { ok: false, error: 'tracker must be an object' }
  const t = input as Record<string, unknown>

  if (typeof t.goal_id !== 'string' || !goalIds.has(t.goal_id)) {
    return { ok: false, error: 'unknown goal_id' }
  }
  if (typeof t.name !== 'string' || t.name.trim().length === 0) {
    return { ok: false, error: 'name required' }
  }
  if (t.kind !== 'steps' && t.kind !== 'counter') {
    return { ok: false, error: 'kind must be "steps" or "counter"' }
  }
  const kind = t.kind as TrackerKind

  const labels =
    kind === 'steps' &&
    Array.isArray(t.step_labels) &&
    t.step_labels.length > 0 &&
    t.step_labels.every(l => typeof l === 'string')
      ? (t.step_labels as string[])
      : null

  let total = typeof t.total === 'number' && Number.isFinite(t.total) ? t.total : NaN
  if (labels) total = labels.length
  if (!Number.isFinite(total) || total < 1) return { ok: false, error: 'total must be a number >= 1' }
  if (kind === 'steps' && !Number.isInteger(total)) {
    return { ok: false, error: 'steps total must be an integer' }
  }

  const rawCurrent = typeof t.current === 'number' && Number.isFinite(t.current) ? t.current : 0
  const unit =
    typeof t.unit === 'string' && t.unit.trim()
      ? t.unit.trim()
      : kind === 'steps'
        ? 'parts'
        : null

  return {
    ok: true,
    value: {
      goal_id: t.goal_id,
      name: t.name.trim(),
      kind,
      total,
      current: clampCurrent(rawCurrent, total),
      unit,
      step_labels: labels,
      source_url: typeof t.source_url === 'string' && t.source_url ? t.source_url : null,
    },
  }
}

export type TrackerPatch = Partial<Pick<Tracker, 'current' | 'name' | 'total' | 'unit'>>

/** Validate a PATCH body against the existing row; clamps current to the (new) total. */
export function normalizeTrackerPatch(
  input: unknown,
  existing: Pick<Tracker, 'kind' | 'total' | 'current'>
): Normalized<TrackerPatch> {
  if (!input || typeof input !== 'object') return { ok: false, error: 'patch must be an object' }
  const p = input as Record<string, unknown>
  const out: TrackerPatch = {}

  if (p.total !== undefined) {
    if (typeof p.total !== 'number' || !Number.isFinite(p.total) || p.total < 1) {
      return { ok: false, error: 'total must be a number >= 1' }
    }
    if (existing.kind === 'steps' && !Number.isInteger(p.total)) {
      return { ok: false, error: 'steps total must be an integer' }
    }
    out.total = p.total
  }
  if (p.name !== undefined) {
    if (typeof p.name !== 'string' || p.name.trim().length === 0) {
      return { ok: false, error: 'name must be non-empty' }
    }
    out.name = p.name.trim()
  }
  if (p.unit !== undefined) {
    if (p.unit !== null && typeof p.unit !== 'string') {
      return { ok: false, error: 'unit must be a string or null' }
    }
    out.unit = typeof p.unit === 'string' && p.unit.trim() ? p.unit.trim() : null
  }
  if (p.current !== undefined) {
    if (typeof p.current !== 'number' || !Number.isFinite(p.current)) {
      return { ok: false, error: 'current must be a number' }
    }
    out.current = clampCurrent(p.current, out.total ?? existing.total)
  } else if (out.total !== undefined) {
    out.current = clampCurrent(existing.current, out.total)
  }

  if (Object.keys(out).length === 0) return { ok: false, error: 'no valid fields in patch' }
  return { ok: true, value: out }
}

/** Per-goal tracker listing for system prompts ([tid:] ids the advisor echoes back). */
export function buildTrackersSummary(goals: Goal[], trackers: Tracker[]): string {
  if (trackers.length === 0) return 'No trackers.'
  const lines: string[] = []
  for (const g of goals) {
    const ts = trackers.filter(t => t.goal_id === g.id)
    if (ts.length === 0) continue
    lines.push(`${g.title}:`)
    for (const t of ts) {
      const next = nextStepLabel(t)
      const unitStr = t.unit ? ` ${t.unit}` : ''
      lines.push(
        `- [tid:${t.id}] ${t.name} (${t.kind}, ${t.current}/${t.total}${unitStr}${next ? `, next: ${next}` : ''})`
      )
    }
  }
  return lines.length > 0 ? lines.join('\n') : 'No trackers.'
}
