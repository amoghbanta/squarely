(async () => {
  const { game, runTool } = window.__squarely
  const R = (name, args = {}) => runTool(game, { name, args })
  const out = {}
  const ok = (k, cond, extra) => (out[k] = cond ? 'PASS' : `FAIL ${JSON.stringify(extra ?? '').slice(0, 300)}`)
  // 1. ambiguity + option
  let r = await R('make_move', { piece: 'knight', area: 'middle' })
  ok('ambiguous_asks', r.status === 'need_clarification', r)
  r = await R('make_move', { option: 1 })
  ok('option_plays_and_engine_replies', r.status === 'played' && r.opponent_played?.piece, r)
  // 2. settings via tool
  r = await R('change_settings', { board_theme: 'ocean', piece_style: 'animals' })
  ok('settings_change', r.status === 'ok' && game.getSnapshot().settings.boardTheme === 'ocean', r)
  await new Promise((res) => setTimeout(res, 100))
  ok('animals_render', document.querySelectorAll('.board .emoji').length === 32, document.querySelectorAll('.board .emoji').length)
  r = await R('change_settings', { board_theme: 'purple' })
  ok('bad_theme_rejected', r.status === 'nothing_changed', r)
  // 3. screens
  r = await R('show_screen', { screen: 'help' })
  await new Promise((res) => setTimeout(res, 50))
  ok('help_opens', !!document.querySelector('.help'), r)
  r = await R('show_screen', { screen: 'game' })
  await new Promise((res) => setTimeout(res, 50))
  ok('help_closes', !document.querySelector('.help'), r)
  r = await R('game_summary')
  await new Promise((res) => setTimeout(res, 50))
  ok('summary_modal', !!document.querySelector('.summary') && r.summary?.parent_line, r)
  await R('show_screen', { screen: 'game' })
  // 4. race: move + new game at once must not lock the board
  const p1 = R('make_move', { piece: 'pawn', to: 'e4' })
  const p2 = R('new_game', {})
  await Promise.allSettled([p1, p2])
  const snap = game.getSnapshot()
  ok('race_no_lock', snap.thinking === false && snap.fen.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP'), { thinking: snap.thinking, fen: snap.fen })
  // 5. play black: buddy opens; undo with only buddy's move = nothing
  r = await R('new_game', { color: 'black' })
  ok('black_buddy_opens', r.you_play === 'black' && r.opponent_played?.piece && game.chess.turn() === 'b', r)
  r = await R('undo')
  ok('black_undo_nothing', r.status === 'nothing_to_undo' && game.chess.history().length === 1, r)
  r = await R('make_move', { piece: 'pawn', to: 'e5' })
  if (r.status !== 'played') r = await R('make_move', { piece: 'pawn', to: 'd5' })
  ok('black_move', r.status === 'played', r)
  r = await R('undo')
  ok('black_undo_two', r.status === 'undone' && game.chess.history().length === 1 && game.chess.turn() === 'b', { r, h: game.chess.history() })
  // 6. not legal announces
  r = await R('make_move', { piece: 'king', to: 'e1' })
  ok('illegal_announced', r.status === 'not_legal' && /isn't allowed/.test(game.getSnapshot().announce), { r, a: game.getSnapshot().announce })
  // 7. forget_me needs confirm
  r = await R('forget_me', { confirm: false })
  ok('forget_confirm', r.status === 'need_confirmation', r)
  await R('new_game', { color: 'white' })
  await R('change_settings', { board_theme: 'meadow', piece_style: 'friends' })
  return out
})()
