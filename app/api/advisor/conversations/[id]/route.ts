import { NextResponse } from 'next/server'
import { getConversation, deleteConversation } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const convo = await getConversation(id)
    if (!convo) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ id: convo.id, title: convo.title, messages: convo.messages })
  } catch (err) {
    console.error('Get conversation error:', err)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await deleteConversation(id)
    return new Response(null, { status: 204 })
  } catch (err) {
    console.error('Delete conversation error:', err)
    return NextResponse.json({ error: 'delete failed' }, { status: 500 })
  }
}
