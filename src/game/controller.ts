// Game controller: owns the position and runs the Referee, Opponent, Tutor and Memory roles.
// Everything returned from here is computed by chess.js / Stockfish and is safe for the voice agent to phrase.
import { Chess, type Color, type Move, type Square } from 'chess.js'
import { getEngine } from '../engine/stockfish'
import {
  BLUNDER_WIN_PROB_LOSS,
  CHARACTER,
  setKidsModeFacts,
  nameOf,
  boardListing,
  colorName,
  kingSquare,
  material,
  other,
  threatsAgainst,
  whereIs,
  winProb,
} from '../chess/facts'
import { resolveMove, type MoveIntent, type MoveOption } from '../chess/resolver'
import { classifyPunishment, type Punishment } from '../chess/motifs'
import { loadProfile, resetProfile, saveProfile, topMistakes, type Profile } from '../memory/store'
import { BOARD_THEMES, PIECE_STYLES, isBoardTheme, isPieceStyle, type BoardTheme, type PieceStyle } from '../ui/themes'
import { runScout, type ScoutReport, type ScoutSource } from '../scout/scout'

export type Role = 'Voice' | 'Referee' | 'Opponent' | 'Tutor' | 'Memory' | 'Board' | 'Scout'

export type TraceEntry = {
  id: number
  t: number
  role: Role
  title: string
  detail?: string
  ms?: number
}

type KidMoveLog = {
  san: string
  wpBefore: number
  wpAfter: number
  blunder: boolean
  motif: string | null
  afterHint: boolean
}

export type GameSnapshot = {
  fen: string
  lastMove: { from: Square; to: Square } | null
  kidColor: Color
  turn: Color
  over: string | null
  thinking: boolean
  trace: TraceEntry[]
  transcript: { who: 'kid' | 'buddy'; text: string }[]
  announce: string
  profile: Profile
  level: number
  scoutReport: ScoutReport | null
  scouting: boolean
  scoutProgress: string
  kidsMode: boolean
  pendingOptions: MoveOption[] | null
  checkSquare: Square | null
  settings: Settings
  panel: Panel
  summaryLine: string | null
  micOffSeq: number
}

export type Panel = 'summary' | 'scout' | 'help' | null
export type Settings = { boardTheme: BoardTheme; pieceStyle: PieceStyle; showTrace: boolean }

const SETTINGS_KEY = 'squarely.settings.v1'
const loadSettings = (): Settings => {
  const d: Settings = { boardTheme: 'meadow', pieceStyle: 'friends', showTrace: true }
  try {
    return { ...d, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>) }
  } catch {
    return d
  }
}
const saveSettings = (v: Settings) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(v))
  } catch {
    /* best-effort */
  }
}

const HINT_COOLDOWN_KID_MOVES = 3
const KIDS_KEY = 'squarely.kidsMode'
const readKidsMode = () => {
  try {
    return localStorage.getItem(KIDS_KEY) !== '0'
  } catch {
    return true
  }
}

export class GameController {
  chess = new Chess()
  kidColor: Color = 'w'
  level = 2 // 1 (gentle) .. 5 (tough)
  profile: Profile = loadProfile()
  apiKey: string | null = null
  kidsMode = readKidsMode()
  settings: Settings = loadSettings()
  panel: Panel = null
  summaryLine: string | null = null
  private scoutReport: ScoutReport | null = null
  private scouting = false
  private scoutProgress = ''
  private pending: MoveOption[] | null = null
  private lastMove: { from: Square; to: Square } | null = null
  private trace: TraceEntry[] = []
  private transcript: { who: 'kid' | 'buddy'; text: string }[] = []
  private announce = ''
  private thinking = false
  private kidMoves: KidMoveLog[] = []
  private lastHintAtKidMove = -99
  private hintOpen = false // tutor intervened and is waiting for the kid to retry
  private gameRecorded = false
  private evalCache = new Map<string, number>()
  private listeners = new Set<() => void>()
  private snap: GameSnapshot
  private seq = 0

  constructor() {
    setKidsModeFacts(this.kidsMode)
    this.snap = this.buildSnapshot()
  }

  // ---------- store plumbing (useSyncExternalStore) ----------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getSnapshot = () => this.snap
  private emit() {
    this.snap = this.buildSnapshot()
    for (const l of this.listeners) l()
  }
  private buildSnapshot(): GameSnapshot {
    const c = this.chess
    return {
      fen: c.fen(),
      lastMove: this.lastMove,
      kidColor: this.kidColor,
      turn: c.turn(),
      over: this.overReason(),
      thinking: this.thinking,
      trace: this.trace,
      transcript: this.transcript,
      announce: this.announce,
      profile: this.profile,
      level: this.level,
      scoutReport: this.scoutReport,
      kidsMode: this.kidsMode,
      settings: this.settings,
      panel: this.panel,
      summaryLine: this.summaryLine,
      micOffSeq: this.micOffSeq,
      scouting: this.scouting,
      scoutProgress: this.scoutProgress,
      pendingOptions: this.pending,
      checkSquare: c.inCheck() ? kingSquare(c, c.turn()) : null,
    }
  }

  log(role: Role, title: string, detail?: unknown, ms?: number) {
    const d = detail === undefined ? undefined : typeof detail === 'string' ? detail : JSON.stringify(detail)
    this.trace = [...this.trace.slice(-199), { id: ++this.seq, t: Date.now(), role, title, detail: d, ms }]
    this.emit()
  }

  addTranscript(who: 'kid' | 'buddy', text: string) {
    const last = this.transcript[this.transcript.length - 1]
    if (last && last.who === who) {
      this.transcript = [...this.transcript.slice(0, -1), { who, text: last.text + text }]
    } else {
      this.transcript = [...this.transcript.slice(-49), { who, text }]
    }
    this.emit()
  }

  private say(text: string) {
    // Toggle an invisible suffix so screen readers re-read identical announcements.
    this.announce = this.announce === text ? `${text}\u200b` : text
  }

  // ---------- evaluation ----------
  /** Eval in centipawns from the KID's point of view. */
  private async kidEval(fen: string): Promise<number> {
    const hit = this.evalCache.get(fen)
    if (hit !== undefined) return hit
    const res = await getEngine().analyse(fen, { depth: 10 })
    const stm = fen.split(' ')[1] as Color
    const cp = res.lines[0]?.scoreCp ?? 0
    const kid = stm === this.kidColor ? cp : -cp
    this.evalCache.set(fen, kid)
    return kid
  }

  private overReason(): string | null {
    const c = this.chess
    if (c.isCheckmate()) return c.turn() === this.kidColor ? 'checkmate_opponent_wins' : 'checkmate_kid_wins'
    if (c.isStalemate()) return 'stalemate'
    if (c.isDraw()) return 'draw'
    return null
  }

  private describe(m: Move) {
    return {
      piece: nameOf(m.piece),
      character: this.kidsMode ? CHARACTER[m.piece] : undefined,
      san: this.kidsMode ? undefined : m.san,
      from: m.from,
      from_where: whereIs(m.from, this.kidColor),
      to: m.to,
      to_where: whereIs(m.to, this.kidColor),
      captured: m.captured ? nameOf(m.captured) : null,
      check: this.chess.inCheck(),
      castled: m.flags.includes('k') || m.flags.includes('q'),
      promoted: m.promotion ? nameOf(m.promotion) : null,
    }
  }

  // ---------- Referee + Tutor: the kid's move ----------
  /** Every board-changing action runs one at a time: voice, taps and the engine can't interleave. */
  private lock: Promise<unknown> = Promise.resolve()
  private exclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const run = this.lock.then(fn).finally(() => {
      if (this.thinking) {
        this.thinking = false
        this.emit()
      }
    })
    this.lock = run.catch(() => undefined)
    return run
  }

  makeMove(intent: MoveIntent) {
    return this.exclusive(() => this.makeMoveInner(intent))
  }

  opponentMove() {
    return this.exclusive(() => this.opponentMoveInner())
  }

  private async makeMoveInner(intent: MoveIntent): Promise<Record<string, unknown>> {
    if (this.overReason()) return { status: 'game_over', reason: this.overReason() }
    if (this.chess.turn() !== this.kidColor) return { status: 'not_your_turn' }
    const t0 = performance.now()
    const r = resolveMove(this.chess, intent, this.pending)
    if (r.status === 'ask') {
      this.pending = r.options
      this.say(`${r.question} ${r.options.map((o, i) => `${i + 1}: ${o.label}`).join('. ')}`)
      this.log('Referee', 'Ambiguous → ask kid', { question: r.question, options: r.options.map((o) => o.san) }, performance.now() - t0)
      return { status: 'need_clarification', question: r.question, options: r.options.map((o, i) => ({ option: i + 1, ...o })) }
    }
    if (r.status === 'illegal') {
      this.log('Referee', 'Rejected: not legal', r.reason, performance.now() - t0)
      this.say(`That move isn't allowed: ${r.reason}.`)
      this.emit()
      return { status: 'not_legal', reason: r.reason, facts: r.facts }
    }
    this.pending = null

    this.thinking = true
    this.emit()
    const fenBefore = this.chess.fen()
    const cpBefore = await this.kidEval(fenBefore)
    const move = this.chess.move(r.move)
    this.lastMove = { from: move.from, to: move.to }
    const you = this.describe(move)
    this.say(`You moved your ${you.piece} to ${move.to}${you.captured ? `, taking a ${you.captured}` : ''}.`)
    this.log('Referee', `Legal ✓ ${move.san}`, intent, performance.now() - t0)

    const over = this.overReason()
    if (over) {
      this.thinking = false
      // The finishing move counts too (a checkmate is the best move of the game).
      const won = over === 'checkmate_kid_wins'
      this.kidMoves.push({ san: move.san, wpBefore: winProb(cpBefore), wpAfter: won ? 1 : 0.5, blunder: false, motif: null, afterHint: this.hintOpen })
      this.hintOpen = false
      this.finishGame()
      return { status: 'played', you_played: you, game_over: over }
    }

    // Tutor: did this move throw something away?
    const t1 = performance.now()
    const cpAfter = await this.kidEval(this.chess.fen())
    const wpBefore = winProb(cpBefore)
    const wpAfter = winProb(cpAfter)
    const loss = wpBefore - wpAfter
    const blunder = loss >= BLUNDER_WIN_PROB_LOSS && wpAfter < 0.85
    const afterHint = this.hintOpen
    this.hintOpen = false
    const kidMoveIdx = this.kidMoves.length
    const canHint = kidMoveIdx - this.lastHintAtKidMove >= HINT_COOLDOWN_KID_MOVES
    let motif: string | null = null
    let hintFacts: Record<string, unknown> | null = null
    if (blunder) ({ motif, hintFacts } = await this.punishment())
    this.kidMoves.push({ san: move.san, wpBefore, wpAfter, blunder, motif, afterHint })
    this.log(
      'Tutor',
      blunder ? `Blunder spotted (${motif ?? 'material'})` : afterHint ? 'Retry after hint ✓' : 'Move OK',
      { winProbBefore: wpBefore.toFixed(2), winProbAfter: wpAfter.toFixed(2), hint: blunder && canHint },
      performance.now() - t1,
    )

    if (blunder && motif) this.bumpMistake(motif)

    if (blunder && canHint) {
      this.lastHintAtKidMove = kidMoveIdx
      this.hintOpen = true
      this.say(`${this.announce} Wait! Something is in danger. Say undo to try again, or keep going.`)
      this.thinking = false
      this.emit()
      return {
        status: 'played',
        you_played: you,
        tutor: {
          intervene: true,
          instruction:
            'Do NOT reveal the answer. Ask ONE short question that points at the danger below, then offer to take the move back (they can say "undo").',
          danger: hintFacts,
        },
        opponent_waiting: true,
      }
    }

    const opp = await this.opponentMoveInner()
    return {
      status: 'played',
      you_played: you,
      praise: afterHint && !blunder ? 'kid fixed the mistake after the hint question' : undefined,
      opponent_played: opp,
    }
  }

  /** What the opponent's best reply would do to the kid after a blunder (engine + chess.js facts). */
  private async punishment(): Promise<Punishment> {
    const res = await getEngine().analyse(this.chess.fen(), { depth: 10 })
    return classifyPunishment(this.chess.fen(), res.lines[0], this.kidColor)
  }

  // ---------- Opponent ----------
  private async opponentMoveInner(): Promise<Record<string, unknown>> {
    if (this.overReason() || this.chess.turn() === this.kidColor) return { status: 'not_opponent_turn' }
    this.thinking = true
    this.emit()
    const t0 = performance.now()
    const res = await getEngine().analyse(this.chess.fen(), { depth: 8, multiPv: 4 })
    const lines = res.lines.length ? res.lines : []
    // Softmax over centipawn loss: low levels pick weaker moves more often, so kids can win.
    const tau = [0, 260, 140, 70, 30, 8][this.level] ?? 70
    const bestCp = Math.max(...lines.map((l) => l.scoreCp))
    const weights = lines.map((l) => Math.exp(-(bestCp - l.scoreCp) / tau))
    let r = Math.random() * weights.reduce((a, b) => a + b, 0)
    let pick = 0
    while (pick < weights.length - 1 && (r -= weights[pick]) > 0) pick++
    const uci = lines[pick]?.move
    const move = uci
      ? this.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' })
      : this.chess.move(this.chess.moves()[0])
    this.lastMove = { from: move.from, to: move.to }
    const opp = this.describe(move)
    this.say(`Buddy moved the ${opp.piece} to ${move.to}${opp.captured ? `, taking your ${opp.captured}` : ''}${opp.check ? '. Check!' : '.'}`)
    this.thinking = false
    this.log('Opponent', `Engine plays ${move.san}`, { level: this.level, choseLine: pick + 1, of: lines.length }, performance.now() - t0)
    const over = this.overReason()
    if (over) this.finishGame()
    return { ...opp, game_over: over ?? undefined, your_king_in_check: this.chess.inCheck() }
  }

  // ---------- Board awareness ----------
  async analysePosition(): Promise<Record<string, unknown>> {
    const t0 = performance.now()
    const c = this.chess
    const threats = threatsAgainst(c, this.kidColor).map((t) => ({
      piece: t.victim.name,
      square: t.victim.square,
      where: t.victim.where,
      attacked_by: t.attackers.map((a) => `${a.name} on ${a.square}`),
      defended: t.defended,
      in_danger: t.hanging,
    }))
    const targets = threatsAgainst(c, other(this.kidColor))
      .filter((t) => t.hanging)
      .map((t) => ({ enemy_piece: t.victim.name, square: t.victim.square, where: t.victim.where }))
    const cp = await this.kidEval(c.fen())
    const wp = winProb(cp)
    const feeling = wp > 0.8 ? 'kid is winning' : wp > 0.6 ? 'kid is a bit ahead' : wp > 0.4 ? 'about equal' : wp > 0.2 ? 'opponent is a bit ahead' : 'opponent is winning'
    const m = material(c)
    const out = {
      engine_eval_pawns: this.kidsMode || Math.abs(cp) > 90000 ? undefined : Math.round(cp) / 100,
      forced_mate: Math.abs(cp) > 90000 ? { by: cp > 0 ? 'you' : 'opponent', in_moves: 100000 - Math.abs(cp) } : undefined,
      in_check: c.inCheck() && c.turn() === this.kidColor,
      your_pieces_under_attack: threats,
      enemy_pieces_you_can_win: targets,
      overall: feeling,
      material: { yours: this.kidColor === 'w' ? m.white : m.black, theirs: this.kidColor === 'w' ? m.black : m.white },
    }
    this.log('Tutor', 'analyse_position', { threats: threats.length, targets: targets.length, overall: feeling }, performance.now() - t0)
    return out
  }

  describeBoard(focus: string = 'all'): Record<string, unknown> {
    const c = this.chess
    const me = this.kidColor
    let out: Record<string, unknown>
    if (focus === 'king') {
      const k = kingSquare(c, me)
      out = { your_king: { square: k, where: whereIs(k, me), in_check: c.inCheck() && c.turn() === me } }
    } else if (focus === 'last_move') {
      const h = c.history({ verbose: true })
      const m = h[h.length - 1]
      out = m ? { last_move: { by: m.color === me ? 'you' : 'buddy', piece: nameOf(m.piece), from: m.from, to: m.to, captured: m.captured ? nameOf(m.captured) : null } } : { last_move: null }
    } else {
      const { yours, theirs } = boardListing(c, me)
      const fmt = (l: typeof yours) => l.map((p) => `${p.name} on ${p.square} (${p.where})`)
      out = focus === 'mine' ? { your_pieces: fmt(yours) } : focus === 'theirs' ? { buddy_pieces: fmt(theirs) } : { your_pieces: fmt(yours), buddy_pieces: fmt(theirs) }
      out.you_play = colorName(me)
    }
    this.log('Board', `describe_board(${focus})`, undefined)
    return out
  }

  undo() {
    return this.exclusive(() => this.undoInner())
  }

  private undoInner(): Record<string, unknown> {
    const h = this.chess.history({ verbose: true })
    // Only undo if the player has a move to take back (never the buddy's opening move as black).
    if (!h.some((m) => m.color === this.kidColor)) return { status: 'nothing_to_undo' }
    const undone: string[] = []
    if (h[h.length - 1].color !== this.kidColor) undone.push(this.chess.undo()!.san)
    const k = this.chess.undo()
    if (k) undone.push(k.san)
    if (k && this.kidMoves.length) this.kidMoves.pop()
    const prev = this.chess.history({ verbose: true }).at(-1)
    this.lastMove = prev ? { from: prev.from, to: prev.to } : null
    this.pending = null
    this.say('Move taken back. Your turn!')
    this.log('Referee', 'Undo', { undone })
    return { status: 'undone', moves_taken_back: undone.length, your_turn: true, hint_still_open: this.hintOpen }
  }

  // ---------- Memory ----------
  remember(kind: string, value: string): Record<string, unknown> {
    const v = value.trim().slice(0, 60)
    if (kind === 'name') this.profile = { ...this.profile, name: v }
    else this.profile = { ...this.profile, notes: [...this.profile.notes.filter((n) => n !== v).slice(-9), v] }
    saveProfile(this.profile)
    this.log('Memory', `remember ${kind}`, v)
    return { status: 'saved', profile: this.memorySummary() }
  }

  private bumpMistake(motif: string) {
    const mistakes = { ...this.profile.mistakes, [motif]: (this.profile.mistakes[motif] ?? 0) + 1 }
    this.profile = { ...this.profile, mistakes }
    saveProfile(this.profile)
    this.log('Memory', `mistake +1: ${motif}`, mistakes)
  }

  memorySummary() {
    const p = this.profile
    return { name: p.name, games_played: p.gamesPlayed, wins: p.wins, recurring_mistakes: topMistakes(p), notes: p.notes, practice_plan: p.scout?.headline ?? null }
  }

  private finishGame() {
    if (this.gameRecorded) return
    this.gameRecorded = true
    const over = this.overReason()
    const p = { ...this.profile, gamesPlayed: this.profile.gamesPlayed + 1 }
    if (over === 'checkmate_kid_wins') p.wins++
    else if (over === 'checkmate_opponent_wins') p.losses++
    else p.draws++
    this.profile = p
    saveProfile(p)
    this.log('Memory', 'Game recorded', { over })
    this.summaryLine = this.gameSummary().parent_line
    this.panel = 'summary'
  }

  // ---------- Scout (background agent) ----------
  async scout(source: ScoutSource): Promise<Record<string, unknown>> {
    if (this.scouting) return { status: 'already_scouting' }
    this.scouting = true
    this.emit()
    const t0 = performance.now()
    try {
      const report = await runScout(source, this.apiKey, (title, detail) => {
        this.scoutProgress = title
        this.log('Scout', title, detail)
      })
      this.scoutReport = report
      // Memory learns the recurring mistakes, so the Tutor and the next session know them.
      // Replaced (not added) on each run, so re-scouting the same games doesn't double-count.
      this.profile = {
        ...this.profile,
        scoutMistakes: report.motifs,
        scout: report.plan
          ? { username: report.username, at: Date.now(), headline: report.plan.headline, focus: report.plan.focus, tips: report.plan.tips }
          : this.profile.scout,
      }
      saveProfile(this.profile)
      this.log('Memory', 'Scout findings saved', { recurring: topMistakes(this.profile) }, performance.now() - t0)
      return {
        status: 'done',
        games_reviewed: report.games,
        record: report.record,
        big_mistakes: report.mistakes,
        mistake_types: report.motifs,
        when: report.phases,
        examples: report.examples.slice(0, 3),
        plan: report.plan,
        instruction: 'Tell the child what you found in ONE or TWO short, warm sentences (use plan.buddy_line), then keep playing. Watch for plan.focus during the game.',
      }
    } catch (e) {
      this.log('Scout', 'Failed', String(e))
      return { status: 'failed', reason: String(e) }
    } finally {
      this.scouting = false
      this.emit()
    }
  }

  // ---------- Parent summary ----------
  gameSummary() {
    const blunders = this.kidMoves.filter((m) => m.blunder)
    const motifs = [...new Set(blunders.map((m) => m.motif).filter(Boolean))] as string[]
    const fixed = this.kidMoves.filter((m) => m.afterHint && !m.blunder).length
    const best = [...this.kidMoves].sort((a, b) => b.wpAfter - b.wpBefore - (a.wpAfter - a.wpBefore))[0]
    const p = this.profile
    const summary = {
      name: p.name ?? 'Your child',
      moves_played: this.kidMoves.length,
      result: this.overReason() ?? 'in_progress',
      mistakes_this_game: blunders.length,
      practised: motifs,
      found_better_move_after_hint: fixed,
      best_move: best && best.wpAfter - best.wpBefore > 0.03 ? best.san : null,
      record: { games: p.gamesPlayed, wins: p.wins, losses: p.losses, draws: p.draws },
      recurring_mistakes: topMistakes(p),
    }
    const result =
      summary.result === 'checkmate_kid_wins'
        ? 'won by checkmate'
        : summary.result === 'checkmate_opponent_wins'
          ? 'lost to the buddy this time'
          : summary.result === 'in_progress'
            ? 'is in the middle of a game'
            : 'drew'
    const n = summary.moves_played
    const parts = [
      `${summary.name} ${result} after ${n} move${n === 1 ? '' : 's'}.`,
      motifs.length ? `Practised spotting: ${motifs.join(', ').replace(/_/g, ' ')}.` : '',
      fixed ? `Found a better move after a hint ${fixed} time${fixed > 1 ? 's' : ''}.` : '',
      summary.best_move ? `Best move: ${summary.best_move}.` : '',
      p.gamesPlayed ? `Overall: won ${p.wins} of ${p.gamesPlayed} games.` : '',
      p.scout ? `Practice focus from their online games: ${p.scout.focus.replace(/_/g, ' ')}.` : '',
    ]
    const line = parts.filter(Boolean).join(' ')
    this.profile = { ...p, lastSummary: line }
    saveProfile(this.profile)
    this.log('Memory', 'game_summary', line)
    return { ...summary, parent_line: line }
  }

  setKidsMode(on: boolean) {
    this.kidsMode = on
    setKidsModeFacts(on)
    try {
      localStorage.setItem(KIDS_KEY, on ? '1' : '0')
    } catch {
      /* best-effort */
    }
    this.log('Memory', `Kids mode ${on ? 'on' : 'off'}`)
    return { status: 'ok', kids_mode: on }
  }

  setLevel(level: number) {
    this.level = Math.max(1, Math.min(5, Math.round(level)))
    this.log('Opponent', `Level → ${this.level}`)
    return { status: 'ok', level: this.level }
  }

  newGame(color?: 'white' | 'black') {
    return this.exclusive(() => this.newGameInner(color))
  }

  private async newGameInner(color?: 'white' | 'black') {
    if (color) this.kidColor = color === 'black' ? 'b' : 'w'
    this.chess = new Chess()
    this.lastMove = null
    this.pending = null
    this.kidMoves = []
    this.lastHintAtKidMove = -99
    this.hintOpen = false
    this.gameRecorded = false
    this.panel = null
    this.say(`New game! You play ${colorName(this.kidColor)}.`)
    this.log('Referee', 'New game', { you_play: colorName(this.kidColor) })
    // Playing black: the buddy opens.
    this.thinking = false
    const opening = this.kidColor === 'b' ? await this.opponentMoveInner() : undefined
    return { status: 'new_game', you_play: colorName(this.kidColor), opponent_played: opening }
  }

  // ---------- Settings & screens (all reachable by voice) ----------
  changeSettings(args: Record<string, unknown>): Record<string, unknown> {
    const changed: Record<string, unknown> = {}
    if (isBoardTheme(args.board_theme)) changed.board_theme = this.settings.boardTheme = args.board_theme
    if (isPieceStyle(args.piece_style)) changed.piece_style = this.settings.pieceStyle = args.piece_style
    if (typeof args.show_agent_trace === 'boolean') changed.show_agent_trace = this.settings.showTrace = args.show_agent_trace
    if (typeof args.kids_mode === 'boolean') changed.kids_mode = this.setKidsMode(args.kids_mode).kids_mode
    if (typeof args.level === 'number') changed.level = this.setLevel(args.level).level
    this.settings = { ...this.settings }
    saveSettings(this.settings)
    this.log('Board', 'Settings changed', changed)
    return {
      status: Object.keys(changed).length ? 'ok' : 'nothing_changed',
      changed,
      options: { board_theme: Object.keys(BOARD_THEMES), piece_style: Object.keys(PIECE_STYLES) },
    }
  }

  showPanel(panel: string): Record<string, unknown> {
    let summary: Record<string, unknown> | undefined
    if (panel === 'parent_summary') {
      const r = this.gameSummary()
      summary = r
      this.summaryLine = r.parent_line
      this.panel = 'summary'
    } else if (panel === 'scout') this.panel = 'scout'
    else if (panel === 'help') this.panel = 'help'
    else this.panel = null
    this.log('Board', `Show ${panel}`)
    return { status: 'ok', showing: this.panel ?? 'game', summary }
  }

  /** Voice asked to stop listening; the UI owns the mic, so it watches this counter. */
  micOffSeq = 0
  requestMicOff() {
    this.micOffSeq++
    this.emit()
  }

  closePanel() {
    this.panel = null
    this.emit()
  }

  forgetMe(confirm: boolean): Record<string, unknown> {
    if (!confirm) return { status: 'need_confirmation', note: 'Ask the player to confirm first: this erases their name and history.' }
    resetProfile()
    this.profile = loadProfile()
    this.scoutReport = null
    this.log('Memory', 'Profile erased')
    return { status: 'erased' }
  }
}

export const game = new GameController()
