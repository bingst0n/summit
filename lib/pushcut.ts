export async function sendCheckinNotification() {
  const apiKey = process.env.PUSHCUT_API_KEY!
  const name = process.env.PUSHCUT_NOTIFICATION_NAME!

  const res = await fetch(`https://api.pushcut.io/${apiKey}/notifications/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Daily Check-in',
      text: "How much work did you do today? Log your progress.",
      url: `${process.env.NEXT_PUBLIC_APP_URL}/checkin`,
    }),
  })

  if (!res.ok) throw new Error(`Pushcut error: ${res.status}`)
}
