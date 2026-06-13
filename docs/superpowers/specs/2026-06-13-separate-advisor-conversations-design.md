# Separate Advisor Conversations — Design

**Date:** 2026-06-13
**Status:** Approved, ready for implementation plan

## Problem

The advisor is currently a single, ever-growing thread persisted in one row
(`conversation_state`, id=1) with a 20-message cap and a Haiku-compressed
"rolling summary" for older context. There is no way to start fresh, separate
distinct topics, or revisit a past discussion as its own unit. We want
ChatGPT-style **separate conversations**: a history list, a "new conversation"
action, and isolated threads.

## Decisions (from brainstorming)

1. **Boundary model:** Manual / ChatGPT-style. The user explicitly starts new
   conversations; a history list lets them reopen past ones. Threads persist
   until deleted.
2. **Cross-conversation memory:** None. Conversations are fully isolated. The
   advisor still pulls all current goals/tasks/logs/trackers from the DB on
   every message, so it always knows the real state of the world — it just
   does not recall prior chat banter. **The rolling summary and Haiku
   compression path are removed entirely.**
3. **Landing + brief:** Opening the Advisor lands on the most recent
   conversation. The once-daily proactive brief **auto-creates a new
   conversation** (seeded with the brief), so each day naturally gets its own
   thread. The user can also manually start more.
4. **Titles:** LLM-generated. After the first user→assistant exchange, a cheap
   Haiku call generates a concise 3–5 word title. Brief-seeded threads show a
   date label until a real exchange happens.
5. **Scope:** Delete conversations — yes. Rename — no (titles auto-generate).
   No cross-conversation search. No per-conversation compression.

## Data Model

Replace the single-row `conversation_state` with a multi-row table:

```sql
create table conversations (
  id uuid primary key default gen_random_uuid(),
  title text,                           -- null until LLM-generated; date label for brief threads
  messages jsonb not null default '[]', -- ChatMessage[] (full thread, no compression)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index conversations_updated_at_idx on conversations (updated_at desc);
```

- `ChatMessage` (in `lib/types.ts`) is **unchanged**: `{ role, content, kind?: 'brief', ts? }`.
- The `ConversationState` interface is **removed**; add a `Conversation` interface:

```ts
export interface Conversation {
  id: string
  title: string | null
  messages: ChatMessage[]
  created_at: string
  updated_at: string
}
```

- No `summary` field anywhere. Each thread stores its full message list. When
  sending to the model, defensively cap at the **last 40 messages** (store all,
  send a window) to bound context/cost. This is a safeguard, not compression —
  no summarization of the dropped prefix.

## DB Helpers (`lib/db.ts`)

Remove `getConversationState` / `upsertConversationState`. Add:

- `listConversations(): Promise<ConversationSummary[]>` — returns
  `{ id, title, updated_at, lastSnippet }[]`, newest `updated_at` first.
  `lastSnippet` is a short slice of the final message content for the list UI.
- `getConversation(id): Promise<Conversation | null>`.
- `createConversation(seed?: ChatMessage[]): Promise<Conversation>` — inserts a
  row (optionally pre-seeded, e.g. with a brief message); returns the new row.
- `appendMessages(id, msgs: ChatMessage[]): Promise<void>` — appends to
  `messages` and bumps `updated_at`. Re-reads current row first to avoid
  clobbering a concurrent write (mirrors today's "read fresh before write"
  pattern in the chat route).
- `setTitle(id, title): Promise<void>`.
- `deleteConversation(id): Promise<void>`.

## API Routes

### `GET /api/advisor/conversations`
List for the history drawer: `{ id, title, updated_at, lastSnippet }[]`, newest first.

### `POST /api/advisor/conversations`
Create an empty thread. Returns `{ id }`.

### `GET /api/advisor/conversations/[id]`
Return one thread's messages (and title). 404 if missing.

### `DELETE /api/advisor/conversations/[id]`
Delete the thread.

### `POST /api/advisor/chat` (reworked)
Body: `{ conversationId?: string, message: string }`.
- If `conversationId` is omitted, create a new conversation first.
- Load that conversation's messages; build the system prompt with **fresh DB
  context** (goals, today's tasks, recent logs, light days, trackers, upcoming
  tasks) exactly as today — minus the `summary` block, which is deleted.
- Convert the thread's messages (windowed to last 40) to API format and stream
  the response (link-paste fetch behavior preserved, still not persisted).
- Persist: re-read the row, append user + assistant messages, bump `updated_at`.
- **Title generation:** if the conversation has no title yet and this completes
  the first user→assistant exchange, fire a cheap Haiku call
  (`TITLE_SYSTEM` prompt) to generate a 3–5 word title and store it. Best-effort
  — failure leaves the title null (falls back to date/"New conversation" in UI).

### `GET /api/advisor/brief` (reworked)
- Same `needsBrief()` gating (see below). If no brief is due, return 204.
- If due: **create the new conversation first** (so we have an id), emit that
  id as an `X-Conversation-Id` response header (headers flush before the body),
  then stream the brief via `ADVISOR_BRIEF_SYSTEM`. After the stream completes,
  append the brief message (`{ role:'assistant', content, kind:'brief', ts }`)
  to that conversation server-side. The client reads the header to know which
  thread to land on and continue.
- The brief thread's title stays a date label (`Fri · Jun 13`) until the user
  replies and the chat route generates a real title.

## Conversation policy (`lib/conversation.ts`)

`needsBrief()` logic is preserved but re-pointed from "scan the one thread's
messages" to "scan brief messages across conversations." Concretely, the brief
route gathers the most recent brief message (by `ts`) across all conversations
and feeds the same `{ messages, loggedToday }`-style check. The day/evening-nudge
rules are unchanged; only the source of the brief-message list changes. Unit
tests for `needsBrief()` continue to pass against synthetic message lists.

## Prompts (`lib/prompts.ts`)

- `ADVISOR_SYSTEM` and `ADVISOR_BRIEF_SYSTEM`: **remove the
  `## Past Conversation Summary` block** and the `summary` field it reads.
- `COMPRESSION_SYSTEM`: **removed.**
- Add `TITLE_SYSTEM`: instructs Haiku to return a concise 3–5 word title for a
  conversation given its first exchange, no punctuation/quotes.

## Client / UX (`components/AdvisorChat.tsx`, `app/advisor/page.tsx`)

- **Top bar** on the advisor: `☰` history (left) opens a slide-in drawer; the
  current conversation title in the center; `+` new (right) starts a fresh
  empty thread.
- **History drawer:** lists conversations (title or date label + relative time),
  tap to open, trash icon to delete (with a confirm). Newest first.
- **Mount flow:** fetch the conversation list and hit `/api/advisor/brief` in
  parallel. If the brief created today's thread, land there. Otherwise land on
  the most-recent existing thread, or an empty new thread if none exist.
- `conversationId` is threaded through every `POST /api/advisor/chat`. The chat
  route generates the title *after* streaming the body (so it can't ride the
  same response). The client therefore **refetches the conversation list after a
  send completes** — this both refreshes the drawer and picks up any newly
  generated title for the top-bar.
- **Unchanged:** the `<app_edit>` confirm button, check-in auto-checkoff, and
  tracker create/update/delete ops. They are per-message side-effects and
  operate on whatever thread is open.

## Migration

One-time SQL (in `supabase/schema.sql` + a stated manual step):
1. Create the `conversations` table.
2. Insert the existing `conversation_state.recent_messages` as a single
   `conversations` row, titled with its date, so current history is preserved.
   (Drop the old `summary` — it is not migrated.)
3. Drop the `conversation_state` table.

## Testing

- `lib/conversation.test.ts`: keep/adjust `needsBrief()` tests for the new
  message-source shape.
- `lib/advisorParse.test.ts`, `lib/appEdit.test.ts`: unaffected (parsing/exec
  unchanged) — confirm still green.
- New: a small test for title-generation triggering (only after first exchange,
  best-effort on failure) if it can be unit-tested without the live LLM
  (e.g. a `shouldGenerateTitle(conversation)` pure helper).
- Manual smoke: brief creates a new dated thread; replying generates a title;
  new/delete buttons work; landing lands on the right thread.

## Removed / Deleted

- `conversation_state` table, `ConversationState` type,
  `getConversationState`/`upsertConversationState`, the `summary` field,
  `COMPRESSION_SYSTEM`, and the 20-message compression branch in the chat route.

## Out of Scope (YAGNI)

- Conversation rename, cross-conversation search, per-conversation compression,
  cross-conversation memory/summary, pinning/archiving.
