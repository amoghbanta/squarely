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
  // review findings: heard words never add castling or swap in a target piece
  const { heardMove } = await import('/src/chess/hearing.ts')
  const H = (t, k, v) => ok(`heard "${t}" ${k}`, heardMove(t)[k] === v, heardMove(t))
  H('bishop takes that castle', 'piece', 'bishop')
  H('bishop takes that castle', 'castle', undefined)
  H('I take your castle with my bishop', 'piece', 'bishop')
  H('pawn to c3 so the knight cannot jump in', 'piece', 'pawn')
  H('the one near my king', 'piece', undefined)
  H('pawn in front of my king, two steps', 'piece', 'pawn')
  H('pawn to e8 and make it a queen', 'piece', 'pawn')
  H('castle kingside', 'castle', 'short')
  ok('norm "done" is not d1', !normalizeSpeech('okay I am done, pawn to e4').includes('d1'), normalizeSpeech('okay I am done, pawn to e4'))
  ok('norm "I see three ways"', !normalizeSpeech('I see three ways').includes('c3'), normalizeSpeech('I see three ways'))
  ok('norm "knight to see three"', normalizeSpeech('knight to see three').includes('c3'), normalizeSpeech('knight to see three'))
  // castling by the model is still fine; "takes that castle" plays the capture, never O-O
  game.chess.load('4k2r/8/8/8/8/8/1B6/4K2R w Kk - 0 1')
  r = await R('make_move', { piece: 'bishop', capture: 'rook', heard: 'bishop takes that castle' })
  ok('takes_castle_not_O-O', r.status === 'played' && game.chess.history()[0] === 'Bxh8', { r, h: game.chess.history() })
  await R('new_game', { color: 'white' })
  // the guard lets real moves through
  for (const t of ['knight to f3, your turn', 'pawn to e4 already', 'oops I meant knight to f3', 'Nf3.']) {
    await R('new_game', { color: 'white' })
    r = await R('make_move', { piece: t.includes('pawn') ? 'pawn' : 'knight', to: t.includes('e4') ? 'e4' : 'f3', heard: t })
    ok(`guard allows "${t}"`, r.status === 'played', r)
  }
  await R('new_game', { color: 'white' })
  r = await R('make_move', { piece: 'pawn', heard: 'pawn please' })
  r = await R('make_move', { piece: 'pawn', which: 'left', heard: 'the one on the left' })
  ok('answer to which-pawn passes guard', r.status !== 'did_not_catch', r)
  await R('new_game', { color: 'white' })
  // truthful "can't": e4 is reachable by a pawn at the start
  r = await R('make_move', { piece: 'pawn', to: 'e4', from: 'd1' })
  ok('no false cant', !/can't go to e4/.test(JSON.stringify(r)), r)
  await R('new_game', { color: 'white' })

  // "move it to c4" after a not-legal answer uses the piece we were talking about, and the answer is drawn
  await R('new_game', { color: 'white' })
  await R('make_move', { san: 'e4' })
  r = await R('make_move', { piece: 'bishop', to: 'g6', heard: 'bishop to g6' })
  const drawn = game.getSnapshot().marks.arrows.length
  r = await R('make_move', { to: 'c4', heard: 'move it to c4' })
  ok('it_means_last_piece', r.status === 'played' && game.chess.history()[2] === 'Bc4', { r, h: game.chess.history() })
  ok('not_legal_draws_options', drawn > 0, drawn)
  await R('new_game', { color: 'white' })
  // talk style by words
  const { parseOffline } = await import('/src/agent/offline.ts')
  ok('talk_less', parseOffline('can you talk less')?.args?.talk_style === 'brief', parseOffline('can you talk less'))
  r = await R('change_settings', { talk_style: 'chatty' })
  ok('talk_style_set', r.status === 'ok' && game.getSnapshot().settings.talk === 'chatty', r)
  await R('change_settings', { talk_style: 'balanced' })
  await R('new_game', { color: 'white' })
  return out
})()
