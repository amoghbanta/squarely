// Puzzle mode, offline: start (game parked), wrong try, hint ladder, solve, back to the game.
(async () => {
  const { game, runTool } = window.__squarely
  const R = (name, args = {}) => runTool(game, { name, args })
  const out = {}
  const ok = (k, cond, extra) => (out[k] = cond ? 'PASS' : `FAIL ${JSON.stringify(extra ?? '').slice(0, 300)}`)
  await R('new_game', { color: 'white' })
  await R('make_move', { san: 'e4' })
  const gameFen = game.chess.fen()
  let r = await R('start_puzzle', { theme: 'forks please' })
  const z = game.puzzle
  ok('starts_fork', r.status === 'puzzle_started' && z.theme === 'fork' && game.getSnapshot().puzzle?.label === 'Fork', r)
  ok('player_to_move', game.chess.turn() === game.kidColor, { turn: game.chess.turn(), kid: game.kidColor })
  // a legal move that is not the answer leaves the board alone
  const want = z.p.moves[1]
  const wrong = game.chess.moves({ verbose: true }).find((m) => m.lan !== want && !new (game.chess.constructor)(game.chess.fen()).move(m.san) .san.includes('#'))
  const before = game.chess.fen()
  r = await R('make_move', { san: wrong.san })
  ok('wrong_try_board_unchanged', r.status === 'not_the_answer' && game.chess.fen() === before, r)
  r = await R('puzzle_hint')
  ok('hint_1_idea', r.level === 1 && !!r.look_for && !JSON.stringify(r).includes(want.slice(2, 4)), r)
  r = await R('puzzle_hint')
  ok('hint_2_piece', r.level === 2 && r.square === want.slice(0, 2), r)
  r = await R('puzzle_hint')
  ok('hint_3_move', r.level === 3 && !!r.answer && game.getSnapshot().marks.arrows.some((a) => a.kind === 'suggest'), r)
  // play the whole solution
  let guard = 0
  while (game.puzzle && !game.puzzle.solved && guard++ < 6) {
    const u = game.puzzle.p.moves[game.puzzle.step]
    r = await R('make_move', { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
  }
  ok('solved', r.status === 'solved' && game.getSnapshot().profile.puzzles.solved >= 1, r)
  r = await R('stop_puzzle')
  ok('back_to_parked_game', r.status === 'back_to_game' && game.chess.fen() === gameFen && !game.getSnapshot().puzzle, { r, fen: game.chess.fen() })
  // puzzle picked for a recurring mistake when no theme is asked
  game.lastPuzzleTheme = null
  game.profile = { ...game.profile, mistakes: { hanging_piece: 3 } }
  r = await R('start_puzzle')
  ok('weakness_theme', game.puzzle.theme === 'hangingPiece', { theme: game.puzzle.theme, why: r.chosen_because })
  await R('stop_puzzle')
  // review findings: no answer leak via analyse_position, hint locked during the reply, dots, no fake win
  game.lastPuzzleTheme = null
  r = await R('start_puzzle', { theme: 'mateIn2' })
  r = await R('analyse_position')
  ok('analyse_in_puzzle_is_hint', r.status === 'hint' && r.level === 1, r)
  const z2 = game.puzzle
  const u1 = z2.p.moves[1]
  const moving = R('make_move', { from: u1.slice(0, 2), to: u1.slice(2, 4), promotion: u1[4] })
  const hintDuring = R('puzzle_hint')
  await moving
  r = await hintDuring
  // the hint waited for the reply: the ladder restarted for the new move, and rung 2 names the player's piece
  ok('hint_waits_for_reply', r.level === 1, r)
  r = await R('puzzle_hint')
  ok('hint_after_reply_is_players_piece', r.level === 2 && game.chess.get(r.square)?.color === game.kidColor, r)
  ok('dots_after_one', game.getSnapshot().puzzle.found === 1, game.getSnapshot().puzzle)
  const u2 = game.puzzle.p.moves[game.puzzle.step]
  r = await R('make_move', { from: u2.slice(0, 2), to: u2.slice(2, 4), promotion: u2[4] })
  const sp = game.getSnapshot()
  ok('solved_mate_not_a_game', r.status === 'solved' && sp.over === null && sp.puzzle.found === sp.puzzle.total && sp.panel !== 'summary', { over: sp.over, pz: sp.puzzle })
  await R('stop_puzzle')
  // a parked game keeps its open tutor hint
  await R('new_game', { color: 'white' })
  await R('make_move', { san: 'e4' })
  r = await R('make_move', { san: 'Ba6' })
  const hinted = !!r.tutor
  await R('start_puzzle', { theme: 'fork' })
  r = await R('stop_puzzle')
  ok('parked_hint_restored', hinted && game.getSnapshot().hintOpen && r.hint_still_open, { hinted, r })

  const { parseOffline } = await import('/src/agent/offline.ts')
  ok('offline_words', parseOffline('give me a puzzle')?.name === 'start_puzzle' && parseOffline('hint')?.name === 'puzzle_hint' && parseOffline('back to my game')?.name === 'stop_puzzle', null)
  return out
})()
