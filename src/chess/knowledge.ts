// Curated chess knowledge the voice agent may quote: openings matched against the real move
// history, and tactics / principles explained for kids and grown-ups. Facts, not model memory.

export type Opening = { name: string; moves: string[]; idea: string; kid: string }

// SAN sequences from the start position. The longest prefix of the game wins.
const OPENINGS: Opening[] = [
  { name: "King's Pawn Opening", moves: ['e4'], idea: 'Grabs the centre and opens lines for the queen and the light bishop.', kid: 'The king\'s pawn jumps two squares to the middle, opening a door for your bishop and queen.' },
  { name: "Queen's Pawn Opening", moves: ['d4'], idea: 'Takes the centre with a pawn the queen already protects.', kid: 'The queen\'s pawn steps into the middle, and the queen keeps it safe.' },
  { name: 'English Opening', moves: ['c4'], idea: 'Controls d5 from the side, a flexible, slower start.', kid: 'A side pawn that sneaks control of the middle.' },
  { name: 'Réti Opening', moves: ['Nf3'], idea: 'Develops a knight first and keeps pawn choices open.', kid: 'A horse hops out first to watch the middle.' },
  { name: 'Open Game', moves: ['e4', 'e5'], idea: 'Both sides claim the centre with pawns; quick development decides a lot.', kid: 'Both middle pawns bump noses. Now get your horses and bishops out fast!' },
  { name: "King's Knight Opening", moves: ['e4', 'e5', 'Nf3'], idea: 'Develops with tempo by attacking the e5 pawn.', kid: 'Sir Knight hops out and pokes the pawn in the middle.' },
  { name: 'Italian Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], idea: 'The bishop aims at f7, the weakest square near the black king.', kid: 'The bishop points at the square next to the enemy king that only the king guards.' },
  { name: 'Giuoco Piano', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'], idea: 'Calm, symmetrical development; White often plans c3 and d4.', kid: 'Both bishops point at each other\'s king side. A calm, friendly start.' },
  { name: 'Two Knights Defence', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], idea: 'Black counterattacks e4 instead of copying White.', kid: 'Black\'s horse jumps out to poke White\'s middle pawn.' },
  { name: 'Ruy López (Spanish)', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], idea: 'Pressures the knight that defends e5, a long-term squeeze.', kid: 'The bishop bothers the horse that is guarding the middle pawn.' },
  { name: 'Scotch Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'], idea: 'Opens the centre straight away.', kid: 'White pushes another pawn to break open the middle right now.' },
  { name: 'Four Knights Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6'], idea: 'All four knights out; solid and classical.', kid: 'All four horses come out to play!' },
  { name: 'Petrov Defence', moves: ['e4', 'e5', 'Nf3', 'Nf6'], idea: 'Black copies the attack on the centre pawn.', kid: 'Black copies White and pokes back.' },
  { name: "Philidor Defence", moves: ['e4', 'e5', 'Nf3', 'd6'], idea: 'Defends e5 with a pawn; solid but a bit passive.', kid: 'Black guards the middle pawn with a little pawn behind it.' },
  { name: "King's Gambit", moves: ['e4', 'e5', 'f4'], idea: 'Offers a pawn to open the f-file and attack quickly.', kid: 'White offers a pawn as a present to start a fast attack. Brave!' },
  { name: "Scholar's Mate attempt", moves: ['e4', 'e5', 'Qh5'], idea: 'Early queen aiming at f7. Easy to defend with Nc6 and g6 or Qe7.', kid: 'The queen rushes out early to try a sneaky trick on f7. Guard that square and chase her away!' },
  { name: 'Sicilian Defence', moves: ['e4', 'c5'], idea: 'Fights for d4 from the side and creates an unbalanced game.', kid: 'Black answers with a side pawn instead of a middle pawn. Tricky and fighty!' },
  { name: 'French Defence', moves: ['e4', 'e6'], idea: 'Prepares d5 to challenge the centre; solid pawn chain.', kid: 'A small pawn step to get ready to push back in the middle.' },
  { name: 'Caro-Kann Defence', moves: ['e4', 'c6'], idea: 'Prepares d5 while keeping the light bishop free.', kid: 'A quiet pawn step that gets ready to bump the middle.' },
  { name: 'Scandinavian Defence', moves: ['e4', 'd5'], idea: 'Hits e4 at once; the queen often recaptures early.', kid: 'Black bumps the middle pawn right away!' },
  { name: 'Alekhine Defence', moves: ['e4', 'Nf6'], idea: 'Invites White pawns forward to attack them later.', kid: 'Black\'s horse teases White\'s pawn to chase it.' },
  { name: 'Pirc Defence', moves: ['e4', 'd6'], idea: 'Lets White build a centre, then strikes at it.', kid: 'Black waits, then pokes the middle later.' },
  { name: "Queen's Gambit", moves: ['d4', 'd5', 'c4'], idea: 'Offers the c-pawn to pull Black away from the centre.', kid: 'White offers a side pawn to win the middle.' },
  { name: "Queen's Gambit Declined", moves: ['d4', 'd5', 'c4', 'e6'], idea: 'Black keeps the centre pawn firmly supported.', kid: 'Black says "no thanks" and keeps the middle pawn safe.' },
  { name: "Queen's Gambit Accepted", moves: ['d4', 'd5', 'c4', 'dxc4'], idea: 'Black takes the pawn but gives up the centre for now.', kid: 'Black takes the present pawn, but White gets the middle.' },
  { name: 'Slav Defence', moves: ['d4', 'd5', 'c4', 'c6'], idea: 'Supports d5 with the c-pawn, keeping the bishop free.', kid: 'Black guards the middle pawn from the side.' },
  { name: 'London System', moves: ['d4', 'd5', 'Bf4'], idea: 'A simple setup: bishop out early, then e3, Nf3, c3.', kid: 'A simple plan: bishop out first, then build a safe house.' },
  { name: "King's Indian Defence", moves: ['d4', 'Nf6', 'c4', 'g6'], idea: 'Black lets White take the centre, then counterattacks.', kid: 'Black tucks the bishop in the corner and waits to pounce.' },
  { name: 'Nimzo-Indian Defence', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'], idea: 'Pins the knight to fight for e4.', kid: 'Black\'s bishop pins White\'s horse so it can\'t move freely.' },
  { name: 'Dutch Defence', moves: ['d4', 'f5'], idea: 'Controls e4 with the f-pawn; aggressive but loosens the king.', kid: 'A bold side pawn that grabs space, but the king gets a bit drafty.' },
]

export function identifyOpening(history: string[]): (Opening & { book_next: string | null }) | null {
  let best: Opening | null = null
  for (const o of OPENINGS) {
    if (o.moves.length > history.length) continue
    if (o.moves.every((m, i) => history[i] === m) && (!best || o.moves.length > best.moves.length)) best = o
  }
  if (!best) return null
  // The next book move, if a longer line in the table continues exactly from here.
  const cont = OPENINGS.filter((o) => o.moves.length === history.length + 1 && history.every((m, i) => o.moves[i] === m))
  return { ...best, book_next: cont[0]?.moves[history.length] ?? null }
}

/** True when the first ply+1 moves of history all follow some line in the opening table. */
export function isBookMove(history: string[], ply: number): boolean {
  return OPENINGS.some((o) => o.moves.length > ply && o.moves.slice(0, ply + 1).every((m, i) => history[i] === m))
}

export type Concept = { title: string; kid: string; grownup: string; look_for: string }

export const CONCEPTS: Record<string, Concept> = {
  fork: { title: 'Fork', kid: 'One piece attacks two enemy pieces at once, like a fork poking two peas. They can only save one!', grownup: 'A single piece attacks two or more targets; the opponent can parry only one.', look_for: 'Knights are the best forkers. Look for a square where your horse touches two big pieces.' },
  pin: { title: 'Pin', kid: 'A piece is stuck because if it moves, a bigger piece behind it gets taken.', grownup: 'A piece cannot move (absolute pin to the king) or should not (relative pin) without exposing a more valuable piece behind it.', look_for: 'Bishops, castles and queens pin along lines. Look for two enemy pieces on the same line.' },
  skewer: { title: 'Skewer', kid: 'Like a pin, but backwards: the big piece is in front, it has to move, and you take the one behind.', grownup: 'An attack on a valuable piece that, when it moves, exposes a lesser piece behind it.', look_for: 'A king or queen in front of another piece on one line.' },
  discovered_attack: { title: 'Discovered attack', kid: 'One piece moves out of the way and suddenly another piece behind it is attacking. Surprise!', grownup: 'Moving one piece unmasks an attack by another along the line it vacated.', look_for: 'Your piece standing in front of your own bishop, castle or queen.' },
  double_check: { title: 'Double check', kid: 'Two pieces say "check" at the same time. The king must run!', grownup: 'A discovered check where the moving piece also gives check; only a king move answers it.', look_for: 'A discovered check where the piece that moves also attacks the king.' },
  hanging_piece: { title: 'Hanging piece', kid: 'A piece that can be taken for free because nobody guards it.', grownup: 'An undefended piece en prise.', look_for: 'Before every move ask: which of my pieces has no friend guarding it?' },
  back_rank_mate: { title: 'Back-rank mate', kid: 'The king is trapped behind his own pawns and a castle or queen checkmates him on the back row.', grownup: 'Mate on the first or eighth rank against a king boxed in by its own pawns.', look_for: 'Give your king an escape square ("luft") by moving one pawn in front of it.' },
  scholars_mate: { title: "Scholar's mate", kid: 'A sneaky four-move trick where the queen and bishop gang up on the square next to the king.', grownup: 'Qxf7# (or Qxf2#) supported by the bishop, typically by move four.', look_for: 'Guard the square next to your king (f7 for Black, f2 for White), and chase an early queen with your horses.' },
  checkmate: { title: 'Checkmate', kid: 'The king is attacked and has no way to escape. Game over!', grownup: 'The king is in check and no legal move removes the check.', look_for: 'Check every escape square of the enemy king.' },
  stalemate: { title: 'Stalemate', kid: 'The player whose turn it is has no legal moves but is NOT in check. It\'s a draw, so be careful when you\'re winning!', grownup: 'No legal moves and not in check: a draw.', look_for: 'When you\'re way ahead, always leave the enemy king a square to move to.' },
  castling: { title: 'Castling', kid: 'The king hides in the corner and the castle jumps next to him, all in one move. It keeps the king safe!', grownup: 'King moves two squares toward a rook, which jumps to the other side. Not allowed out of, through, or into check.', look_for: 'Clear the pieces between your king and castle, then castle early.' },
  en_passant: { title: 'En passant', kid: 'A special pawn capture: if an enemy pawn jumps two squares right next to yours, you can take it as if it moved only one. Only right away!', grownup: 'Capture of a pawn that just advanced two squares, as if it had advanced one, on the very next move only.', look_for: 'Your pawn on the fifth row, and an enemy pawn jumping two squares beside it.' },
  promotion: { title: 'Promotion', kid: 'A pawn that walks all the way to the other side turns into a queen (or any piece you like)!', grownup: 'A pawn reaching the last rank becomes a queen, rook, bishop or knight.', look_for: 'Push passed pawns that no enemy pawn can stop.' },
  centre: { title: 'Control the centre', kid: 'The four middle squares are the best spots. Pieces in the middle can reach everywhere!', grownup: 'Central pawns and pieces control more squares and restrict the opponent.', look_for: 'Start with a middle pawn, then bring horses toward the middle.' },
  development: { title: 'Develop your pieces', kid: 'Get your horses and bishops off the back row early, so they can join the fun.', grownup: 'Bring minor pieces out quickly, avoid moving the same piece twice in the opening.', look_for: 'Count how many of your pieces still sit on their starting squares.' },
  king_safety: { title: 'King safety', kid: 'Keep your king tucked away behind his pawns, usually by castling.', grownup: 'Castle early, keep the pawn shield intact, avoid opening lines toward your king.', look_for: 'Don\'t push the pawns in front of your castled king without a reason.' },
  piece_values: { title: 'Piece values', kid: 'Pawn 1 point, horse 3, bishop 3, castle 5, queen 9. The king is priceless!', grownup: 'Pawn 1, knight 3, bishop 3, rook 5, queen 9; the king cannot be traded.', look_for: 'Before trading, add up what you give and what you get.' },
  trade: { title: 'Trading', kid: 'Swapping pieces is fine when it\'s fair, or when you get the bigger piece.', grownup: 'Trade when ahead in material, or to remove a strong enemy piece.', look_for: 'Count the points on both sides before you take.' },
  opening_principles: { title: 'Opening tips', kid: 'Middle pawn first, horses before bishops, castle early, and don\'t bring the queen out too soon.', grownup: 'Centre, develop, castle, connect rooks; don\'t move a piece twice or bring the queen out early without a reason.', look_for: 'Pieces out, king safe, then make a plan.' },
}

export const CONCEPT_KEYS = Object.keys(CONCEPTS)

/** Forgiving lookup: "forks", "discovered attacks", "the middle" all resolve. */
export function findConcept(topic: string): [string, Concept] | null {
  const t = topic.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, '_')
  const alias: Record<string, string> = { middle: 'centre', center: 'centre', castle: 'castling', castles: 'castling', values: 'piece_values', points: 'piece_values', discovered: 'discovered_attack', back_rank: 'back_rank_mate', scholar: 'scholars_mate', mate: 'checkmate', develop: 'development', opening: 'opening_principles', queening: 'promotion', free_piece: 'hanging_piece', hanging: 'hanging_piece' }
  const key = CONCEPT_KEYS.find((k) => t === k || t.startsWith(k) || t.replace(/s$/, '') === k) ?? Object.entries(alias).find(([a]) => t.includes(a))?.[1]
  return key ? [key, CONCEPTS[key]] : null
}
