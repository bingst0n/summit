import AdvisorChat from '@/components/AdvisorChat'

export default function AdvisorPage() {
  return (
    <div className="flex flex-col px-4 pt-safe chat-height">
      <div className="py-4 shrink-0">
        <h1 className="text-2xl font-bold">Advisor</h1>
      </div>
      <div className="flex-1 overflow-hidden">
        <AdvisorChat />
      </div>
    </div>
  )
}
