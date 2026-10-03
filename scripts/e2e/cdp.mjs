// Tiny CDP harness: launch headless chromium, open URL, wait, eval expression(s).
import { spawn } from 'node:child_process'
const [, , url, waitMs = '5000', ...exprs] = process.argv
const bin = process.env.CHROME
const port = 9300 + Math.floor(Math.random() * 500)
const p = spawn(bin, ['--disable-gpu', `--remote-debugging-port=${port}`, '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', url], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200)
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page') } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map()
const logs = []
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description).join(' '))
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + m.params.exceptionDetails.exception?.description?.slice(0, 300))
}
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Runtime.enable')
await sleep(Number(waitMs))
await send('Page.enable')
if (process.env.DARK) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
await send('Emulation.setDeviceMetricsOverride', { width: Number(process.env.W || 1400), height: Number(process.env.H || 1000), deviceScaleFactor: 1, mobile: !!process.env.MOBILE })
for (const ex of exprs) {
  if (ex.startsWith('SHOT:')) {
    const r = await send('Page.captureScreenshot', { format: 'png' })
    const fs = await import('node:fs')
    fs.writeFileSync(ex.slice(5), Buffer.from(r.result.data, 'base64'))
    console.log('saved', ex.slice(5))
    continue
  }
  if (ex.startsWith('KEYS:')) {
    for (const k of ex.slice(5).split(',')) {
      const codes = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Enter: 13, Tab: 9, Escape: 27 }
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: codes[k] ?? 0 })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: codes[k] ?? 0 })
      await sleep(60)
    }
    continue
  }
  if (ex.startsWith('WAIT:')) { await sleep(Number(ex.slice(5))); continue }
  const r = await send('Runtime.evaluate', { expression: ex, awaitPromise: true, returnByValue: true, timeout: 120000 })
  console.log(JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? r, null, 1).slice(0, 6000))
}
if (logs.length) console.log('--- console ---\n' + logs.slice(-30).join('\n'))
ws.close(); p.kill()
process.exit(0)
