'use client'
import { useEffect, useState } from 'react'
import AdvisorChat from '@/components/AdvisorChat'

export default function AdvisorPage() {
  const [briefText, setBriefText] = useState('')
  const [briefLoading, setBriefLoading] = useState(true)

  useEffect(() => {
    let text = ''
    fetch('/api/advisor/brief')
      .then(async res => {
        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          text += decoder.decode(value, { stream: true })
          setBriefText(text)
        }
        setBriefLoading(false)
      })
      .catch(() => {
        setBriefText("Hey! What's on your mind?")
        setBriefLoading(false)
      })
  }, [])

  return (
    <div className="flex flex-col px-4 pt-safe" style={{ height: 'calc(100dvh - 66px - max(env(safe-area-inset-bottom, 0px), 0.5rem))' }}>
      <div className="py-4 shrink-0">
        <h1 className="text-2xl font-bold">Advisor</h1>
      </div>
      <div className="flex-1 overflow-hidden">
        {briefLoading ? (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-zinc-900 border border-zinc-800 text-zinc-100">
              {briefText ? (
                <span>
                  {briefText}
                  <span className="inline-block w-1 h-4 bg-zinc-400 ml-0.5 animate-pulse align-middle" />
                </span>
              ) : (
                <div className="flex gap-1 items-center py-1">
                  <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          </div>
        ) : (
          <AdvisorChat briefText={briefText} />
        )}
      </div>
    </div>
  )
}
