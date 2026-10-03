// Gemini Live voice layer: mic (16 kHz PCM) -> Live model -> function calls -> spoken audio (24 kHz PCM).
// The visitor brings their own API key; it goes straight from this browser to Google.
import {
  ActivityHandling,
  EndSensitivity,
  StartSensitivity,
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
  onTurnComplete?: () => void
  onOutLevel?: (level: number) => void
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

  private lastConnect: [string, string, FunctionDeclaration[]] | null = null
  private gen = 0

  private connecting: Promise<void> | null = null

  /** Call synchronously inside a tap: iOS only lets audio start from a user gesture, not after an await. */
  warmAudio() {
    try {
      this.outCtx ??= new AudioContext({ sampleRate: 24000 })
      void this.outCtx.resume()
    } catch {
      /* no audio here; connect() will report it */
    }
  }

  /** One connect at a time: a second caller (typed text + board tap) waits on the same attempt. */
  connect(apiKey: string, systemInstruction: string, functionDeclarations: FunctionDeclaration[]) {
    this.connecting ??= this.connectInner(apiKey, systemInstruction, functionDeclarations).finally(() => {
      this.connecting = null
    })
    return this.connecting
  }

  private async connectInner(apiKey: string, systemInstruction: string, functionDeclarations: FunctionDeclaration[]) {
    this.lastConnect = [apiKey, systemInstruction, functionDeclarations]
    // Callbacks from an older socket (e.g. its late close after a resume) must not touch the new one.
    const gen = ++this.gen
    const current = () => gen === this.gen
    this.handlers.onState('connecting')
    // Must run inside the user gesture that triggered connect().
    this.outCtx ??= new AudioContext({ sampleRate: 24000 })
    await this.outCtx.resume()

    const ai = new GoogleGenAI({ apiKey })
    // The SDK's connect() never rejects if the socket dies before setup (bad key, quota), so race it
    // against our own error/close and a timeout; otherwise callers would wait forever.
    let fail: (e: Error) => void = () => {}
    const failed = new Promise<never>((_, reject) => (fail = reject))
    let ready = false
    const timer = setTimeout(() => fail(new Error('Gemini Live did not answer in time')), 12000)
    const opening = ai.live.connect({
      model: LIVE_MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction,
        tools: [{ functionDeclarations }],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
        // Thoughts must never be spoken to the player.
        thinkingConfig: { includeThoughts: false },
        contextWindowCompression: { slidingWindow: {} },
        // Turn-taking: the player can cut in instantly (high start sensitivity), but Squarely waits for a
        // real pause before answering (low end sensitivity, ~0.9 s silence), so kids thinking aloud aren't cut off.
        realtimeInputConfig: {
          activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
          automaticActivityDetection: {
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
            prefixPaddingMs: 120,
            silenceDurationMs: 900,
          },
        },
        sessionResumption: { handle: this.resumeHandle },
      },
      callbacks: {
        onopen: () => {},
        onerror: (e) => {
          const msg = String((e as ErrorEvent).message ?? e)
          if (!ready) fail(new Error(msg))
          else if (current()) this.dropSession('error', msg)
        },
        onclose: (e) => {
          if (!ready) fail(new Error(e.reason || 'connection closed'))
          else if (current()) this.dropSession('closed', e.reason)
        },
        onmessage: (m) => current() && void this.onMessage(m),
      },
    })
    let session: Session
    try {
      session = await Promise.race([opening, failed])
    } catch (e) {
      clearTimeout(timer)
      void opening.then((late) => late.close()).catch(() => undefined)
      if (current()) this.dropSession('error', (e as Error).message)
      throw e
    }
    clearTimeout(timer)
    // Closed or superseded while we were connecting: don't let this socket come back as a zombie.
    if (!current()) {
      session.close()
      throw new Error('connection superseded')
    }
    ready = true
    this.session = session
    this.handlers.onState('live')
  }

  private resuming = false
  /** Keep the instruction used on reconnect/resume in step with settings (e.g. the locked language). */
  updateInstruction(systemInstruction: string) {
    if (this.lastConnect) this.lastConnect[1] = systemInstruction
  }

  private async resume() {
    if (this.resuming || !this.lastConnect) return
    this.resuming = true
    const hadMic = this.micOn
    const old = this.session
    this.session = null
    try {
      old?.close()
    } catch {
      /* already closing */
    }
    try {
      await this.connect(...this.lastConnect)
      if (hadMic && !this.micOn) await this.startMic()
    } finally {
      this.resuming = false
    }
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
    if (sc?.turnComplete) this.handlers.onTurnComplete?.()
    if (m.sessionResumptionUpdate?.resumable && m.sessionResumptionUpdate.newHandle) {
      this.resumeHandle = m.sessionResumptionUpdate.newHandle
    }
    // The server rotates connections (~10 min). Resume the same conversation on a fresh socket.
    if (m.goAway && this.lastConnect && this.resumeHandle) void this.resume().catch(() => undefined)
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
    // Drive the avatar's mouth with the loudness of each chunk, in time with playback.
    let sum = 0
    for (let i = 0; i < ch.length; i += 4) sum += ch[i] * ch[i]
    const rms = Math.sqrt(sum / Math.ceil(ch.length / 4))
    setTimeout(() => this.handlers.onOutLevel?.(rms), Math.max(0, (this.nextStart - ctx.currentTime) * 1000))
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

  private micEpoch = 0

  private async openMic() {
    // stopMic() during the permission prompt bumps micEpoch; then this start gives up and cleans up.
    const epoch = ++this.micEpoch
    const cancelled = () => epoch !== this.micEpoch || !this.session
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      })
      if (cancelled()) throw new Error('mic start cancelled')
      this.micCtx = new AudioContext({ sampleRate: 16000 })
      await this.micCtx.audioWorklet.addModule('/worklets/mic-capture.js')
      if (cancelled()) throw new Error('mic start cancelled')
    } catch (e) {
      this.releaseMic()
      throw e
    }
    const srcNode = this.micCtx.createMediaStreamSource(this.micStream)
    this.micNode = new AudioWorkletNode(this.micCtx, 'mic-capture')
    this.micNode.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
      this.handlers.onLevel?.(e.data.level)
      this.session?.sendRealtimeInput({ audio: { data: b64FromBuffer(e.data.pcm), mimeType: 'audio/pcm;rate=16000' } })
    }
    srcNode.connect(this.micNode)
    this.micOn = true
  }

  private releaseMic() {
    this.micNode?.disconnect()
    this.micStream?.getTracks().forEach((t) => t.stop())
    void this.micCtx?.close().catch(() => undefined)
    this.micNode = null
    this.micStream = null
    this.micCtx = null
    this.micOn = false
  }

  stopMic() {
    this.micEpoch++ // cancels a start that's still waiting on the permission prompt
    const wasOn = this.micOn
    this.releaseMic()
    if (!wasOn) return
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
    this.gen++ // ignore the closing socket's callbacks
    s?.close()
    this.handlers.onState('closed')
  }
}
