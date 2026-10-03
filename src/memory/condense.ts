// condense.chat client: compresses long histories before an LLM reads them.
// Calls go through /api/condense (the key is server-side). If condense isn't configured,
// every helper returns null and Squarely carries on uncompressed.

export type Msg = { role: 'user' | 'assistant' | 'system'; content: string }
export type Compressed = { messages: Msg[]; before: number; after: number }

let unavailable = false

export async function compress(messages: Msg[]): Promise<Compressed | null> {
  if (unavailable || !messages.length) return null
  try {
    const r = await fetch('/api/condense', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'compress', messages }),
    })
    if (r.status === 503 || r.status === 404) unavailable = true
    if (!r.ok) return null
    const d = (await r.json()) as { messages: Msg[]; tokens_before: number; tokens_after: number }
    return { messages: d.messages, before: d.tokens_before, after: d.tokens_after }
  } catch {
    return null
  }
}

export const flatten = (messages: Msg[]) => messages.map((m) => `${m.role === 'assistant' ? 'Squarely' : m.role === 'user' ? 'Player' : 'Note'}: ${m.content}`).join('\n')

let proxyDown = false

/**
 * Run a Gemini call through the condense.chat proxy (OpenAI-compatible route, the visitor's own Gemini
 * key upstream). condense compresses the prompt on the way. Returns the reply text, or null when the
 * proxy isn't configured or fails, so the caller can call Gemini directly instead.
 */
export async function chatViaCondense(geminiKey: string, request: Record<string, unknown>): Promise<string | null> {
  if (proxyDown) return null
  try {
    const r = await fetch('/api/condense', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'chat', geminiKey, request }),
    })
    if (r.status === 503 || r.status === 404) proxyDown = true
    if (!r.ok) return null
    const d = (await r.json()) as { choices?: { message?: { content?: string } }[] }
    return d.choices?.[0]?.message?.content ?? null
  } catch {
    return null
  }
}
