'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  extractGoalData,
  extractDeleteGoal,
  extractCheckIn,
  stripTags,
  type CheckInEntry,
} from '@/lib/advisorParse'
import { today } from '@/lib/utils'

type Message = { role: 'user' | 'assistant'; content: string }

export default function AdvisorChat() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [scheduleStatus, setScheduleStatus] = useState<'idle' | 'updating' | 'updated' | 'error'>('idle')
  const lastCheckInRef = useRef<CheckInEntry[] | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // History renders immediately (plain DB read); the brief — if the server
  // decides one is due — streams in afterwards as a new bubble.
  useEffect(() => {
    let cancelled = false

    async function load() {
      let history: Message[] = []
      try {
        const res = await fetch('/api/advisor/chat')
        const data = await res.json()
        history = data.messages ?? []
      } catch { /* show empty history; the brief may still arrive */ }
      if (cancelled) return
      setMessages(history)
      setHistoryLoaded(true)

      let briefText = ''
      try {
        const res = await fetch('/api/advisor/brief')
        // 204 = the advisor has nothing new to say; just resume the conversation.
        if (res.status === 204 || !res.ok || !res.body) return
        if (cancelled) return

        setStreaming(true)
        setMessages(prev => [...prev, { role: 'assistant', content: '' }])
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (cancelled) return
          briefText += decoder.decode(value, { stream: true })
          setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: briefText }])
        }
        // Stream produced nothing — drop the empty placeholder bubble.
        if (!briefText) setMessages(prev => prev.slice(0, -1))
      } catch {
        if (cancelled) return
        if (briefText) return // partial brief already rendered; leave it
        setMessages(prev => {
          const withoutPlaceholder =
            prev[prev.length - 1]?.role === 'assistant' && prev[prev.length - 1]?.content === ''
              ? prev.slice(0, -1)
              : prev
          return withoutPlaceholder.length === 0
            ? [{ role: 'assistant', content: "Hey! What's on your mind?" }]
            : withoutPlaceholder
        })
      } finally {
        if (!cancelled) setStreaming(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    // Instant during streaming so each token doesn't restart a smooth-scroll
    // animation (which fights the user and looks janky); smooth otherwise.
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

      const goalIds = [...new Set(checkIn.map(c => c.goal_id))]
      // allSettled: one goal's adjustment failing shouldn't abort the others.
      // The log is already saved, so the retry button can safely re-run this.
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
    try {
      const res = await fetch('/api/advisor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText }),
      })
      if (!res.ok || !res.body) throw new Error(`chat ${res.status}`)

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
      // Replace the empty placeholder bubble with an error so the input doesn't
      // stay disabled forever (finally re-enables it).
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: text || "⚠️ Couldn't reach the advisor. Tap Send to try again." },
      ])
    } finally {
      setStreaming(false)
    }

    if (ok) {
      const checkIn = extractCheckIn(text)
      if (checkIn) runCheckIn(checkIn)
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
          <p className="text-zinc-300 font-semibold mb-1">{label}</p>
          <p className="text-zinc-600 text-sm mb-6">This takes about 20 seconds</p>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-4">
        {!historyLoaded && messages.length === 0 && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-zinc-900 border border-zinc-800">
              <div className="flex gap-1 items-center py-1">
                <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-100'
              }`}
            >
              {m.role === 'assistant' ? (
                <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                  {streaming && i === messages.length - 1 && !m.content ? (
                    <div className="flex gap-1 items-center py-1">
                      <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {stripTags(m.content)}
                    </ReactMarkdown>
                  )}
                  {streaming && i === messages.length - 1 && m.content && (
                    <span className="inline-block w-1 h-4 bg-zinc-400 ml-0.5 animate-pulse align-middle" />
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
            {saveError && <p className="text-red-400 text-xs text-center">{saveError}</p>}
            <button
              onClick={saveGoal}
              className="bg-green-600 active:bg-green-700 text-white font-semibold px-8 py-3 rounded-2xl"
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
              className="bg-red-600 active:bg-red-700 text-white font-semibold px-8 py-3 rounded-2xl"
            >
              Delete &quot;{pendingDeleteGoal.title}&quot;
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {scheduleStatus !== 'idle' && (
        <div className="shrink-0 px-1 pb-2 text-xs">
          {scheduleStatus === 'updating' && (
            <span className="text-zinc-500 flex items-center gap-2">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
              Updating your schedule…
            </span>
          )}
          {scheduleStatus === 'updated' && (
            <span className="text-green-500">Schedule updated ✓</span>
          )}
          {scheduleStatus === 'error' && (
            <button
              onClick={() => lastCheckInRef.current && runCheckIn(lastCheckInRef.current)}
              className="text-red-400 active:text-red-300"
            >
              Couldn&apos;t update schedule · Retry
            </button>
          )}
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 pt-2 flex gap-2 border-t border-zinc-800">
        <textarea
          ref={textareaRef}
          value={input}
          rows={1}
          onChange={e => { setInput(e.target.value); resizeTextarea() }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
          }}
          placeholder="Message your advisor..."
          className="flex-1 bg-zinc-900 border border-zinc-700 focus:border-indigo-500 rounded-2xl px-4 py-3 text-base outline-none resize-none leading-normal"
          style={{ minHeight: '48px', maxHeight: '140px' }}
        />
        <button
          onClick={sendMessage}
          disabled={streaming || !input.trim()}
          className="bg-indigo-500 active:bg-indigo-600 text-white font-semibold px-5 rounded-2xl disabled:opacity-40 self-end"
          style={{ height: '48px' }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
