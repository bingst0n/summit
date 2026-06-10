import AdvisorChat from '@/components/AdvisorChat'

export default function AdvisorPage() {
  return (
    <div className="flex flex-col px-4 pt-safe chat-height">
      <div className="py-4 shrink-0">
        <p className="font-mono text-[11px] tracking-[0.18em] text-mut">📻 RADIO BASECAMP</p>
        <h1 className="text-2xl font-bold mt-1">Advisor</h1>
      </div>
      <div className="flex-1 overflow-hidden">
        <AdvisorChat />
      </div>
    </div>
  )
}
