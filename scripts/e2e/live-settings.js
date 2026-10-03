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
  await say('Can you make the board blue and give me animal pieces?', 7000)
  res.theme = g.getSnapshot().settings
  await say('What can I say?', 6000)
  res.help = !!document.querySelector('.help-grid')
  await say('Okay close that.', 5000)
  res.helpClosed = !document.querySelector('.help-grid')
  await say('I want to play as black this time.', 9000)
  res.black = { kid: g.getSnapshot().kidColor, history: g.chess.history() }
  await say('Turn off kids mode please.', 6000)
  res.kids = g.getSnapshot().kidsMode
  await say('Thanks, bye! Stop listening.', 7000)
  res.micText = document.querySelector('.mic').textContent
  const s = g.getSnapshot()
  res.tools = s.trace.filter((t) => t.role === 'Voice' && t.title.startsWith('→')).map((t) => t.title + ' ' + (t.detail || ''))
  res.transcript = s.transcript.map((l) => l.who + ': ' + l.text)
  return res
})()
