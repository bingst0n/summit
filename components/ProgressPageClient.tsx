'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Goal, Tracker } from '@/lib/types'
import { blendedPct } from '@/lib/tracker'
import TrackerCard from '@/components/TrackerCard'
import AddTrackerForm from '@/components/AddTrackerForm'

interface ProgressPageClientProps {
  initialGoals: Goal[]
  initialTrackers: Tracker[]
}

export default function ProgressPageClient({ initialGoals, initialTrackers }: ProgressPageClientProps) {
  const router = useRouter()
  const [trackers, setTrackers] = useState(initialTrackers)
  const [serverTrackers, setServerTrackers] = useState(initialTrackers)
  const [addingFor, setAddingFor] = useState<string | null>(null)

  // Re-sync local state when router.refresh() delivers new server props
  // (same adjust-during-render pattern as TaskItem).
  if (initialTrackers !== serverTrackers) {
    setServerTrackers(initialTrackers)
    setTrackers(initialTrackers)
  }

  function applyTracker(updated: Tracker) {
    setTrackers(prev => prev.map(t => (t.id === updated.id ? updated : t)))
  }

  async function removeTracker(id: string) {
    const prev = trackers
    setTrackers(p => p.filter(t => t.id !== id))
    try {
      const res = await fetch(`/api/trackers/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      router.refresh()
    } catch {
      setTrackers(prev) // revert
    }
  }

  return (
    <div className="px-4 pt-safe pb-24 md:pb-8 max-w-2xl">
      <div className="pt-5 pb-3">
        <div className="font-mono text-[11px] tracking-[0.18em] text-mut">SUMMIT</div>
        <h1 className="text-[32px] font-bold tracking-tight mt-2.5 leading-none">Progress</h1>
      </div>

      {initialGoals.map(goal => {
        const goalTrackers = trackers.filter(t => t.goal_id === goal.id)
        return (
          <section key={goal.id} className="mt-5">
            <div className="flex items-baseline gap-2.5 mb-2.5">
              <span className="w-2 h-2 rounded-full shrink-0 self-center" style={{ backgroundColor: goal.color }} />
              <h2 className="font-mono text-[12px] tracking-[0.16em] text-mut font-semibold uppercase truncate">
                {goal.title}
              </h2>
              {goalTrackers.length > 0 && (
                <span className="font-mono text-[11px] text-moss">{blendedPct(goalTrackers)}%</span>
              )}
              <button
                onClick={() => setAddingFor(addingFor === goal.id ? null : goal.id)}
                className="ml-auto font-mono text-[11px] tracking-[0.08em] text-ember hover:text-ember2 font-bold"
              >
                + ADD
              </button>
            </div>

            {addingFor === goal.id && (
              <AddTrackerForm
                goalId={goal.id}
                onCreated={() => { setAddingFor(null); router.refresh() }}
                onCancel={() => setAddingFor(null)}
              />
            )}

            {goalTrackers.map(t => (
              <TrackerCard key={t.id} tracker={t} onSaved={applyTracker} onDelete={removeTracker} />
            ))}

            {goalTrackers.length === 0 && addingFor !== goal.id && (
              <p className="text-mut text-[12.5px] bg-panel/60 border border-line/60 rounded-2xl px-3.5 py-3">
                No trackers yet — tap <span className="text-ember font-semibold">+ ADD</span> or ask your advisor.
              </p>
            )}
          </section>
        )
      })}

      {initialGoals.length === 0 && (
        <div className="bg-panel border border-line rounded-2xl p-8 text-center mt-6">
          <p className="text-mut text-sm mb-5">No goals yet. Talk to your advisor to add one.</p>
          <Link
            href="/advisor"
            className="inline-block bg-ember hover:bg-ember2 text-ember-ink text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
          >
            Open Advisor
          </Link>
        </div>
      )}
    </div>
  )
}
