'use client'

export type ConvSummary = {
  id: string
  title: string | null
  created_at: string
  updated_at: string
  lastSnippet: string
}

// "Fri · Jun 13" in Eastern time, matching the brief-thread fallback label.
function dateLabel(iso: string): string {
  const parts = new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  })
  // toLocaleDateString gives "Fri, Jun 13"; swap the comma for the dot separator.
  return parts.replace(',', ' ·')
}

export default function ConversationDrawer({
  open,
  conversations,
  activeId,
  onSelect,
  onDelete,
  onClose,
}: {
  open: boolean
  conversations: ConvSummary[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={`fixed top-0 left-0 h-full w-[82%] max-w-xs bg-bg border-r border-line z-50 flex flex-col pt-safe transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-line shrink-0">
          <span className="font-semibold">Conversations</span>
          <button onClick={onClose} aria-label="Close" className="text-mut text-xl leading-none px-1">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <p className="text-mut text-sm px-4 py-6 text-center">No conversations yet.</p>
          )}
          {conversations.map(c => (
            <div
              key={c.id}
              className={`flex items-center gap-1 px-4 py-3 border-b border-line/50 ${
                c.id === activeId ? 'bg-panel' : ''
              }`}
            >
              <button onClick={() => onSelect(c.id)} className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium truncate text-fg">
                  {c.title || dateLabel(c.created_at)}
                </p>
                {c.lastSnippet && <p className="text-mut text-xs truncate">{c.lastSnippet}</p>}
              </button>
              <button
                onClick={() => onDelete(c.id)}
                aria-label="Delete conversation"
                className="text-mut hover:text-warn shrink-0 px-2 py-1 text-sm"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </aside>
    </>
  )
}
