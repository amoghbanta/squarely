// Mic capture worklet: Float32 -> Int16 PCM, posted in ~32 ms chunks.
// Runs inside an AudioContext created at 16 kHz, so no resampling is needed here.
class MicCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buf = new Int16Array(512)
    this.n = 0
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch) return true
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]))
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff
      if (this.n === this.buf.length) {
        const out = this.buf.slice()
        let peak = 0
        for (let j = 0; j < out.length; j++) peak = Math.max(peak, Math.abs(out[j]))
        this.port.postMessage({ pcm: out.buffer, level: peak / 0x8000 }, [out.buffer])
        this.n = 0
      }
    }
    return true
  }
}
registerProcessor('mic-capture', MicCapture)
