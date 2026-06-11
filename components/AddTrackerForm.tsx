'use client'
import { useState } from 'react'
import type { TrackerKind } from '@/lib/types'

interface AddTrackerFormProps {
  goalId: string
  onCreated: () => void
  onCancel: () => void
}

export default function AddTrackerForm({ goalId, onCreated, onCancel }: AddTrackerFormProps) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<TrackerKind>('steps')
  const [total, setTotal] = useState('')
  const [unit, setUnit] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const totalNum = Number(total)
    if (!name.trim() || !Number.isFinite(totalNum) || totalNum < 1) {
      setError('Name and a total of at least 1 are required.')
      return
    }
    if (kind === 'steps' && !Number.isInteger(totalNum)) {
      setError('Steps trackers need a whole number of parts.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/trackers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackers: [
            { goal_id: goalId, name: name.trim(), kind, total: totalNum, unit: unit.trim() || undefined },
          ],
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Server error ${res.status}`)
      }
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  const kindBtn = (k: TrackerKind, label: string) => (
    <button
      onClick={() => setKind(k)}
      className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
        kind === k ? 'bg-ember text-ember-ink' : 'bg-panel2 text-mut border border-line'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="bg-panel border border-line rounded-2xl p-3.5 mb-2 space-y-2.5">
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Tracker name (e.g. Module 23)"
        autoFocus
        className="w-full bg-panel2 border border-line rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-ember"
      />
      <div className="flex gap-2 items-center">
        {kindBtn('steps', 'STEPS')}
        {kindBtn('counter', 'COUNTER')}
        <input
          type="number"
          value={total}
          onChange={e => setTotal(e.target.value)}
          placeholder={kind === 'steps' ? '# parts' : 'target'}
          className="w-24 bg-panel2 border border-line rounded-lg px-2.5 py-1.5 font-mono text-sm outline-none focus:border-ember"
        />
        <input
          value={unit}
          onChange={e => setUnit(e.target.value)}
          placeholder={kind === 'steps' ? 'parts' : 'unit'}
          className="flex-1 min-w-0 bg-panel2 border border-line rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-ember"
        />
      </div>
      {error && <p className="text-warn text-xs">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={saving}
          className="bg-moss text-moss-ink disabled:opacity-50 text-[13px] font-bold px-4 py-2 rounded-xl"
        >
          {saving ? 'Saving…' : 'Add tracker'}
        </button>
        <button onClick={onCancel} className="text-mut text-[13px] font-semibold px-3">
          Cancel
        </button>
      </div>
    </div>
  )
}
