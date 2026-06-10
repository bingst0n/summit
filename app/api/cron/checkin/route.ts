import { NextResponse } from 'next/server'
import { sendCheckinNotification, type ReminderSlot } from '@/lib/pushcut'

const SLOTS: ReminderSlot[] = ['morning', 'midday', 'evening']

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Slot normally derives from the current ET hour; ?slot= overrides for
  // manual testing.
  const slotParam = new URL(req.url).searchParams.get('slot')
  const slot = SLOTS.includes(slotParam as ReminderSlot)
    ? (slotParam as ReminderSlot)
    : undefined

  try {
    const sent = await sendCheckinNotification(slot)
    return NextResponse.json({ ok: true, slot: sent })
  } catch (err) {
    console.error('Cron check-in notification failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
