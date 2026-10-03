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
  // offline words
  const { parseOffline } = await import('/src/agent/offline.ts')
  ok('offline_words', parseOffline('give me a puzzle')?.name === 'start_puzzle' && parseOffline('hint')?.name === 'puzzle_hint' && parseOffline('back to my game')?.name === 'stop_puzzle', null)
  return out
})()
