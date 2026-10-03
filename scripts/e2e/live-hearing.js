// Live: misheard moves get repaired or turned into a "did you mean" question; garbled words are never played.
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
  const g = window.__squarely.game
  const res = {}
  await say("I'm Sam.", 5000)
  await say('night to G3', 8000)
  res.afterG3 = { history: g.chess.history(), options: (g.getSnapshot().pendingOptions ?? []).map((o) => o.san) }
  await say('the first one', 9000)
  res.afterPick = g.chess.history()
  const n = g.chess.history().length
  await say('algo 1 2 3 yes', 8000)
  res.garbledPlayed = g.chess.history().length !== n
  res.calls = g.getSnapshot().trace.filter((e) => e.role === 'Voice' && e.title.startsWith('→ make_move')).map((e) => e.detail)
  res.transcript = g.getSnapshot().transcript.map((l) => `${l.who}: ${l.text}`)
  return JSON.stringify(res, null, 1)
})()
