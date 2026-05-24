import { anthropic } from '@/lib/claude'
import { GOAL_INTAKE_SYSTEM } from '@/lib/prompts'

export async function POST(req: Request) {
  const { messages } = await req.json()

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: GOAL_INTAKE_SYSTEM,
    messages,
  })

  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            controller.enqueue(new TextEncoder().encode(chunk.delta.text))
          }
        }
        controller.close()
      },
    }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  )
}
