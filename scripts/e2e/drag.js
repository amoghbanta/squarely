// Drag-and-drop and tap-tap on the board, with synthetic pointer events.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const { game } = window.__squarely
  const svg = document.querySelector('svg.board')
  const pt = (sq) => {
    const m = svg.getScreenCTM()
    const col = sq.charCodeAt(0) - 97, row = 8 - Number(sq[1])
    const p = new DOMPoint(col * 100 + 50, row * 100 + 50).matrixTransform(m)
    return { clientX: p.x, clientY: p.y }
  }
  const fire = (type, sq, extra = {}) => svg.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, button: 0, pointerType: 'mouse', ...pt(sq), ...extra }))
  const out = {}
  // drag e2 → e4 through e3
  fire('pointerdown', 'e2'); fire('pointermove', 'e3'); await sleep(30)
  out.liftedShown = !!document.querySelector('.piece.dragging')
  fire('pointermove', 'e4'); fire('pointerup', 'e4')
  for (let i = 0; i < 40 && game.chess.history().length < 2; i++) await sleep(100)
  out.dragPlayed = game.chess.history()[0] === 'e4'
  // illegal drop snaps back
  const fen = game.chess.fen()
  fire('pointerdown', 'd2'); fire('pointermove', 'd3'); fire('pointermove', 'd6'); fire('pointerup', 'd6')
  await sleep(200)
  out.illegalSnapsBack = game.chess.fen() === fen && !document.querySelector('.piece.dragging')
  // tap-tap still works: g1 then f3
  fire('pointerdown', 'g1'); fire('pointerup', 'g1'); await sleep(50)
  fire('pointerdown', 'f3'); fire('pointerup', 'f3')
  for (let i = 0; i < 40 && game.chess.history().length < 4; i++) await sleep(100)
  out.tapTapPlayed = game.chess.history()[2] === 'Nf3'
  return JSON.stringify(out)
})()
