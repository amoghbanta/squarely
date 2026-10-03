// Live voice: ask for a puzzle, miss once, climb the hint ladder, solve, go back. Checks the
// buddy never says the answer square before hint level 3.
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
  await say("I'm Sam. Can you give me a fork puzzle?", 9000)
  const z = g.puzzle
  res.started = !!z && z.theme
  const answerTo = z?.p.moves[1].slice(2, 4)
  const wrong = g.chess.moves({ verbose: true }).find((m) => m.lan !== z.p.moves[1] && !m.san.includes('#'))
  await say(`${wrong.piece === 'p' ? 'pawn' : wrong.san} to ${wrong.to}`, 8000)
  res.afterWrongUnchanged = g.puzzle.step === 1
  await say("I'm stuck, can I have a hint?", 8000)
  res.hint1 = g.puzzle.hintLevel
  const said = () => g.getSnapshot().transcript.filter((l) => l.who === 'buddy').map((l) => l.text).join(' ')
  res.leakBeforeL3 = answerTo ? said().toLowerCase().includes(answerTo) : null
  await say('Which piece?', 8000)
  res.hint2 = g.puzzle.hintLevel
  await say('Just show me.', 9000)
  res.hint3 = g.puzzle.hintLevel
  let guard = 0
  while (g.puzzle && !g.puzzle.solved && guard++ < 4) {
    const u = g.puzzle.p.moves[g.puzzle.step]
    await say(`${u.slice(0, 2)} to ${u.slice(2, 4)}`, 10000)
  }
  res.solved = g.puzzle?.solved
  await say("Let's go back to my game.", 8000)
  res.back = !g.getSnapshot().puzzle
  res.tools = g.getSnapshot().trace.filter((e) => e.role === 'Voice' && e.title.startsWith('→')).map((e) => e.title.slice(2))
  res.transcript = g.getSnapshot().transcript.map((l) => `${l.who}: ${l.text}`)
  return JSON.stringify(res, null, 1)
})()
