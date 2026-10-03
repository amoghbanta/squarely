// Live: a complete beginner gets lessons, not a game; "how does the horse move?" draws it; pause works.
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
  await say("Hi, I'm Sam. I don't know how to play chess at all. Can you teach me?", 10000)
  res.lesson = g.getSnapshot().lesson?.id ?? null
  await say('castle to d3', 8000)
  res.gobbled = g.getSnapshot().lesson?.gobbled
  await say('How does the horse move?', 9000)
  res.arrowsForHorse = g.getSnapshot().marks.arrows.length
  res.tools = g.getSnapshot().trace.filter((e) => e.role === 'Voice' && e.title.startsWith('→')).map((e) => e.title.slice(2))
  res.transcript = g.getSnapshot().transcript.map((l) => `${l.who}: ${l.text}`)
  return JSON.stringify(res, null, 1)
})()
