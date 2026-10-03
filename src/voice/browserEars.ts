// Speech-to-text without a Gemini key: the browser's Web Speech API (Chrome, Edge, Safari).
// Each finished phrase goes through the same offline parser and tools as typed text.

type Rec = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start(): void
  stop(): void
  abort(): void
}

const Ctor = (globalThis as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ??
  (globalThis as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition

export const earsSupported = !!Ctor

type Handlers = { onPhrase: (text: string) => void; onHeard?: (partial: string) => void; onState?: (on: boolean, error?: string) => void; muted?: () => boolean }

export class BrowserEars {
  private rec: Rec | null = null
  private want = false
  private h: Handlers

  constructor(h: Handlers) {
    this.h = h
  }

  get on() {
    return this.want
  }

  start(lang = navigator.language || 'en-US') {
    if (!Ctor || this.want) return
    this.want = true
    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      // Ignore what we hear while Squarely itself is speaking, so it doesn't answer its own voice.
      if (this.h.muted?.()) return
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const text = r[0].transcript.trim()
        if (!text) continue
        if (r.isFinal) this.h.onPhrase(text)
        else this.h.onHeard?.(text)
      }
    }
    // Chrome ends a session after a pause; keep listening until told to stop.
    rec.onend = () => {
      if (this.want) {
        try {
          rec.start()
        } catch {
          this.stop()
        }
      }
    }
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      this.stop(e.error)
    }
    this.rec = rec
    rec.start()
    this.h.onState?.(true)
  }

  stop(error?: string) {
    const was = this.want
    this.want = false
    this.rec?.abort()
    this.rec = null
    if (was || error) this.h.onState?.(false, error)
  }
}
