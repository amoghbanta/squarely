// Measures a realistic session over Gemini Live: 2 short games, 3 puzzles with hints, a Scout run.
// Reports Gemini Live's own usage reports and condense.chat's before/after token counts.
// Runs in the background: start it, then read window.__tokenReport when done.
window.__tokenReport = null
window.__tokenRun = (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  for (let i = 0; i < 40 && !document.querySelector('.mic'); i++) await sleep(250)
  document.querySelector('.mic').click()
  for (let i = 0; i < 40 && !/live/.test(document.querySelector('.live-state').textContent); i++) await sleep(250)
  await sleep(5000)
  const g = window.__squarely.game
  const say = async (t, wait = 8000) => {
    const i = document.querySelector('#say')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, t)
    i.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(50)
    i.form.requestSubmit()
    await sleep(wait)
  }
  const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
  const myMove = () => {
    const ms = g.chess.moves({ verbose: true })
    const m = ms.find((x) => x.captured) ?? ms.find((x) => x.piece !== 'k' && x.piece !== 'r') ?? ms[0]
    return m ? `${NAME[m.piece]} from ${m.from} to ${m.to}` : 'keep going'
  }
  const playMoves = async (n) => {
    for (let k = 0; k < n; k++) {
      if (g.getSnapshot().hintOpen) await say('keep going')
      if (g.getSnapshot().over) break
      await say(myMove())
    }
  }
  await say("Hi, I'm Sam.", 6000)
  await playMoves(6)
  await say('Was that good?', 7000)
  await say("Let's start a new game.", 7000)
  await playMoves(6)
  await say("What's attacking me?", 7000)
  for (const theme of ['fork', 'checkmate in one', 'free piece']) {
    await say(`Give me a ${theme} puzzle.`, 9000)
    await say('Can I have a hint?', 7000)
    let guard = 0
    while (g.puzzle && !g.puzzle.solved && guard++ < 4) {
      const u = g.puzzle.p.moves[g.puzzle.step]
      await say(`${NAME[g.chess.get(u.slice(0, 2)).type]} from ${u.slice(0, 2)} to ${u.slice(2, 4)}`, 9000)
    }
  }
  await say('Back to my game please.', 7000)
  await say('My chess.com username is amoghbanta.', 10000)
  for (let i = 0; i < 90 && g.getSnapshot().scouting; i++) await sleep(2000)
  await sleep(12000)
  await g.compressSession()
  const s = g.getSnapshot()
  window.__tokenReport = {
    live: g.usage,
    condense: s.profile.condense,
    transcriptLines: s.transcript.length,
    sessionMemoryChars: s.profile.sessionMemory?.length ?? 0,
    scoutPlanVia: s.trace.filter((e) => e.title === 'Coach plan written').map((e) => e.detail)[0] ?? null,
    condenseSteps: s.trace.filter((e) => e.role === 'Memory' && /condense/.test(e.title)).map((e) => e.title),
    tools: s.trace.filter((e) => e.role === 'Voice' && e.title.startsWith('→')).length,
  }
})()
1
