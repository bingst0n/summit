import { NextResponse } from 'next/server'
import { deleteGoal } from '@/lib/db'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await deleteGoal(id)
  return NextResponse.json({ ok: true })
}
