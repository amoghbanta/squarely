// Misheard moves: sound-alike repair, then the nearest legal moves offered instead of a wrong guess.
(async () => {
  const { game, runTool } = window.__squarely
  const R = (name, args = {}) => runTool(game, { name, args })
  const { normalizeSpeech } = await import('/src/chess/hearing.ts')
  const out = {}
  const ok = (k, cond, extra) => (out[k] = cond ? 'PASS' : `FAIL ${JSON.stringify(extra ?? '').slice(0, 300)}`)
  const N = (t, want) => ok(`norm "${t}"`, normalizeSpeech(t).includes(want), normalizeSpeech(t))
  N('night to G3', 'knight to g3')
  N('pawn to see for', 'pawn to c4')
  N('pawn to e for', 'pawn to e4')
  N('rock to d one', 'rook to d1')
  N('queen to H 5', 'queen to h5')
  N('move the porn to a 4', 'pawn to a4')
  ok('norm keeps "to"', normalizeSpeech('knight to e2') === 'knight to e2', normalizeSpeech('knight to e2'))
  await R('new_game', { color: 'white' })
  // the screenshot case: model guessed wrong fields, the heard words say knight to g3 (not legal)
  let r = await R('make_move', { piece: 'pawn', heard: 'night to G3' })
  const opts = (r.options ?? []).map((o) => o.san)
  ok('knight_g3_offers_f3_h3', r.status === 'need_clarification' && opts.includes('Nf3') && opts.includes('Nh3') && !opts.includes('g3'), r)
  r = await R('make_move', { option: 1 })
  ok('option_after_fallback_plays', r.status === 'played', r)
  await R('new_game', { color: 'white' })
  // misheard but legal: plays directly
  r = await R('make_move', { heard: 'night to F3' })
  ok('night_f3_plays', r.status === 'played' && game.chess.history()[0] === 'Nf3', r)
  await R('new_game', { color: 'white' })
  // rhyming file: "bishop to bee five" is fine, "bishop to d5" offers the nearest legal squares
  await R('make_move', { san: 'e4' })
  r = await R('make_move', { piece: 'bishop', to: 'd5' })
  ok('bishop_d5_near', r.status === 'need_clarification' && r.options?.length > 0, r)
  // garbled words never become a guessed move
  await R('new_game', { color: 'white' })
  r = await R('make_move', { piece: 'pawn', to: 'b3', heard: 'algo 1 2 3Yes.' })
  ok('garbled_not_played', r.status === 'did_not_catch' && game.chess.history().length === 0, r)
  r = await R('make_move', { san: 'e4', heard: "Let's start with E4." })
  ok('clear_still_plays', r.status === 'played', r)
  // talk style by words
  const { parseOffline } = await import('/src/agent/offline.ts')
  ok('talk_less', parseOffline('can you talk less')?.args?.talk_style === 'brief', parseOffline('can you talk less'))
  r = await R('change_settings', { talk_style: 'chatty' })
  ok('talk_style_set', r.status === 'ok' && game.getSnapshot().settings.talk === 'chatty', r)
  await R('change_settings', { talk_style: 'balanced' })
  await R('new_game', { color: 'white' })
  return out
})()
