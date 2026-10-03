(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  for (let i = 0; i < 40 && !document.querySelector('.mic'); i++) await sleep(250)
  document.querySelector('.mic').click()
  for (let i = 0; i < 40 && !/live/.test(document.querySelector('.live-state').textContent); i++) await sleep(250)
  await sleep(5000)
  const say = async (t, wait) => {
    if (!document.querySelector('#say')) { document.querySelector('[aria-label="Type instead"]').click(); await sleep(300) }
    const i = document.querySelector('#say')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, t)
    i.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(50)
    i.form.requestSubmit()
    await sleep(wait)
  }
  await say('Hej! Jag heter Elsa.', 6000)
  await say('Flytta min häst till mitten, den till höger.', 9000)
  await say('Vad attackerar mig?', 8000)
  await say('Can we speak English again?', 6000)
  const s = window.__squarely.game.getSnapshot()
  return { tools: s.trace.filter((t) => t.role === 'Voice' && t.title.startsWith('→')).map((t) => t.title + ' ' + (t.detail || '')), transcript: s.transcript.map((l) => l.who + ': ' + l.text + (l.sources.length ? '  [✓ ' + l.sources.join(',') + ']' : '')) }
})()
