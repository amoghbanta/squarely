// Vercel function: Squarely's only server code. It relays two kinds of calls to condense.chat,
// which needs a server-side key and doesn't allow browser (CORS) calls:
//   op "compress": compress a long history (session memory, Scout mistake log) with /v1/compress
//   op "chat":     run a Gemini call through the condense proxy (visitor's own Gemini key, OpenAI-compatible route)
// The condense key lives in the CONDENSE_API_KEY env var, never in the client.

const CONDENSE = 'https://api.condense.chat'
const GEMINI_OPENAI = 'https://generativelanguage.googleapis.com/v1beta/openai/'
const MAX_BODY = 400_000

const allowed = (origin) =>
  !origin || /^https:\/\/squarely-chess(-[a-z0-9-]+)?\.vercel\.app$/.test(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin)

const tokens = (messages) => Math.round(messages.reduce((n, m) => n + String(m.content ?? '').length, 0) / 4)

export async function POST(request) {
  const origin = request.headers.get('origin')
  if (!allowed(origin)) return Response.json({ error: 'origin not allowed' }, { status: 403 })
  const key = process.env.CONDENSE_API_KEY
  if (!key) return Response.json({ error: 'condense not configured' }, { status: 503 })

  const raw = await request.text()
  if (raw.length > MAX_BODY) return Response.json({ error: 'too large' }, { status: 413 })
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 })
  }

  if (body.op === 'compress') {
    const messages = Array.isArray(body.messages) ? body.messages : []
    const r = await fetch(`${CONDENSE}/v1/compress`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Condense-Auth-Token': key },
      body: JSON.stringify({ model: 'helene-1', messages }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return Response.json({ error: data.detail ?? `condense ${r.status}` }, { status: r.status })
    return Response.json({ messages: data.messages, tokens_before: tokens(messages), tokens_after: tokens(data.messages ?? []) })
  }

  if (body.op === 'chat') {
    if (!body.geminiKey) return Response.json({ error: 'missing gemini key' }, { status: 400 })
    const r = await fetch(`${CONDENSE}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Condense-Auth-Token': key,
        'X-Condense-Upstream-Url': GEMINI_OPENAI,
        Authorization: `Bearer ${body.geminiKey}`,
        ...(body.sessionId ? { 'X-Condense-Session-Id': body.sessionId } : {}),
      },
      body: JSON.stringify(body.request),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return Response.json({ error: data.error?.message ?? data.detail ?? `condense ${r.status}` }, { status: r.status })
    return Response.json(data)
  }

  return Response.json({ error: 'unknown op' }, { status: 400 })
}
