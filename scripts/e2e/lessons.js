// Learn mode, offline: every lesson is solvable, explain_piece draws moves, the parked game comes back.
(async () => {
  const { game, runTool } = window.__squarely
  const R = (name, args = {}) => runTool(game, { name, args })
  const out = {}
  const ok = (k, cond, extra) => (out[k] = cond ? 'PASS' : `FAIL ${JSON.stringify(extra ?? '').slice(0, 300)}`)
  await R('new_game', { color: 'white' })
  await R('make_move', { san: 'e4' })
  const parked = game.chess.fen()
  let r = await R('start_lesson')
  ok('starts_with_rook', r.status === 'lesson_started' && game.getSnapshot().lesson?.id === 'rook' && !!r.how_it_moves, r)
  ok('reach_lit', game.getSnapshot().marks.squares.some((m) => m.kind === 'focus'), game.getSnapshot().marks)
  // solve each lesson with a short scripted route (captures in order)
  const routes = {
    rook: ['d3', 'b3', 'b6'], bishop: ['e3', 'g5', 'e7'], queen: ['d5', 'a5', 'h5'],
    king: ['e3', 'd4', 'd5', 'e4'], knight: ['c3', 'e4', 'f6'], pawn: ['e4', 'd5', 'd6', 'd7', 'd8'],
  }
  for (const [id, squares] of Object.entries(routes)) {
    r = await R('start_lesson', { lesson: id })
    const piece = { rook: 'rook', bishop: 'bishop', queen: 'queen', king: 'king', knight: 'knight', pawn: 'pawn' }[id]
    for (const to of squares) r = await R('make_move', { piece, to })
    ok(`lesson_${id}_done`, r.status === 'lesson_done', { r, fen: game.chess.fen() })
  }
  ok('progress_saved', game.getSnapshot().profile.lessonsDone.length === 6, game.getSnapshot().profile.lessonsDone)
  r = await R('start_lesson', { lesson: 'knight' })
  r = await R('make_move', { piece: 'knight', to: 'a3' })
  ok('free_move_ok', r.status === 'lesson_move' && r.pawns_left === 3, r)
  r = await R('undo')
  ok('undo_restarts', r.status === 'lesson_restarted' && game.getSnapshot().lesson.gobbled === 0, r)
  r = await R('explain_piece', { piece: 'knight' })
  ok('explain_draws', r.status === 'ok' && game.getSnapshot().marks.arrows.length > 0 && /L shape|L:/.test(r.how_it_moves), r)
  r = await R('stop_lesson')
  ok('back_to_parked', r.status === 'back_to_game' && game.chess.fen() === parked && !game.getSnapshot().lesson, { r, fen: game.chess.fen() })
  r = await R('explain_piece', { piece: 'bishop' })
  ok('explain_in_game', r.status === 'ok' && r.yours_on_board.length === 2, r)
  const { parseOffline } = await import('/src/agent/offline.ts')
  ok('offline_teach_me', parseOffline("I don't know how to play, teach me")?.name === 'start_lesson', parseOffline("I don't know how to play, teach me"))
  ok('offline_how_horse', parseOffline('how does the horse move')?.args?.piece === 'knight', parseOffline('how does the horse move'))
  ok('castling_soundalike', parseOffline('short casting')?.args?.castle === 'short', parseOffline('short casting'))
  await R('new_game', { color: 'white' })
  return out
})()
