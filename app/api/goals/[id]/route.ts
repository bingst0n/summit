import { NextResponse } from 'next/server'
import { deleteGoal } from '@/lib/db'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await deleteGoal(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Delete goal error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
