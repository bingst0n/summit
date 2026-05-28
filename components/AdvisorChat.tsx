'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Message = { role: 'user' | 'assistant'; content: string }

function extractGoalData(text: string) {
  const match = text.match(/<goal_data>([\s\S]*?)<\/goal_data>/)
  if (!match) return null
  try { return JSON.parse(match[1].trim()) } catch { return null }
}

function extractDeleteGoal(text: string) {
  const match = text.match(/<delete_goal>([\s\S]*?)<\/delete_goal>/)
  if (!match) return null
  try { return JSON.parse(match[1].trim()) } catch { return null }
}

function stripTags(text: string) {
  return text
    .replace(/<goal_data>[\s\S]*?<\/goal_data>/g, '')
    .replace(/<delete_goal>[\s\S]*?<\/delete_goal>/g, '')
    .trim()
}

interface AdvisorChatProps {
  briefText: string
}

export default function AdvisorChat({ briefText }: AdvisorChatProps) {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [scheduleStatus, setScheduleStatus] = useState<'idle' | 'updating' | 'updated'>('idle')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Brief is the first message; then load history
  useEffect(() => {
    const initial: Message[] = briefText ? [{ role: 'assistant', content: briefText }] : []
    fetch('/api/advisor/chat')
      .then(r => r.json())
      .then(({ messages: history }) => {
        // Don't show history if the brief is already the first message there
        const dedupedHistory = (history ?? []).filter(
          (m: Message) => !(m.role === 'assistant' && m.content === briefText)
        )
        setMessages([...initial, ...dedupedHistory])
      })
      .catch(() => setMessages(initial))
  }, [briefText])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!saving) { setProgress(0); return }
    setProgress(2)
    const interval = setInterval(() => {
      setProgress(prev => prev >= 88 ? prev : prev + (88 - prev) * 0.06)
    }, 400)
    return () => clearInterval(interval)
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

  async function sendMessage() {
    if (!input.trim() || streaming) return
    const userText = input.trim()
    setMessages(prev => [...prev, { role: 'user', content: userText }, { role: 'assistant', content: '' }])
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setStreaming(true)

    const res = await fetch('/api/advisor/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userText }),
    })

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let text = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
      setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: text }])
    }

    setStreaming(false)

    // If advisor mentioned adjusting the schedule, trigger it
    if (text.includes('Updating schedule') || text.includes('adjust')) {
      // Schedule adjustment is triggered server-side; just reflect status
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
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {stripTags(m.content)}
                  </ReactMarkdown>
                  {streaming && i === messages.length - 1 && (
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
              Delete "{pendingDeleteGoal.title}"
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

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
          disabled={streaming}
          className="flex-1 bg-zinc-900 border border-zinc-700 focus:border-indigo-500 rounded-2xl px-4 py-3 text-base outline-none resize-none disabled:opacity-40 leading-normal"
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
