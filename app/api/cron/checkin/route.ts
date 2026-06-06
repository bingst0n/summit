import { NextResponse } from 'next/server'
import { sendCheckinNotification } from '@/lib/pushcut'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await sendCheckinNotification()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Cron check-in notification failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
