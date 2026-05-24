'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createGoal, createMilestones } from '@/lib/db'
import { generateMilestones } from '@/lib/utils'

const CATEGORIES = ['Fitness', 'Learning', 'Career', 'Creative', 'Health', 'Finance', 'Social', 'Other']

export default function NewGoalPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    title: '',
    description: '',
    deadline: '2025-08-31',
    category: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim() || !form.deadline) return

    setSaving(true)
    setError('')
    try {
      const goal = await createGoal({
        title: form.title.trim(),
        description: form.description.trim() || null,
        deadline: form.deadline,
        category: form.category || null,
      })

      const milestones = generateMilestones(goal.id, form.deadline)
      if (milestones.length > 0) {
        await createMilestones(milestones)
      }

      router.push('/goals')
    } catch {
      setError('Failed to save. Check your Supabase connection.')
      setSaving(false)
    }
  }

  return (
    <div className="px-4 pt-safe">
      <div className="py-6 flex items-center gap-4">
        <button onClick={() => router.back()} className="text-zinc-400 active:text-zinc-200 text-xl">
          ←
        </button>
        <h1 className="text-3xl font-bold tracking-tight">New Goal</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider block mb-2">
            Goal
          </label>
          <input
            type="text"
            required
            placeholder="e.g. Run a 5K, Read 10 books"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-xl px-4 py-3 text-sm placeholder:text-zinc-600 outline-none transition-colors"
          />
        </div>

        <div>
          <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider block mb-2">
            Description <span className="text-zinc-700 normal-case">(optional)</span>
          </label>
          <textarea
            placeholder="What does success look like?"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3}
            className="w-full bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-xl px-4 py-3 text-sm placeholder:text-zinc-600 outline-none transition-colors resize-none"
          />
        </div>

        <div>
          <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider block mb-2">
            Deadline
          </label>
          <input
            type="date"
            required
            value={form.deadline}
            onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
            className="w-full bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-xl px-4 py-3 text-sm outline-none transition-colors"
          />
        </div>

        <div>
          <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider block mb-2">
            Category <span className="text-zinc-700 normal-case">(optional)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(cat => (
              <button
                type="button"
                key={cat}
                onClick={() => setForm(f => ({ ...f, category: f.category === cat ? '' : cat }))}
                className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                  form.category === cat
                    ? 'bg-indigo-500 border-indigo-500 text-white'
                    : 'border-zinc-800 text-zinc-400 bg-zinc-900 active:bg-zinc-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="pt-2 pb-safe">
          <button
            type="submit"
            disabled={saving || !form.title.trim()}
            className="w-full bg-indigo-500 active:bg-indigo-600 text-white font-semibold py-4 rounded-2xl disabled:opacity-40 transition-all"
          >
            {saving ? 'Creating...' : 'Create Goal'}
          </button>
          <p className="text-center text-xs text-zinc-600 mt-2">
            Weekly milestones will be auto-generated up to your deadline
          </p>
        </div>
      </form>
    </div>
  )
}
