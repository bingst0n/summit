/**
 * Server-side page fetching for the advisor's course-link intake.
 * Public pages only — no JS rendering, no auth. Unreadable pages surface an
 * error string the advisor uses to ask for pasted text instead.
 */

const URL_RE = /https?:\/\/[^\s<>"')\]]+/

export function extractFirstUrl(text: string): string | null {
  const m = text.match(URL_RE)
  if (!m) return null
  return m[0].replace(/[.,;:!?]+$/, '')
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/\s+/g, ' ')
    .trim()
}

const MAX_HTML_CHARS = 200_000
const MAX_TEXT_CHARS = 10_000
const TIMEOUT_MS = 10_000

export type FetchPageResult = { ok: true; text: string } | { ok: false; error: string }

export async function fetchPageText(url: string): Promise<FetchPageResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SummitBot/1.0)',
        Accept: 'text/html,text/plain',
      },
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const type = res.headers.get('content-type') ?? ''
    if (!type.includes('text/html') && !type.includes('text/plain')) {
      return { ok: false, error: `not a readable page (${type || 'unknown content type'})` }
    }
    const raw = (await res.text()).slice(0, MAX_HTML_CHARS)
    const text = htmlToText(raw).slice(0, MAX_TEXT_CHARS)
    if (!text) return { ok: false, error: 'page contained no readable text' }
    return { ok: true, text }
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return { ok: false, error: aborted ? `timed out after ${TIMEOUT_MS / 1000}s` : String(err) }
  } finally {
    clearTimeout(timer)
  }
}
