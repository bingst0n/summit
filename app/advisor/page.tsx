import AdvisorChat from '@/components/AdvisorChat'

export default function AdvisorPage() {
  return (
    <div className="flex flex-col px-4 pt-safe chat-height">
      <div className="flex-1 overflow-hidden pt-3">
        <AdvisorChat />
      </div>
    </div>
  )
}
