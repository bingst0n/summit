'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  extractGoalData,
  extractDeleteGoal,
  extractCheckIn,
  extractTrackerCreate,
  extractTrackerUpdate,
  extractTrackerDelete,
  extractAppEdit,
  stripTags,
  type CheckInEntry,
  type ParsedTrackerUpdate,
} from '@/lib/advisorParse'
import { today } from '@/lib/utils'
import ConversationDrawer, { type ConvSummary } from '@/components/ConversationDrawer'
import type { ChatMessage } from '@/lib/types'

type Message = { role: 'user' | 'assistant'; content: string }

export default function AdvisorChat() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [trackerSaving, setTrackerSaving] = useState(false)
  const [trackerError, setTrackerError] = useState<string | null>(null)
  const [appEditApplying, setAppEditApplying] = useState(false)
  const [appEditError, setAppEditError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [scheduleStatus, setScheduleStatus] = useState<'idle' | 'updating' | 'updated' | 'error'>('idle')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<ConvSummary[]>([])
  const [title, setTitle] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const lastCheckInRef = useRef<CheckInEntry[] | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const refreshConversations = useCallback(async (): Promise<ConvSummary[]> => {
    try {
      const res = await fetch('/api/advisor/conversations')
      const data = await res.json()
      const list: ConvSummary[] = data.conversations ?? []
      setConversations(list)
      return list
    } catch {
      return []
    }
  }, [])

  // Mount: fetch the conversation list and check for a daily brief. A brief
  // opens (and lands us on) a fresh dated thread; otherwise we resume the most
  // recent thread, or present an empty new one.
  useEffect(() => {
    let cancelled = false

    async function load() {
      const listPromise = fetch('/api/advisor/conversations')
        .then(r => r.json())
        .catch(() => ({ conversations: [] }))

      let briefRes: Response | null = null
      try {
        briefRes = await fetch('/api/advisor/brief')
      } catch {
        briefRes = null
      }

      const listData = await listPromise
      if (cancelled) return
      const list: ConvSummary[] = listData.conversations ?? []
      setConversations(list)

      if (briefRes && briefRes.status !== 204 && briefRes.ok && briefRes.body) {
        const newId = briefRes.headers.get('X-Conversation-Id')
        setConversationId(newId)
        setTitle(null)
        setHistoryLoaded(true)
        setStreaming(true)
        setMessages([{ role: 'assistant', content: '' }])

        let briefText = ''
        try {
          const reader = briefRes.body.getReader()
          const decoder = new TextDecoder()
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (cancelled) return
            briefText += decoder.decode(value, { stream: true })
            setMessages([{ role: 'assistant', content: briefText }])
          }
        } catch {
          /* leave whatever streamed */
        }
        if (!cancelled) {
          if (!briefText) setMessages([])
          setStreaming(false)
          refreshConversations()
        }
        return
      }

      // No brief due: resume most recent, or start fresh.
      setHistoryLoaded(true)
      if (list.length > 0) {
        try {
          const res = await fetch(`/api/advisor/conversations/${list[0].id}`)
          if (!cancelled && res.ok) {
            const data = await res.json()
            setConversationId(data.id)
            setTitle(data.title ?? null)
            setMessages((data.messages ?? []).map((m: ChatMessage) => ({ role: m.role, content: m.content })))
          }
        } catch {
          /* fall through to empty */
        }
      } else if (!cancelled) {
        setMessages([{ role: 'assistant', content: "Hey! What's on your mind?" }])
      }
    }

    load()
    return () => { cancelled = true }
  }, [refreshConversations])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth' })
  }, [messages, streaming])

  useEffect(() => {
    if (!saving) {
      const t = setTimeout(() => setProgress(0), 0)
      return () => clearTimeout(t)
    }
    const start = setTimeout(() => setProgress(2), 0)
    const interval = setInterval(() => {
      setProgress(prev => prev >= 88 ? prev : prev + (88 - prev) * 0.06)
    }, 400)
    return () => { clearTimeout(start); clearInterval(interval) }
  }, [saving])

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [])

  const lastAssistantContent = [...messages].reverse().find(m => m.role === 'assistant')?.content ?? ''
  const pendingGoalData = extractGoalData(lastAssistantContent)
  const pendingDeleteGoal = extractDeleteGoal(lastAssistantContent)
  const pendingTrackerCreate = extractTrackerCreate(lastAssistantContent)
  const pendingTrackerDelete = extractTrackerDelete(lastAssistantContent)
  const pendingAppEdit = extractAppEdit(lastAssistantContent)

  function startNewConversation() {
    setDrawerOpen(false)
    setStreaming(false)
    setConversationId(null)
    setTitle(null)
    setMessages([])
    setInput('')
  }

  async function openConversation(id: string) {
    setDrawerOpen(false)
    if (id === conversationId) return
    setStreaming(false)
    try {
      const res = await fetch(`/api/advisor/conversations/${id}`)
      if (!res.ok) return
      const data = await res.json()
      setConversationId(data.id)
      setTitle(data.title ?? null)
      setMessages((data.messages ?? []).map((m: ChatMessage) => ({ role: m.role, content: m.content })))
    } catch {
      /* keep current view on failure */
    }
  }

  async function deleteConversation(id: string) {
    if (!window.confirm('Delete this conversation?')) return
    try {
      await fetch(`/api/advisor/conversations/${id}`, { method: 'DELETE' })
    } catch {
      /* best-effort; refresh below reflects truth */
    }
    const list = await refreshConversations()
    if (id === conversationId) {
      if (list.length > 0) openConversation(list[0].id)
      else startNewConversation()
    }
  }

  async function runTrackerUpdates(updates: ParsedTrackerUpdate[]) {
    const results = await Promise.allSettled(
      updates.map(u =>
        fetch(`/api/trackers/${u.tracker_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current: u.current }),
        })
      )
    )
    results.forEach((r, i) => {
      if (r.status === 'rejected' || !r.value.ok) {
        console.warn(`Tracker update failed for ${updates[i].tracker_id}`)
      }
    })
  }

  async function runCheckIn(checkIn: CheckInEntry[]) {
    lastCheckInRef.current = checkIn
    setScheduleStatus('updating')
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today(), logs: checkIn }),
      })
      if (!res.ok) throw new Error(`checkin ${res.status}`)

      const doneGoals = checkIn.filter(c => c.done).map(c => c.goal_id)
      if (doneGoals.length > 0) {
        try {
          const tasksRes = await fetch(`/api/tasks?start=${today()}&end=${today()}`)
          const { tasks } = await tasksRes.json()
          const targets = (tasks ?? []).filter(
            (t: { id: string; goal_id: string; completed: boolean }) =>
              doneGoals.includes(t.goal_id) && !t.completed
          )
          await Promise.allSettled(
            targets.map((t: { id: string }) =>
              fetch(`/api/tasks/${t.id}/complete`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: true }),
              })
            )
          )
        } catch {
          /* best-effort: the log is saved; check-off failure must not block adjustment. */
        }
      }

      const goalIds = [...new Set(checkIn.map(c => c.goal_id))]
      const results = await Promise.allSettled(
        goalIds.map(id =>
          fetch('/api/adjust', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goal_id: id }),
          }).then(r => {
            if (!r.ok) throw new Error(`adjust ${r.status}`)
          })
        )
      )

      router.refresh()
      if (results.some(r => r.status === 'rejected')) {
        setScheduleStatus('error')
      } else {
        setScheduleStatus('updated')
        setTimeout(() => setScheduleStatus('idle'), 3000)
      }
    } catch {
      setScheduleStatus('error')
    }
  }

  async function sendMessage() {
    if (!input.trim() || streaming) return
    const userText = input.trim()
    setMessages(prev => [...prev, { role: 'user', content: userText }, { role: 'assistant', content: '' }])
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setStreaming(true)

    let text = ''
    let ok = false
    let activeId = conversationId
    try {
      const res = await fetch('/api/advisor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, message: userText }),
      })
      if (!res.ok || !res.body) throw new Error(`chat ${res.status}`)

      // The server lazily creates the thread for a brand-new chat; capture its id.
      const newId = res.headers.get('X-Conversation-Id')
      if (newId) {
        activeId = newId
        if (!conversationId) setConversationId(newId)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: text }])
      }
      ok = true
    } catch {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: text || "⚠️ Couldn't reach the advisor. Tap Send to try again." },
      ])
    } finally {
      setStreaming(false)
    }

    if (ok) {
      const trackerUpdates = extractTrackerUpdate(text)
      if (trackerUpdates) await runTrackerUpdates(trackerUpdates)
      const checkIn = extractCheckIn(text)
      if (checkIn) runCheckIn(checkIn)
      else if (trackerUpdates) router.refresh()

      // Refresh the list so the new/updated thread (and any freshly generated
      // title) appears; sync the title bar for the active thread.
      refreshConversations().then(list => {
        const found = list.find(c => c.id === activeId)
        if (found) setTitle(found.title)
      })
    }
  }

  async function saveGoal() {
    if (!pendingGoalData) return
    setSaving(true)
    setSaveError(null)

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 55000)
      const res = await fetch('/api/goals/generate-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalData: pendingGoalData, rawInput: '' }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setSaveError(body.error ?? `Server error ${res.status}`)
        setSaving(false)
        return
      }

      setProgress(100)
      await new Promise(r => setTimeout(r, 400))
      router.refresh()
      setSaving(false)
      setMessages(prev => [...prev, { role: 'assistant', content: `✓ Goal saved! Your schedule has been generated.` }])
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  async function deleteGoal() {
    if (!pendingDeleteGoal?.id) return
    const res = await fetch(`/api/goals/${pendingDeleteGoal.id}`, { method: 'DELETE' })
    if (res.ok) {
      router.refresh()
      setMessages(prev => [...prev, { role: 'assistant', content: `✓ Goal "${pendingDeleteGoal.title}" removed.` }])
    }
  }

  async function saveTrackers() {
    if (!pendingTrackerCreate) return
    setTrackerSaving(true)
    setTrackerError(null)
    try {
      const res = await fetch('/api/trackers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackers: pendingTrackerCreate }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Server error ${res.status}`)
      }
      router.refresh()
      const n = pendingTrackerCreate.length
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `✓ Created ${n} tracker${n === 1 ? '' : 's'} — see the Progress tab.` },
      ])
    } catch (err) {
      setTrackerError(err instanceof Error ? err.message : String(err))
    } finally {
      setTrackerSaving(false)
    }
  }

  async function deleteTracker() {
    if (!pendingTrackerDelete) return
    const res = await fetch(`/api/trackers/${pendingTrackerDelete.id}`, { method: 'DELETE' })
    if (res.ok) {
      router.refresh()
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `✓ Tracker "${pendingTrackerDelete.name}" removed.` },
      ])
    }
  }

  async function applyAppEdit() {
    if (!pendingAppEdit) return
    setAppEditApplying(true)
    setAppEditError(null)
    try {
      const res = await fetch('/api/app-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ops: pendingAppEdit.ops }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Server error ${res.status}`)
      }
      const { results, applied, failed } = await res.json()
      router.refresh()
      const firstFail = (results as Array<{ ok: boolean; detail: string }> | undefined)?.find(r => !r.ok)
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content:
            failed === 0
              ? `✓ Applied ${applied} change${applied === 1 ? '' : 's'}.`
              : `Applied ${applied} of ${applied + failed} change${applied + failed === 1 ? '' : 's'} — ${firstFail?.detail ?? 'some changes failed'}`,
        },
      ])
    } catch (err) {
      setAppEditError(err instanceof Error ? err.message : String(err))
    } finally {
      setAppEditApplying(false)
    }
  }

  if (saving) {
    const label = progress < 15
      ? 'Saving goal...'
      : progress < 50
      ? 'Generating your schedule...'
      : progress < 85
      ? 'Building daily tasks...'
      : 'Almost done...'

    return (
      <div className="flex flex-col items-center justify-center min-h-[60dvh] px-8 gap-6">
        <div className="w-full max-w-xs text-center">
          <p className="text-fg font-semibold mb-1">{label}</p>
          <p className="text-mut text-sm mb-6">This takes about 20 seconds</p>
          <div className="h-1.5 bg-line rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-ember to-ember2 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <ConversationDrawer
        open={drawerOpen}
        conversations={conversations}
        activeId={conversationId}
        onSelect={openConversation}
        onDelete={deleteConversation}
        onClose={() => setDrawerOpen(false)}
      />

      {/* Conversation bar */}
      <div className="shrink-0 flex items-center gap-2 pb-2 border-b border-line">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Conversation history"
          className="text-mut hover:text-fg text-xl leading-none px-1"
        >
          ☰
        </button>
        <span className="flex-1 text-center text-sm font-medium text-mut truncate">
          {title || 'New conversation'}
        </span>
        <button
          onClick={startNewConversation}
          aria-label="New conversation"
          className="text-mut hover:text-fg text-2xl leading-none px-1"
        >
          +
        </button>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-3 py-4">
        {!historyLoaded && messages.length === 0 && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-panel border border-line">
              <div className="flex gap-1 items-center py-1">
                <span className="w-2 h-2 bg-mut rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-mut rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-mut rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-ember text-ember-ink font-medium'
                  : 'bg-panel border border-line text-fg'
              }`}
            >
              {m.role === 'assistant' ? (
                <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                  {streaming && i === messages.length - 1 && !m.content ? (
                    <div className="flex gap-1 items-center py-1">
                      <span className="w-2 h-2 bg-mut rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-mut rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-mut rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {stripTags(m.content)}
                    </ReactMarkdown>
                  )}
                  {streaming && i === messages.length - 1 && m.content && (
                    <span className="inline-block w-1 h-4 bg-mut ml-0.5 animate-pulse align-middle" />
                  )}
                </div>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}

        {/* Save goal button */}
        {pendingGoalData && !streaming && (
          <div className="flex flex-col items-center gap-2 pt-2">
            {saveError && <p className="text-warn text-xs text-center">{saveError}</p>}
            <button
              onClick={saveGoal}
              className="bg-moss hover:brightness-110 active:brightness-90 text-moss-ink font-semibold px-8 py-3 rounded-2xl transition-colors"
            >
              {saveError ? 'Retry' : 'Save Goal ✓'}
            </button>
          </div>
        )}

        {/* Delete goal button */}
        {pendingDeleteGoal && !streaming && (
          <div className="flex flex-col items-center gap-2 pt-2">
            <button
              onClick={deleteGoal}
              className="bg-[#e5484d] hover:brightness-110 active:brightness-90 text-white font-semibold px-8 py-3 rounded-2xl transition-colors"
            >
              Delete &quot;{pendingDeleteGoal.title}&quot;
            </button>
          </div>
        )}

        {/* Create trackers button */}
        {pendingTrackerCreate && !streaming && (
          <div className="flex flex-col items-center gap-2 pt-2">
            {trackerError && <p className="text-warn text-xs text-center">{trackerError}</p>}
            <button
              onClick={saveTrackers}
              disabled={trackerSaving}
              className="bg-moss hover:brightness-110 active:brightness-90 disabled:opacity-50 text-moss-ink font-semibold px-8 py-3 rounded-2xl transition-colors"
            >
              {trackerSaving
                ? 'Creating…'
                : trackerError
                  ? 'Retry'
                  : `Create ${pendingTrackerCreate.length} tracker${pendingTrackerCreate.length === 1 ? '' : 's'} ✓`}
            </button>
          </div>
        )}

        {/* Delete tracker button */}
        {pendingTrackerDelete && !streaming && (
          <div className="flex flex-col items-center gap-2 pt-2">
            <button
              onClick={deleteTracker}
              className="bg-[#e5484d] hover:brightness-110 active:brightness-90 text-white font-semibold px-8 py-3 rounded-2xl transition-colors"
            >
              Delete tracker &quot;{pendingTrackerDelete.name}&quot;
            </button>
          </div>
        )}

        {/* Apply app-edit button */}
        {pendingAppEdit && !streaming && (
          <div className="flex flex-col items-center gap-2 pt-2">
            <p className="text-mut text-xs text-center max-w-[300px]">{pendingAppEdit.summary}</p>
            {appEditError && <p className="text-warn text-xs text-center">{appEditError}</p>}
            <button
              onClick={applyAppEdit}
              disabled={appEditApplying}
              className="bg-moss hover:brightness-110 active:brightness-90 disabled:opacity-50 text-moss-ink font-semibold px-8 py-3 rounded-2xl transition-colors"
            >
              {appEditApplying
                ? 'Applying…'
                : appEditError
                  ? 'Retry'
                  : `Apply ${pendingAppEdit.ops.length} change${pendingAppEdit.ops.length === 1 ? '' : 's'} ✓`}
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {scheduleStatus !== 'idle' && (
        <div className="shrink-0 px-1 pb-2 text-xs">
          {scheduleStatus === 'updating' && (
            <span className="text-mut flex items-center gap-2 font-mono text-[11px]">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-mut rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-mut rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-mut rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
              Updating your schedule…
            </span>
          )}
          {scheduleStatus === 'updated' && (
            <span className="text-moss font-mono text-[11px]">Schedule updated ✓</span>
          )}
          {scheduleStatus === 'error' && (
            <button
              onClick={() => lastCheckInRef.current && runCheckIn(lastCheckInRef.current)}
              className="text-warn active:text-ember font-mono text-[11px]"
            >
              Couldn&apos;t update schedule · Retry
            </button>
          )}
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 pt-2 flex gap-2 border-t border-line">
        <textarea
          ref={textareaRef}
          value={input}
          rows={1}
          onChange={e => { setInput(e.target.value); resizeTextarea() }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
          }}
          placeholder="Message your advisor..."
          className="flex-1 bg-panel border border-line focus:border-ember rounded-2xl px-4 py-3 text-base outline-none resize-none leading-normal"
          style={{ minHeight: '48px', maxHeight: '140px' }}
        />
        <button
          onClick={sendMessage}
          disabled={streaming || !input.trim()}
          className="bg-ember hover:bg-ember2 active:bg-ember2 text-ember-ink font-bold px-5 rounded-2xl disabled:opacity-40 self-end transition-colors"
          style={{ height: '48px' }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
