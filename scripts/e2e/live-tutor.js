(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const g = window.__squarely.game
  for (let i = 0; i < 40 && !document.querySelector('.mic'); i++) await sleep(250)
  g.remember('name', 'Mia')
  // Italian-style position: Qf3 out early, kid to move.
  g.chess.load('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4')
  g.log('Board', 'Test position loaded')
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
  await say('Queen to f5!', 9000)
  await say("Hmm, what's chasing her?", 9000)
  await say('Oh! Undo please.', 7000)
  await say('Then I will move my horse to e2.', 10000)
  const s = g.getSnapshot()
  return {
    tools: s.trace.filter((t) => ['Voice', 'Tutor'].includes(t.role) && !t.title.startsWith('←')).map((t) => t.role + ' ' + t.title + ' ' + (t.detail || '').slice(0, 160)),
    transcript: s.transcript.map((l) => l.who + ': ' + l.text),
  }
})()
