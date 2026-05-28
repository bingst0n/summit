import { NextResponse } from 'next/server'
import { completeTask } from '@/lib/db'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { completed } = await req.json()

  if (typeof completed !== 'boolean') {
    return NextResponse.json({ error: 'completed must be boolean' }, { status: 400 })
  }

  try {
    await completeTask(id, completed)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
