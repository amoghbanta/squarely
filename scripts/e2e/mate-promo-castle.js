(async () => {
  const { game, runTool } = window.__squarely
  const R = (name, args = {}) => runTool(game, { name, args })
  const o = {}
  game.remember('name', 'Mia')
  // Scholar's mate available: Qxf7#
  game.chess.load('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4')
  let r = await R('make_move', { piece: 'queen', to: 'f7' })
  await new Promise((res) => setTimeout(res, 100))
  o.mate = { status: r.status, over: r.game_over, panel: game.getSnapshot().panel, line: game.getSnapshot().summaryLine, record: game.profile.wins + '/' + game.profile.gamesPlayed }
  r = await R('make_move', { piece: 'pawn', to: 'e4' })
  o.after_over = r.status
  // promotion
  await R('new_game')
  game.chess.load('8/4P3/8/8/8/k7/8/4K3 w - - 0 1')
  r = await R('make_move', { piece: 'pawn', to: 'e8', promotion: 'knight' })
  o.underpromo = r.status + ' ' + (r.you_played?.promoted ?? '')
  await R('undo')
  r = await R('make_move', { piece: 'pawn', to: 'e8' })
  o.autoqueen = r.status + ' ' + (r.you_played?.promoted ?? '')
  // castling by voice
  await R('new_game')
  game.chess.load('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1')
  r = await R('make_move', { castle: 'short' })
  o.castle = r.status + ' ' + r.you_played?.castled
  // fresh-profile summary line
  return o
})()
