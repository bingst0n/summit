import { NextResponse } from 'next/server'
import { listConversations } from '@/lib/db'

export async function GET() {
  try {
    const conversations = await listConversations()
    return NextResponse.json({ conversations })
  } catch (err) {
    console.error('List conversations error:', err)
    return NextResponse.json({ conversations: [] })
  }
}
