'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Message = { role: 'user' | 'assistant'; content: string }

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  content: "What do you want to accomplish this summer? Describe it in your own words.",
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
  const bottomRef = useRef<HTMLDivElement>(null)

  const lastAssistantContent = [...messages].reverse().find(m => m.role === 'assistant')?.content ?? ''
  const pendingGoalData = extractGoalData(lastAssistantContent)

  async function sendMessage() {
    if (!input.trim() || streaming) return
    const userMessage: Message = { role: 'user', content: input.trim() }
    // Exclude hardcoded initial greeting; build proper alternating history for API
    const historyForApi = [...messages.slice(1), userMessage]
    setMessages(prev => [...prev, userMessage, { role: 'assistant', content: '' }])
    setInput('')
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
    await fetch('/api/goals/generate-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goalData: pendingGoalData, rawInput }),
    })
    router.push('/')
  }

  return (
    <div className="flex flex-col min-h-screen px-4 pt-safe">
      <div className="py-6 flex items-center justify-between">
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
              {m.role === 'assistant' ? stripGoalData(m.content) : m.content}
              {m.role === 'assistant' && streaming && i === messages.length - 1 && (
                <span className="inline-block w-1 h-4 bg-zinc-400 ml-1 animate-pulse align-middle" />
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

      <div className="pb-safe pt-2 flex gap-2 border-t border-zinc-800">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendMessage()
            }
          }}
          placeholder="Type here..."
          disabled={streaming}
          className="flex-1 bg-zinc-900 border border-zinc-700 focus:border-indigo-500 rounded-2xl px-4 py-3 text-sm outline-none disabled:opacity-40"
        />
        <button
          onClick={sendMessage}
          disabled={streaming || !input.trim()}
          className="bg-indigo-500 active:bg-indigo-600 text-white font-semibold px-5 py-3 rounded-2xl disabled:opacity-40 transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  )
}
