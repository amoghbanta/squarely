// Gemini Live voice layer: mic (16 kHz PCM) -> Live model -> function calls -> spoken audio (24 kHz PCM).
// The visitor brings their own API key; it goes straight from this browser to Google.
import {
  FunctionResponseScheduling,
  GoogleGenAI,
  Modality,
  type FunctionCall,
  type FunctionDeclaration,
  type LiveServerMessage,
  type Session,
} from '@google/genai'

export const LIVE_MODEL = 'gemini-3.8-live'

/** Tools declared NON_BLOCKING: the model keeps talking while they run. */
export const ASYNC_TOOLS = new Set(['scout_games'])

export type LiveState = 'idle' | 'connecting' | 'live' | 'error' | 'closed'

export type LiveHandlers = {
  onToolCall: (call: FunctionCall) => Promise<Record<string, unknown>>
  onTranscript: (who: 'kid' | 'buddy', text: string) => void
  onState: (s: LiveState, detail?: string) => void
  onLevel?: (micLevel: number) => void
  onSpeaking?: (speaking: boolean) => void
}

const b64FromBuffer = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

const pcm16FromB64 = (b64: string) => {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Int16Array(bytes.buffer)
}

export class LiveVoice {
  private session: Session | null = null
  private micCtx: AudioContext | null = null
  private micStream: MediaStream | null = null
  private micNode: AudioWorkletNode | null = null
  private outCtx: AudioContext | null = null
  private nextStart = 0
  private sources = new Set<AudioBufferSourceNode>()
  private resumeHandle: string | undefined
  micOn = false

  private handlers: LiveHandlers

  constructor(handlers: LiveHandlers) {
    this.handlers = handlers
  }

  async connect(apiKey: string, systemInstruction: string, functionDeclarations: FunctionDeclaration[]) {
    this.handlers.onState('connecting')
    // Must run inside the user gesture that triggered connect().
    this.outCtx ??= new AudioContext({ sampleRate: 24000 })
    await this.outCtx.resume()

    const ai = new GoogleGenAI({ apiKey })
    this.session = await ai.live.connect({
      model: LIVE_MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction,
        tools: [{ functionDeclarations }],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
        contextWindowCompression: { slidingWindow: {} },
        sessionResumption: { handle: this.resumeHandle },
      },
      callbacks: {
        onopen: () => this.handlers.onState('live'),
        onerror: (e) => this.dropSession('error', String((e as ErrorEvent).message ?? e)),
        onclose: (e) => this.dropSession('closed', e.reason),
        onmessage: (m) => void this.onMessage(m),
      },
    })
  }

  /** The socket is gone: release the mic and let the next tap reconnect (resuming the session). */
  private dropSession(state: LiveState, detail?: string) {
    this.session = null
    this.stopMic()
    this.flushPlayback()
    this.handlers.onState(state, detail)
  }

  private async onMessage(m: LiveServerMessage) {
    const sc = m.serverContent
    if (sc?.interrupted) this.flushPlayback()
    for (const p of sc?.modelTurn?.parts ?? []) {
      if (p.inlineData?.data) this.play(pcm16FromB64(p.inlineData.data))
    }
    if (sc?.inputTranscription?.text) this.handlers.onTranscript('kid', sc.inputTranscription.text)
    if (sc?.outputTranscription?.text) this.handlers.onTranscript('buddy', sc.outputTranscription.text)
    if (m.sessionResumptionUpdate?.resumable && m.sessionResumptionUpdate.newHandle) {
      this.resumeHandle = m.sessionResumptionUpdate.newHandle
    }
    // Each call is answered as soon as it finishes: slow background tools (the Scout) must not
    // hold up fast board tools. Async tools come back WHEN_IDLE so the buddy isn't cut off.
    for (const fc of m.toolCall?.functionCalls ?? []) {
      void (async () => {
        let response: Record<string, unknown>
        try {
          response = await this.handlers.onToolCall(fc)
        } catch (err) {
          response = { error: String(err) }
        }
        const scheduling = ASYNC_TOOLS.has(fc.name ?? '') ? FunctionResponseScheduling.WHEN_IDLE : undefined
        this.session?.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response, scheduling }] })
      })()
    }
  }

  private play(pcm: Int16Array) {
    const ctx = this.outCtx
    if (!ctx || !pcm.length) return
    const buf = ctx.createBuffer(1, pcm.length, 24000)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    this.nextStart = Math.max(this.nextStart, ctx.currentTime + 0.03)
    src.start(this.nextStart)
    this.nextStart += buf.duration
    this.sources.add(src)
    this.handlers.onSpeaking?.(true)
    src.onended = () => {
      this.sources.delete(src)
      if (!this.sources.size) this.handlers.onSpeaking?.(false)
    }
  }

  private flushPlayback() {
    for (const s of this.sources) {
      try {
        s.stop()
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear()
    this.nextStart = 0
    this.handlers.onSpeaking?.(false)
  }

  private micStarting: Promise<void> | null = null

  startMic() {
    // Guard double taps: one in-flight start, one stream.
    if (this.micOn) return Promise.resolve()
    this.micStarting ??= this.openMic().finally(() => {
      this.micStarting = null
    })
    return this.micStarting
  }

  private async openMic() {
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    })
    this.micCtx = new AudioContext({ sampleRate: 16000 })
    await this.micCtx.audioWorklet.addModule('/worklets/mic-capture.js')
    const srcNode = this.micCtx.createMediaStreamSource(this.micStream)
    this.micNode = new AudioWorkletNode(this.micCtx, 'mic-capture')
    this.micNode.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
      this.handlers.onLevel?.(e.data.level)
      this.session?.sendRealtimeInput({ audio: { data: b64FromBuffer(e.data.pcm), mimeType: 'audio/pcm;rate=16000' } })
    }
    srcNode.connect(this.micNode)
    this.micOn = true
  }

  stopMic() {
    if (!this.micOn) return
    this.micNode?.disconnect()
    this.micStream?.getTracks().forEach((t) => t.stop())
    void this.micCtx?.close()
    this.micNode = null
    this.micStream = null
    this.micCtx = null
    this.micOn = false
    try {
      this.session?.sendRealtimeInput({ audioStreamEnd: true })
    } catch {
      /* socket already closed */
    }
  }

  /** Typed fallback: same session, same tools, no mic needed. */
  sendText(text: string) {
    this.session?.sendRealtimeInput({ text })
  }

  /** Push a system-side event (e.g. a board click) into the conversation as context. */
  sendEvent(text: string) {
    this.session?.sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true })
  }

  get connected() {
    return !!this.session
  }

  close() {
    this.stopMic()
    this.flushPlayback()
    const s = this.session
    this.session = null
    s?.close()
    this.handlers.onState('closed')
  }
}
