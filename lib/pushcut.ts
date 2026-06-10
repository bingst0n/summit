export async function sendCheckinNotification() {
  const apiKey = process.env.PUSHCUT_API_KEY
  const name = process.env.PUSHCUT_NOTIFICATION_NAME
  if (!apiKey || !name) {
    throw new Error('PUSHCUT_API_KEY or PUSHCUT_NOTIFICATION_NAME is not set')
  }

  const res = await fetch(`https://api.pushcut.io/v1/notifications/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'API-Key': apiKey },
    body: JSON.stringify({
      title: 'Daily Check-in',
      text: "How much work did you do today? Log your progress.",
      // Fall back to prod so a missing env var can't produce "undefined/advisor".
      url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://lockin-lake.vercel.app'}/advisor`,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Pushcut error: ${res.status} ${body}`)
  }
}
