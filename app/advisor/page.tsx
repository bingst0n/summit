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
    <div className="flex flex-col px-4 pt-safe" style={{ height: 'calc(100dvh - 72px)' }}>
      <div className="py-4 shrink-0">
        <h1 className="text-2xl font-bold">Advisor</h1>
      </div>
      <div className="flex-1 overflow-hidden">
        {briefLoading && !briefText ? (
          <div className="flex items-center gap-2 py-4">
            <span className="inline-block w-1 h-4 bg-zinc-400 animate-pulse" />
            <span className="text-zinc-500 text-sm">Thinking...</span>
          </div>
        ) : (
          <AdvisorChat briefText={briefText} />
        )}
      </div>
    </div>
  )
}
