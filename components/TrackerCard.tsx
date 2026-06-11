'use client'
import { useState } from 'react'
import type { Tracker } from '@/lib/types'
import { pipTapTarget, clampCurrent, trackerFraction, nextStepLabel } from '@/lib/tracker'

interface TrackerCardProps {
  tracker: Tracker
  /** Apply an updated row to the page's tracker list (optimistic + server echo). */
  onSaved: (t: Tracker) => void
  onDelete: (id: string) => void
}

export default function TrackerCard({ tracker, onSaved, onDelete }: TrackerCardProps) {
  const [pending, setPending] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editingValue, setEditingValue] = useState(false)
  const [error, setError] = useState(false)

  async function patch(body: Record<string, unknown>) {
    if (pending) return
    setPending(true)
    setError(false)
    onSaved({ ...tracker, ...body } as Tracker) // optimistic
    try {
      const res = await fetch(`/api/trackers/${tracker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      const { tracker: updated } = await res.json()
      onSaved(updated) // server echo (clamped values win)
    } catch {
      onSaved(tracker) // revert
      setError(true)
    } finally {
      setPending(false)
    }
  }

  function commitValue(raw: string) {
    setEditingValue(false)
    const n = Number(raw)
    if (!Number.isFinite(n) || n === tracker.current) return
    patch({ current: clampCurrent(n, tracker.total) })
  }

  const next = nextStepLabel(tracker)

  return (
    <div className="bg-panel border border-line rounded-2xl p-3.5 mb-2">
      <div className="flex items-baseline gap-2 mb-2.5">
        <span className="text-[14px] font-bold">{tracker.name}</span>
        {error && <span className="text-warn text-[10px] font-mono">SAVE FAILED</span>}
        <button
          onClick={() => { setMenuOpen(o => !o); setConfirmDelete(false) }}
          className="ml-auto text-mut hover:text-fg px-1.5 font-bold tracking-wider"
          aria-label="Tracker options"
        >
          ⋯
        </button>
      </div>

      {tracker.kind === 'steps' ? (
        <>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {Array.from({ length: tracker.total }, (_, i) => {
              const n = i + 1
              const cls =
                n === tracker.current
                  ? 'bg-ember shadow-[0_0_6px_#ff7847]'
                  : n < tracker.current
                    ? 'bg-moss'
                    : 'bg-line hover:bg-[#2a4060]'
              return (
                <button
                  key={n}
                  onClick={() => patch({ current: pipTapTarget(tracker.current, n) })}
                  disabled={pending}
                  title={tracker.step_labels?.[i] ?? `${n}`}
                  aria-label={`Set position to ${n}`}
                  className={`w-4 h-4 rounded-[5px] transition-colors ${cls}`}
                />
              )
            })}
          </div>
          <p className="font-mono text-[11px] text-mut">
            {tracker.current} / {tracker.total} {tracker.unit ?? 'parts'}
            {next && (
              <>
                {' '}· <span className="text-ice">next: {next}</span>
              </>
            )}
          </p>
        </>
      ) : (
        <>
          <div className="h-2 rounded-full bg-line overflow-hidden mb-2.5">
            <span
              className="block h-full rounded-full bg-gradient-to-r from-ember to-ember2"
              style={{ width: `${trackerFraction(tracker) * 100}%` }}
            />
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => patch({ current: clampCurrent(tracker.current - 1, tracker.total) })}
              disabled={pending || tracker.current <= 0}
              className="w-7 h-7 rounded-lg border border-line bg-panel2 text-fg disabled:opacity-40 font-bold"
              aria-label="Decrease by one"
            >
              −
            </button>
            <button
              onClick={() => patch({ current: clampCurrent(tracker.current + 1, tracker.total) })}
              disabled={pending || tracker.current >= tracker.total}
              className="w-7 h-7 rounded-lg border border-line bg-panel2 text-fg disabled:opacity-40 font-bold"
              aria-label="Increase by one"
            >
              +
            </button>
            {editingValue ? (
              <input
                type="number"
                autoFocus
                defaultValue={tracker.current}
                onBlur={e => commitValue(e.currentTarget.value)}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                className="w-20 bg-panel2 border border-line rounded-lg px-2 py-0.5 font-mono text-[13px] outline-none focus:border-ember"
              />
            ) : (
              <button
                onClick={() => setEditingValue(true)}
                className="font-mono text-[13px] border-b border-dashed border-mut"
                aria-label="Edit value"
              >
                {tracker.current}{' '}
                <span className="text-mut">
                  / {tracker.total}
                  {tracker.unit ? ` ${tracker.unit}` : ''}
                </span>
              </button>
            )}
          </div>
        </>
      )}

      {menuOpen && (
        <div className="mt-3 pt-3 border-t border-line/60 space-y-2.5">
          <div className="flex gap-2">
            <input
              defaultValue={tracker.name}
              onBlur={e => {
                const v = e.currentTarget.value.trim()
                if (v && v !== tracker.name) patch({ name: v })
              }}
              className="flex-1 min-w-0 bg-panel2 border border-line rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-ember"
              aria-label="Tracker name"
            />
            <input
              type="number"
              defaultValue={tracker.total}
              onBlur={e => {
                const v = Number(e.currentTarget.value)
                if (!Number.isFinite(v) || v < 1 || v === tracker.total) return
                if (tracker.kind === 'steps' && !Number.isInteger(v)) return
                patch({ total: v })
              }}
              className="w-20 bg-panel2 border border-line rounded-lg px-2.5 py-1.5 font-mono text-sm outline-none focus:border-ember"
              aria-label="Tracker total"
            />
          </div>
          <button
            onClick={() => (confirmDelete ? onDelete(tracker.id) : setConfirmDelete(true))}
            className={`text-[12px] font-semibold ${confirmDelete ? 'text-[#e5484d]' : 'text-mut hover:text-warn'}`}
          >
            {confirmDelete ? 'Tap again to delete' : 'Delete tracker'}
          </button>
        </div>
      )}
    </div>
  )
}
