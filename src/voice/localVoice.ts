// Voice for players without a Gemini key: Kokoro-82M in a worker, with the best system voice
// as a stand-in while the model downloads (or if it can't load at all).

type Status = { state: 'off' | 'loading' | 'ready' | 'failed'; pct: number }

// Male voices, to sound like Squarely's Gemini voice (Puck) while Kokoro downloads.
const NICE = /Google UK English Male|Daniel|Aaron|Arthur|Alex|Evan|Nathan|Tom|Fred/
function systemVoice(): SpeechSynthesisVoice | null {
  const all = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'))
  const nice = all.filter((v) => NICE.test(v.name))
  return nice.find((v) => /\((Premium|Enhanced)\)/.test(v.name)) ?? nice[0] ?? all.find((v) => v.localService) ?? null
}
try {
  speechSynthesis.getVoices() // Chrome loads voices lazily
} catch {
  /* no TTS */
}

class LocalVoice {
  status: Status = { state: 'off', pct: 0 }
  voice = 'am_puck' // Kokoro's Puck, matching the Gemini Live voice
  onStatus?: (s: Status) => void
  onLevel?: (level: number) => void
  private worker: Worker | null = null
  private ctx: AudioContext | null = null
  private playhead = 0
  private id = 0
  private sources = new Set<AudioBufferSourceNode>()

  /** Start downloading the model (call from a user gesture so audio can start too). */
  warm() {
    this.ctx ??= new AudioContext()
    void this.ctx.resume()
    if (this.worker) return
    this.set({ state: 'loading', pct: 0 })
    this.worker = new Worker(new URL('./kokoro.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (e) => {
      const m = e.data
      if (m.type === 'progress') this.set({ state: 'loading', pct: Math.max(this.status.pct, m.pct) })
      else if (m.type === 'ready') this.set({ state: 'ready', pct: 100 })
      else if (m.type === 'error') this.set({ state: 'failed', pct: 0 })
      else if (m.type === 'audio' && m.id === this.id) this.enqueue(m.pcm, m.rate)
    }
    this.worker.onerror = () => this.set({ state: 'failed', pct: 0 })
    this.worker.postMessage({ type: 'load' })
  }

  speak(text: string) {
    this.stop()
    if (this.status.state === 'ready' && this.worker) {
      this.worker.postMessage({ type: 'speak', id: ++this.id, text, voice: this.voice })
      return
    }
    try {
      const u = new SpeechSynthesisUtterance(text)
      const v = systemVoice()
      if (v) u.voice = v
      u.rate = 1.02
      u.pitch = 1.1
      speechSynthesis.speak(u)
    } catch {
      /* no TTS available */
    }
  }

  /** Play a pre-rendered Kokoro clip (e.g. the welcome line). Call from a user gesture. */
  async playClip(url: string) {
    this.stop()
    this.ctx ??= new AudioContext()
    void this.ctx.resume()
    const id = this.id
    try {
      const buf = await this.ctx.decodeAudioData(await (await fetch(url)).arrayBuffer())
      if (id === this.id) this.enqueue(buf.getChannelData(0), buf.sampleRate)
    } catch {
      /* no audio: the welcome screen still reads fine */
    }
  }

  /** True while Squarely's local voice is (or is about to be) audible. */
  get busy() {
    let sys = false
    try {
      sys = speechSynthesis.speaking
    } catch {
      /* ignore */
    }
    return sys || this.sources.size > 0 || (this.ctx !== null && this.playhead > this.ctx.currentTime)
  }

  stop() {
    this.id++
    for (const s of this.sources) s.stop()
    this.sources.clear()
    this.playhead = 0
    try {
      speechSynthesis.cancel()
    } catch {
      /* ignore */
    }
  }

  private enqueue(pcm: Float32Array, rate: number) {
    const ctx = this.ctx!
    const buf = ctx.createBuffer(1, pcm.length, rate)
    buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    const at = Math.max(ctx.currentTime + 0.03, this.playhead)
    src.start(at)
    this.playhead = at + buf.duration
    this.sources.add(src)
    // Rough loudness so Squarely's mouth moves with its own voice.
    let sum = 0
    for (let i = 0; i < pcm.length; i += 64) sum += pcm[i] * pcm[i]
    const level = Math.sqrt(sum / (pcm.length / 64))
    const t = setTimeout(() => this.onLevel?.(level), (at - ctx.currentTime) * 1000)
    src.onended = () => {
      clearTimeout(t)
      this.sources.delete(src)
      if (!this.sources.size) this.onLevel?.(0)
    }
  }

  private set(s: Status) {
    this.status = s
    this.onStatus?.(s)
  }
}

export const localVoice = new LocalVoice()
export type LocalVoiceStatus = Status
