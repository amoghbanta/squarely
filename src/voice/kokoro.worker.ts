// Kokoro-82M running fully in the browser (no key, no server). Lives in a worker so speech
// synthesis never blocks the board. The model downloads once from Hugging Face, then is cached.
import { KokoroTTS } from 'kokoro-js'

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'
let tts: Promise<KokoroTTS> | null = null

const load = () =>
  (tts ??= KokoroTTS.from_pretrained(MODEL, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: (p: { status: string; progress?: number }) => {
      if (p.status === 'progress' && p.progress !== undefined) postMessage({ type: 'progress', pct: Math.round(p.progress) })
    },
  }))

onmessage = async (e: MessageEvent<{ type: 'load' } | { type: 'speak'; id: number; text: string; voice: string }>) => {
  const m = e.data
  try {
    const model = await load()
    if (m.type === 'load') return postMessage({ type: 'ready' })
    // Sentence by sentence, so the first words play while the rest is still being made.
    for await (const { audio } of model.stream(m.text, { voice: m.voice as 'am_puck' })) {
      postMessage({ type: 'audio', id: m.id, pcm: audio.audio, rate: audio.sampling_rate }, { transfer: [audio.audio.buffer] })
    }
    postMessage({ type: 'done', id: m.id })
  } catch (err) {
    postMessage({ type: 'error', error: String(err) })
  }
}
