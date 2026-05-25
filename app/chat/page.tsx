'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Message = { role: 'user' | 'assistant'; content: string }

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  content: "What do you want to accomplish this summer? Tell me about it.",
}

function extractGoalData(text: string) {
  const match = text.match(/<goal_data>([\s\S]*?)<\/goal_data>/)
  if (!match) return null
  try {
    return JSON.parse(match[1].trim())
  } catch {
    return null
  }
}

function stripGoalData(text: string) {
  return text.replace(/<goal_data>[\s\S]*?<\/goal_data>/g, '').trim()
}

export default function ChatPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!saving) { setProgress(0); return }
    setProgress(2)
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 88) return prev
        return prev + (88 - prev) * 0.06
      })
    }, 400)
    return () => clearInterval(interval)
  }, [saving])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const lastAssistantContent = [...messages].reverse().find(m => m.role === 'assistant')?.content ?? ''
  const pendingGoalData = extractGoalData(lastAssistantContent)

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [])

  async function sendMessage() {
    if (!input.trim() || streaming) return
    const userMessage: Message = { role: 'user', content: input.trim() }
    const historyForApi = [...messages.slice(1), userMessage]
    setMessages(prev => [...prev, userMessage, { role: 'assistant', content: '' }])
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setStreaming(true)

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: historyForApi }),
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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  async function saveGoal() {
    if (!pendingGoalData) return
    setSaving(true)
    const rawInput = messages.find(m => m.role === 'user')?.content ?? ''
    const res = await fetch('/api/goals/generate-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goalData: pendingGoalData, rawInput }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error('Schedule generation failed:', body)
    }
    setProgress(100)
    await new Promise(r => setTimeout(r, 400))
    router.refresh()
    router.push('/')
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
      <div className="flex flex-col items-center justify-center min-h-[100dvh] px-8 gap-6">
        <div className="w-full max-w-xs text-center">
          <p className="text-zinc-300 font-semibold mb-1">{label}</p>
          <p className="text-zinc-600 text-sm mb-6">This takes about 20 seconds</p>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-zinc-700 text-xs mt-3">{Math.round(progress)}%</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-[100dvh] px-4 pt-safe">
      <div className="py-6 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold">New Goal</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Describe what you want to accomplish</p>
        </div>
        <Link href="/" className="text-zinc-500 text-sm">Cancel</Link>
      </div>

      <div className="flex-1 space-y-3 pb-4 overflow-y-auto">
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
                    {stripGoalData(m.content)}
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

        {pendingGoalData && !streaming && (
          <div className="flex justify-center pt-2">
            <button
              onClick={saveGoal}
              disabled={saving}
              className="bg-green-600 active:bg-green-700 text-white font-semibold px-8 py-3 rounded-2xl disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving & generating schedule...' : 'Save Goal ✓'}
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 pt-2 pb-[env(safe-area-inset-bottom,16px)] flex gap-2 border-t border-zinc-800">
        <textarea
          ref={textareaRef}
          value={input}
          rows={1}
          onChange={e => {
            setInput(e.target.value)
            resizeTextarea()
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendMessage()
            }
          }}
          placeholder="Type here..."
          disabled={streaming}
          className="flex-1 bg-zinc-900 border border-zinc-700 focus:border-indigo-500 rounded-2xl px-4 py-3 text-base outline-none resize-none disabled:opacity-40 leading-normal"
          style={{ minHeight: '48px', maxHeight: '140px' }}
        />
        <button
          onClick={sendMessage}
          disabled={streaming || !input.trim()}
          className="bg-indigo-500 active:bg-indigo-600 text-white font-semibold px-5 rounded-2xl disabled:opacity-40 transition-colors self-end mb-0"
          style={{ height: '48px' }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
