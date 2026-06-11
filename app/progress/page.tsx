import { getGoals, getTrackers } from '@/lib/db'
import ProgressPageClient from '@/components/ProgressPageClient'

// Without this, Next prerenders at build time and the page is frozen until
// the next deploy (same reason as the home page).
export const dynamic = 'force-dynamic'

export default async function ProgressPage() {
  const [goals, trackers] = await Promise.all([getGoals(), getTrackers()])
  return <ProgressPageClient initialGoals={goals} initialTrackers={trackers} />
}
