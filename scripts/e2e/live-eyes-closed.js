(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const g = window.__squarely.game
  for (let i = 0; i < 40 && !document.querySelector('.mic'); i++) await sleep(250)
  g.remember('name', 'Leo')
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
  await say("My eyes are closed. Pawn in front of my king, two steps.", 9000)
  await say('What did you just move?', 7000)
  await say('Move my bishop out, the one next to my king, to c4.', 9000)
  await say("What's attacking me?", 8000)
  await say('Where is my king?', 7000)
  const s = g.getSnapshot()
  return {
    fen: s.fen,
    tools: s.trace.filter((t) => t.role === 'Voice' && t.title.startsWith('→')).map((t) => t.title + ' ' + (t.detail || '')),
    transcript: s.transcript.slice(1).map((l) => l.who + ': ' + l.text),
  }
})()
