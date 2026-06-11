import { NextResponse } from 'next/server'
import { getTracker, updateTracker, deleteTracker } from '@/lib/db'
import { normalizeTrackerPatch } from '@/lib/tracker'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const existing = await getTracker(id)
    if (!existing) return NextResponse.json({ error: 'tracker not found' }, { status: 404 })

    const body = await req.json().catch(() => null)
    const res = normalizeTrackerPatch(body, existing)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })

    const tracker = await updateTracker(id, res.value)
    return NextResponse.json({ tracker })
  } catch (err) {
    console.error('Update tracker error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await deleteTracker(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Delete tracker error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
