import { NextResponse } from 'next/server'
import { getTasksInRange } from '@/lib/db'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  if (!start || !end) {
    return NextResponse.json({ error: 'start and end required' }, { status: 400 })
  }

  try {
    const tasks = await getTasksInRange(start, end)
    return NextResponse.json({ tasks })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
