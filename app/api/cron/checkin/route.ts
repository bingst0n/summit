import { NextResponse } from 'next/server'
import { sendCheckinNotification } from '@/lib/pushcut'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await sendCheckinNotification()
  return NextResponse.json({ ok: true })
}
