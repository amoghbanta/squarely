// Pre-renders Squarely's welcome line with Kokoro-82M (same model and Puck voice as the in-browser
// offline voice), so the welcome screen can greet instantly without downloading the model first.
// Usage: node scripts/make-welcome-voice.mjs, then (macOS) shrink it to AAC:
//   afconvert -f m4af -d aac -b 64000 public/voice/welcome.wav public/voice/welcome.m4a && rm public/voice/welcome.wav
import { mkdirSync } from 'node:fs'
import { KokoroTTS } from 'kokoro-js'

const LINE = "Hi, I'm Squarely! Let's learn some chess together."

const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' })
const audio = await tts.generate(LINE, { voice: 'am_puck' })
mkdirSync('public/voice', { recursive: true })
await audio.save('public/voice/welcome.wav')
console.log(`public/voice/welcome.wav · ${(audio.audio.length / audio.sampling_rate).toFixed(1)} s`)
