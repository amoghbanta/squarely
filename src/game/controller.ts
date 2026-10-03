// Game controller: owns the position and runs the Referee, Opponent, Tutor and Memory roles.
// Everything returned from here is computed by chess.js / Stockfish and is safe for the voice agent to phrase.
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js'
import { getEngine } from '../engine/stockfish'
import {
  BLUNDER_WIN_PROB_LOSS,
  CHARACTER,
  setKidsModeFacts,
  STD_NAME,
  pieces,
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
import { HOW_IT_MOVES, LESSONS, lessonFromWords, type Lesson, type LessonId } from '../chess/lessons'
import { THEME_INFO, THEME_FOR_MISTAKE, pickPuzzle, themeFromWords, type Puzzle, type PuzzleTheme } from '../chess/puzzles'
import { hasMoveContent, heardMove } from '../chess/hearing'
import { TALK_STYLE, type TalkStyle } from '../agent/prompt'
import { resolveMove, type MoveIntent, type MoveOption } from '../chess/resolver'
import { classifyPunishment, type Punishment } from '../chess/motifs'
import { clearGames, listGames, newGameId, saveGame, type SavedGame } from '../memory/games'
import { loadProfile, resetProfile, saveProfile, topMistakes, type Profile } from '../memory/store'
import { BOARD_THEMES, PIECE_STYLES, isBoardTheme, isPieceStyle, type BoardTheme, type PieceStyle } from '../ui/themes'
import { runScout, type ScoutReport, type ScoutSource } from '../scout/scout'
import { compress, flatten } from '../memory/condense'
import { gradeMove, moveFacts, type Grade } from '../chess/teach'
import { CONCEPT_KEYS, findConcept, identifyOpening, isBookMove } from '../chess/knowledge'

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

/** One played move with its engine grade (null while not graded). */
export type PlayedMove = { ply: number; san: string; color: Color; to: Square; grade: Grade | null }

export type Mark = { square: Square; kind: 'danger' | 'focus' | 'target' }
export type Arrow = { from: Square; to: Square; kind: 'move' | 'threat' | 'option' | 'suggest' }
export type Marks = { squares: Mark[]; arrows: Arrow[] }
export type BuddyMood = 'worried' | 'happy' | null

export type TranscriptLine = { who: 'kid' | 'buddy'; text: string; sources: string[]; done?: boolean }

export type GameSnapshot = {
  fen: string
  lastMove: { from: Square; to: Square } | null
  kidColor: Color
  turn: Color
  over: string | null
  thinking: boolean
  trace: TraceEntry[]
  transcript: TranscriptLine[]
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
  summary: SummaryStats | null
  micOffSeq: number
  marks: Marks
  mood: BuddyMood
  hintOpen: boolean
  moves: PlayedMove[]
  puzzle: PuzzleView | null
  lesson: LessonView | null
  review: ReviewView | null
  paused: boolean
  savedGames: SavedGame[]
  gameId: string
}

/** Numbers for the game summary card. */
export type SummaryStats = {
  result: string
  moves: number
  mistakes: number
  fixedAfterHint: number
  bestMove: string | null
  practised: string[]
  wins: number
  games: number
}

/** A saved game being replayed move by move. */
export type ReviewView = {
  id: string
  started: number
  result: SavedGame['result']
  opening: string | null
  ply: number
  total: number
  san: string | null
  by: 'you' | 'buddy' | null
  grade: Grade | null
}

/** What the UI shows about the lesson in progress. */
export type LessonView = {
  id: LessonId
  index: number
  count: number
  title: string
  how: string
  gobbled: number
  total: number
  reach: string | null
  done: boolean
}

/** What the UI shows about the puzzle in progress. Never includes the answer. */
export type PuzzleView = {
  id: string
  theme: PuzzleTheme
  label: string
  goal: string
  rating: number
  found: number // player moves found so far
  total: number // player moves in the solution
  hintLevel: number
  solved: boolean
  url: string
}

export type Panel = 'summary' | 'scout' | 'help' | null
export type Settings = { boardTheme: BoardTheme; pieceStyle: PieceStyle; showTrace: boolean; language: string; talk: TalkStyle }

const SETTINGS_KEY = 'squarely.settings.v1'
const loadSettings = (): Settings => {
  const d: Settings = { boardTheme: 'meadow', pieceStyle: 'friends', showTrace: true, language: 'English', talk: 'balanced' }
  try {
    const v = { ...d, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>) }
    // "auto" (follow the player) is gone: Live drifted between languages mid-game. See README, Known issues.
    if (v.language === 'auto') v.language = 'English'
    return v
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

// Long enough for the kid's piece to finish sliding before the buddy answers.
const MIN_THINK_MS = 550
const HINT_COOLDOWN_KID_MOVES = 3
const KIDS_KEY = 'squarely.kidsMode'
const readKidsMode = () => {
  try {
    // Off unless a grown-up turned it on in settings.
    return localStorage.getItem(KIDS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Use the player's own words (repaired for sound-alikes) to correct the model's reading, carefully:
 * they fill fields the model left empty, and replace the moving piece only when the words name exactly
 * one piece being moved ("night to G3" → knight). Castling is never added on top of a piece move.
 */
function withHeard(intent: MoveIntent): MoveIntent {
  if (!intent.heard || intent.option || intent.san || intent.castle) return intent
  const h = heardMove(intent.heard)
  if (h.castle && !intent.piece && !intent.capture && !intent.to) return { castle: h.castle }
  const out: MoveIntent = { ...intent }
  if (h.piece && h.piece !== intent.piece) out.piece = h.piece as MoveIntent['piece']
  if (h.to && !intent.to) out.to = h.to
  if (h.from && !intent.from) out.from = h.from
  return out
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
  private marks: Marks = { squares: [], arrows: [] }
  private mood: BuddyMood = null
  summaryLine: string | null = null
  private summaryStats: SummaryStats | null = null
  private scoutReport: ScoutReport | null = null
  private scouting = false
  private scoutProgress = ''
  private pending: MoveOption[] | null = null
  private lastMove: { from: Square; to: Square } | null = null
  private trace: TraceEntry[] = []
  private transcript: TranscriptLine[] = []
  private queuedSources: { tool: string; at: number }[] = []
  private announce = ''
  private thinking = false
  private kidMoves: KidMoveLog[] = []
  private grades: (Grade | null)[] = [] // per ply, aligned with chess.history()
  private lastHintAtKidMove = -99
  private hintOpen = false // tutor intervened and is waiting for the kid to retry
  private gameRecorded = false
  private lineSeq = 0 // transcript lines ever added (the array itself is capped)
  private profileEpoch = 0 // bumped by forgetMe so in-flight writers drop stale results
  private evalCache = new Map<string, number>()
  private listeners = new Set<() => void>()
  private snap: GameSnapshot
  private seq = 0

  constructor() {
    setKidsModeFacts(this.kidsMode)
    this.resumeLastGame()
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
      summary: this.summaryStats,
      micOffSeq: this.micOffSeq,
      marks: this.marks,
      moves: this.chess.history({ verbose: true }).map((m, i) => ({ ply: i, san: m.san, color: m.color, to: m.to, grade: this.grades[i] ?? null })),
      hintOpen: this.hintOpen,
      puzzle: this.puzzleView(),
      lesson: this.lessonView(),
      review: this.reviewView(),
      // Pausing belongs to the game: a puzzle, lesson or replay on top of it is never blocked.
      paused: this.paused && !this.puzzle && !this.lesson && !this.review,
      savedGames: listGames(),
      gameId: this.gameId,
      mood: this.mood,
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
    if (last && last.who === who && !last.done) {
      this.transcript = [...this.transcript.slice(0, -1), { ...last, text: last.text + text }]
    } else {
      // A new buddy line takes the tool results computed since the player spoke: its truth receipts.
      // A new player line drops stale results (older than 2 s: they answered an earlier turn);
      // a new buddy line takes what's queued as its truth receipts.
      if (who === 'kid') this.queuedSources = this.queuedSources.filter((q) => Date.now() - q.at < 2000)
      const sources = who === 'buddy' ? [...new Set(this.queuedSources.map((q) => q.tool))] : []
      if (who === 'buddy') this.queuedSources = []
      this.transcript = [...this.transcript.slice(-49), { who, text, sources }]
      this.lineSeq++
    }
    this.emit()
  }

  /** Record which computed tool result backs what the buddy says next (or is saying now). */
  noteSource(tool: string) {
    const last = this.transcript[this.transcript.length - 1]
    if (last?.who === 'buddy' && !last.done) {
      if (last.sources.includes(tool)) return
      this.transcript = [...this.transcript.slice(0, -1), { ...last, sources: [...last.sources, tool] }]
      this.emit()
    } else {
      this.queuedSources.push({ tool, at: Date.now() })
    }
  }

  /** The buddy finished a spoken turn: later tool results belong to the next line. */
  endBuddyTurn() {
    const last = this.transcript[this.transcript.length - 1]
    if (last?.who === 'buddy' && !last.done) this.transcript = [...this.transcript.slice(0, -1), { ...last, done: true }]
  }

  private say(text: string) {
    // Toggle an invisible suffix so screen readers re-read identical announcements.
    this.announce = this.announce === text ? `${text}\u200b` : text
  }

  // ---------- evaluation ----------
  /** Eval in centipawns from the KID's point of view. */
  /** Grade the move just played (last ply) for the move list and board badge. */
  private gradePly(fenBefore: string, uci: string, wpBefore: number, wpAfter: number): Grade {
    const hist = this.chess.history()
    const ply = hist.length - 1
    const g = gradeMove(fenBefore, uci, wpBefore, wpAfter, isBookMove(hist, ply))
    this.grades[ply] = g
    return g
  }

  private async kidEval(fen: string): Promise<number> {
    // Cached as the side-to-move's score, so switching colours between games can't flip it.
    const stm = fen.split(' ')[1] as Color
    let cp = this.evalCache.get(fen)
    if (cp === undefined) {
      const res = await getEngine().analyse(fen, { depth: 10 })
      cp = res.lines[0]?.scoreCp ?? 0
      if (this.evalCache.size > 500) this.evalCache.clear()
      this.evalCache.set(fen, cp)
    }
    return stm === this.kidColor ? cp : -cp
  }

  private overReason(): string | null {
    // A puzzle's checkmate is the puzzle's answer, not the end of a game.
    if (this.puzzle || this.lesson || this.review) return null
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
      this.persist()
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

  /** Referee: exactly one legal move ({ ok }), or the clarifying question / not-legal result to hand back. */
  private referee(intent: MoveIntent, t0: number): { ok: Move; result?: never } | { ok?: never; result: Record<string, unknown> } {
    // The model may have guessed a move from garbled words ("algo 1 2 3 yes" became b3). If the words it
    // heard hold no chess move at all, refuse and let it ask again. English only: other languages' piece
    // words aren't in the offline parser, so there we trust the model's reading.
    if (intent.heard && !intent.option && this.settings.language === 'English' && !hasMoveContent(intent.heard, this.pending !== null)) {
      this.log('Referee', 'Did not catch a move', { heard: intent.heard }, performance.now() - t0)
      return { result: { status: 'did_not_catch', heard: intent.heard, instruction: 'Those words have no move in them. Ask the player to say it again, like "horse to f3". Do not guess a move.' } }
    }
    const r = resolveMove(this.chess, this.withFocus(withHeard(intent)), this.pending)
    if (r.status === 'ask') {
      this.pending = r.options
      const froms = [...new Set(r.options.map((o) => o.from))]
      if (froms.length === 1) this.focusPiece = { type: this.chess.get(froms[0])!.type, from: froms[0] }
      this.point(
        r.options.map((o) => ({ from: o.from, to: o.to, kind: 'option' as const })),
        [...new Set(r.options.map((o) => o.from))].map((sq) => ({ square: sq, kind: 'focus' as const })),
      )
      this.say(`${r.question} ${r.options.map((o, i) => `${i + 1}: ${o.label}`).join('. ')}`)
      this.log('Referee', 'Ambiguous → ask kid', { question: r.question, options: r.options.map((o) => o.san) }, performance.now() - t0)
      return { result: { status: 'need_clarification', question: r.question, options: r.options.map((o, i) => ({ option: i + 1, ...o })) } }
    }
    if (r.status === 'illegal') {
      this.log('Referee', 'Rejected: not legal', r.reason, performance.now() - t0)
      this.say(`That move isn't allowed: ${r.reason}.`)
      // Show where that piece CAN go, so "it can go to f3 or h4" is on the board too.
      const dests = (r.facts.legalDestinationsForThatPiece ?? []) as { from: Square; to: Square }[]
      if (dests.length) {
        if (dests.length <= 8) this.point(dests.map((d) => ({ from: d.from, to: d.to, kind: 'option' as const })), [])
        else this.point([], [...new Set(dests.map((d) => d.to))].map((sq) => ({ square: sq, kind: 'focus' as const })))
        const froms = [...new Set(dests.map((d) => d.from))]
        this.focusPiece = { type: this.chess.get(froms[0])!.type, from: froms.length === 1 ? froms[0] : null }
      }
      this.emit()
      return { result: { status: 'not_legal', reason: r.reason, facts: r.facts } }
    }
    this.pending = null
    this.focusPiece = null
    return { ok: r.move }
  }

  /** The piece we were just talking about ("it can go to f3 or h4"), so "move it to f3" needs no piece name. */
  private focusPiece: { type: PieceSymbol; from: Square | null } | null = null

  private withFocus(intent: MoveIntent): MoveIntent {
    const f = this.focusPiece
    if (!f || intent.piece || intent.from || !intent.to || intent.option || intent.san || intent.castle) return intent
    const to = intent.to.toLowerCase()
    const fits = this.chess.moves({ verbose: true }).filter((m) => m.piece === f.type && m.to === to && (!f.from || m.from === f.from))
    if (!fits.length) return intent
    return { ...intent, piece: STD_NAME[f.type] as MoveIntent['piece'], from: fits.length === 1 ? fits[0].from : undefined }
  }

  private async makeMoveInner(intent: MoveIntent): Promise<Record<string, unknown>> {
    if (this.puzzle) return this.puzzleMoveInner(intent)
    if (this.lesson) return this.lessonMoveInner(intent)
    if (this.review) return { status: 'reviewing', instruction: 'This is a replay of an old game. Say "next move", "go back", or "done reviewing" (stop_review) to play again.' }
    if (this.paused) return { status: 'paused', instruction: 'The game is paused. Ask if they want to resume (resume_game).' }
    if (this.overReason()) return { status: 'game_over', reason: this.overReason() }
    if (this.chess.turn() !== this.kidColor) return { status: 'not_your_turn' }
    const t0 = performance.now()
    const r = this.referee(intent, t0)
    if (!r.ok) return r.result
    this.pending = null

    this.thinking = true
    this.emit()
    const fenBefore = this.chess.fen()
    const cpBefore = await this.kidEval(fenBefore)
    const move = this.chess.move(r.ok)
    this.lastMove = { from: move.from, to: move.to }
    this.marks = { squares: [], arrows: [] }
    this.mood = null
    const you = this.describe(move)
    this.say(`You moved your ${you.piece} to ${move.to}${you.captured ? `, taking a ${you.captured}` : ''}.`)
    this.log('Referee', `Legal ✓ ${move.san}`, intent, performance.now() - t0)

    const over = this.overReason()
    if (over) {
      this.thinking = false
      // The finishing move counts too (a checkmate is the best move of the game).
      const won = over === 'checkmate_kid_wins'
      this.kidMoves.push({ san: move.san, wpBefore: winProb(cpBefore), wpAfter: won ? 1 : 0.5, blunder: false, motif: null, afterHint: this.hintOpen })
      this.gradePly(fenBefore, move.lan, winProb(cpBefore), won ? 1 : 0.5)
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
    let dangerSquares: string[] = []
    if (blunder) ({ motif, hintFacts, squares: dangerSquares = [] } = await this.punishment())
    this.kidMoves.push({ san: move.san, wpBefore, wpAfter, blunder, motif, afterHint })
    const grade = this.gradePly(fenBefore, move.lan, wpBefore, wpAfter)
    this.log(
      'Tutor',
      blunder ? `Blunder spotted (${motif ?? 'material'})` : afterHint ? 'Retry after hint ✓' : 'Move OK',
      { grade, winProbBefore: wpBefore.toFixed(2), winProbAfter: wpAfter.toFixed(2), hint: blunder && canHint },
      performance.now() - t1,
    )

    if (blunder && motif) this.bumpMistake(motif)

    if (blunder && canHint) {
      this.lastHintAtKidMove = kidMoveIdx
      this.hintOpen = true
      // Point at the piece in danger (never at the answer) and look worried.
      this.point([], dangerSquares.map((q) => ({ square: q as Square, kind: 'danger' as const })))
      this.mood = 'worried'
      this.say(`${this.announce} Wait! Something is in danger. Say undo to try again, or keep going.`)
      this.thinking = false
      this.emit()
      return {
        status: 'played',
        you_played: you,
        move_grade: grade,
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
      move_grade: grade,
      praise: afterHint && !blunder ? (this.setMood('happy'), 'kid fixed the mistake after the hint question') : undefined,
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
    if (this.puzzle) return { status: 'in_puzzle', instruction: 'A puzzle is on: the opponent only moves when the player finds the right move.' }
    if (this.lesson) return { status: 'in_lesson', instruction: 'In a lesson nobody moves against the player: they keep moving their piece.' }
    if (this.review) return { status: 'reviewing' }
    if (this.paused) return { status: 'paused', instruction: 'The game is paused. Ask if they want to resume (resume_game).' }
    if (this.overReason() || this.chess.turn() === this.kidColor) return { status: 'not_opponent_turn' }
    this.thinking = true
    this.emit()
    const t0 = performance.now()
    const res = await getEngine().analyse(this.chess.fen(), { depth: 8, multiPv: 4 })
    const pause = MIN_THINK_MS - (performance.now() - t0)
    if (pause > 0) await new Promise((r) => setTimeout(r, pause))
    const lines = res.lines.length ? res.lines : []
    // Softmax over centipawn loss: low levels pick weaker moves more often, so kids can win.
    const tau = [0, 260, 140, 70, 30, 8][this.level] ?? 70
    const bestCp = Math.max(...lines.map((l) => l.scoreCp))
    const weights = lines.map((l) => Math.exp(-(bestCp - l.scoreCp) / tau))
    let r = Math.random() * weights.reduce((a, b) => a + b, 0)
    let pick = 0
    while (pick < weights.length - 1 && (r -= weights[pick]) > 0) pick++
    const uci = lines[pick]?.move
    const fenBefore = this.chess.fen()
    const move = uci
      ? this.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' })
      : this.chess.move(this.chess.moves()[0])
    this.lastMove = { from: move.from, to: move.to }
    // The kid chose to play on instead of retrying, so the hint is over (no praise for the next move).
    this.hintOpen = false
    if (lines[pick]) this.gradePly(fenBefore, move.lan, winProb(bestCp), winProb(lines[pick].scoreCp))
    this.point([{ from: move.from, to: move.to, kind: 'move' }], [])
    const opp = this.describe(move)
    this.say(`Buddy moved the ${opp.piece} to ${move.to}${opp.captured ? `, taking your ${opp.captured}` : ''}${opp.check ? '. Check!' : '.'}`)
    this.thinking = false
    this.log('Opponent', `Engine plays ${move.san}`, { level: this.level, choseLine: pick + 1, of: lines.length }, performance.now() - t0)
    const over = this.overReason()
    if (over) this.finishGame()
    return { ...opp, game_over: over ?? undefined, your_king_in_check: this.chess.inCheck() }
  }

  // ---------- Board awareness ----------
  analysePosition() {
    return this.exclusive(() => this.analysePositionInner())
  }

  private async analysePositionInner(): Promise<Record<string, unknown>> {
    if (this.lesson) return this.explainPieceInner(this.lesson.l.piece)
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
    const under = threatsAgainst(c, this.kidColor)
    this.point(
      under.flatMap((t) => t.attackers.map((a) => ({ from: a.square, to: t.victim.square, kind: 'threat' as const }))),
      [
        ...under.map((t) => ({ square: t.victim.square, kind: 'danger' as const })),
        ...targets.map((t) => ({ square: t.square, kind: 'target' as const })),
      ],
    )
    this.log('Tutor', 'analyse_position', { threats: threats.length, targets: targets.length, overall: feeling }, performance.now() - t0)
    return out
  }

  // ---------- Teaching: show, don't just tell ----------
  /** Coach: the engine's best move, optionally for one piece only, with facts about why. Draws a green arrow. */
  suggestMove(pieceWord?: string) {
    return this.exclusive(() => this.suggestMoveInner(pieceWord))
  }

  private async suggestMoveInner(pieceWord?: string): Promise<Record<string, unknown>> {
    if (this.puzzle) return { status: 'in_puzzle', instruction: 'Use puzzle_hint instead, so the player still gets to find it.' }
    if (this.lesson) return this.explainPieceInner(this.lesson.l.piece)
    const t0 = performance.now()
    const c = this.chess
    if (this.overReason()) return { status: 'game_over' }
    if (c.turn() !== this.kidColor) return { status: 'not_your_turn' }
    const SYM: Record<string, string> = { pawn: 'p', knight: 'n', horse: 'n', bishop: 'b', rook: 'r', castle: 'r', queen: 'q', king: 'k' }
    const sym = pieceWord ? SYM[pieceWord.toLowerCase()] : undefined
    const legal = c.moves({ verbose: true }).filter((m) => !sym || m.piece === sym)
    if (!legal.length) return { status: 'no_moves_for_piece', piece: pieceWord, explain: `Your ${pieceWord} has no legal moves right now.` }
    const fen = c.fen()
    const searchMoves = sym ? legal.map((m) => m.from + m.to + (m.promotion ?? '')) : undefined
    const [res, overallCp] = await Promise.all([
      getEngine().analyse(fen, { depth: 12, multiPv: Math.min(2, legal.length), searchMoves }),
      sym ? this.kidEval(fen) : Promise.resolve(null),
    ])
    const best = res.lines[0]
    if (!best) return { status: 'engine_unavailable' }
    const facts = moveFacts(fen, best.move, this.kidColor, this.kidsMode)
    if (!facts) return { status: 'engine_unavailable' }
    const wpBest = winProb(best.scoreCp)
    const second = res.lines[1]
    const onlyMove = second ? wpBest - winProb(second.scoreCp) > 0.15 : true
    // For one piece: is moving it actually a good idea compared with the best move overall?
    const pieceIsGoodChoice = overallCp === null ? undefined : winProb(overallCp) - wpBest <= 0.07
    this.point([{ from: facts.from, to: facts.to, kind: 'suggest' }], [{ square: facts.to, kind: 'target' }])
    this.mood = 'happy'
    this.say(`Try ${facts.piece} to ${this.kidsMode ? facts.to_where : facts.to}. The green arrow shows it.`)
    this.log('Tutor', `Suggests ${facts.san}`, { for: pieceWord ?? 'any piece', idea: facts.idea, only: onlyMove }, performance.now() - t0)
    this.emit()
    return {
      status: 'ok',
      suggestion: facts,
      shown_on_board: 'green arrow',
      clearly_best: onlyMove,
      ...(pieceWord ? { moving_this_piece_is_a_good_idea: pieceIsGoodChoice } : {}),
      engine_eval_pawns: this.kidsMode || Math.abs(best.scoreCp) > 90000 ? undefined : Math.round(best.scoreCp) / 100,
    }
  }

  /** Coach: how good was the kid's last move, and what was best there. Shows both as arrows. */
  reviewMove() {
    return this.exclusive(() => this.reviewMoveInner())
  }

  private async reviewMoveInner(): Promise<Record<string, unknown>> {
    if (this.puzzle || this.lesson) return { status: 'in_puzzle', instruction: 'Puzzles and lessons are checked move by move already.' }
    const t0 = performance.now()
    const hist = this.chess.history({ verbose: true })
    const last = [...hist].reverse().find((m) => m.color === this.kidColor)
    if (!last) return { status: 'no_move_yet' }
    const res = await getEngine().analyse(last.before, { depth: 12, multiPv: 1 })
    const best = res.lines[0]
    if (!best) return { status: 'engine_unavailable' }
    const playedCp = await this.kidEval(last.after)
    const loss = Math.max(0, winProb(best.scoreCp) - winProb(playedCp))
    const lastPly = hist.lastIndexOf(last)
    const v: Grade = this.grades[lastPly] ?? gradeMove(last.before, last.lan, winProb(best.scoreCp), winProb(playedCp), isBookMove(this.chess.history(), lastPly))
    const good = v === 'best' || v === 'great' || v === 'brilliant' || v === 'book'
    const played = moveFacts(last.before, last.from + last.to + (last.promotion ?? ''), this.kidColor, this.kidsMode)
    const bestFacts = best.move === last.from + last.to + (last.promotion ?? '') ? null : moveFacts(last.before, best.move, this.kidColor, this.kidsMode)
    this.point(
      [
        { from: last.from, to: last.to, kind: 'move' },
        ...(bestFacts && !good ? [{ from: bestFacts.from, to: bestFacts.to, kind: 'suggest' as const }] : []),
      ],
      [],
    )
    this.mood = good ? 'happy' : null
    this.log('Tutor', `Review ${last.san}: ${v}`, { best: bestFacts?.san ?? last.san, loss: loss.toFixed(2) }, performance.now() - t0)
    this.emit()
    return {
      status: 'ok',
      your_move: played,
      verdict: v,
      better_move: good ? null : bestFacts,
      shown_on_board: bestFacts && !good ? 'your move in blue, the better move in green' : 'your move in blue',
    }
  }

  /** Library: the opening on the board, or a tactic / principle explained. Curated text, not model memory. */
  chessKnowledge(topic?: string): Record<string, unknown> {
    const t = (topic ?? '').trim()
    if (!t || /^(the |this |current |my )*opening$|what.*(called|playing)/i.test(t)) {
      const o = identifyOpening(this.chess.history())
      this.log('Tutor', o ? `Opening: ${o.name}` : 'Opening: not in the book')
      if (!o) return { status: 'unknown_opening', note: 'This position is not in the opening book. Use opening_principles instead.', principles: findConcept('opening_principles')?.[1] }
      // Point at the next book move when it's the kid's turn and it is legal.
      if (o.book_next && this.chess.turn() === this.kidColor) {
        const m = this.chess.moves({ verbose: true }).find((x) => x.san === o.book_next)
        if (m) this.point([{ from: m.from, to: m.to, kind: 'suggest' }], [])
      }
      return { status: 'ok', opening: o.name, idea: this.kidsMode ? o.kid : o.idea, usual_next_move: o.book_next, shown_on_board: o.book_next ? 'green arrow' : undefined }
    }
    const hit = findConcept(t)
    this.log('Tutor', hit ? `Explain ${hit[0]}` : `No entry for "${t}"`)
    if (!hit) return { status: 'not_in_library', topics: CONCEPT_KEYS }
    const [key, c] = hit
    return { status: 'ok', topic: key, title: c.title, explain: this.kidsMode ? c.kid : c.grownup, look_for: c.look_for }
  }

  describeBoard(focus: string = 'all'): Record<string, unknown> {
    const c = this.chess
    const me = this.kidColor
    let out: Record<string, unknown>
    if (focus === 'king') {
      const k = kingSquare(c, me)
      out = { your_king: { square: k, where: whereIs(k, me), in_check: c.inCheck() && c.turn() === me } }
      this.point([], [{ square: k, kind: 'focus' }])
    } else if (focus === 'last_move') {
      const h = c.history({ verbose: true })
      const m = h[h.length - 1]
      if (m) this.point([{ from: m.from, to: m.to, kind: 'move' }], [])
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
    if (this.puzzle) return { status: 'in_puzzle', instruction: 'Nothing to undo in a puzzle: wrong tries never change the board. Offer a hint instead.' }
    if (this.lesson) return this.restartLessonInner()
    const h = this.chess.history({ verbose: true })
    // Only undo if the player has a move to take back (never the buddy's opening move as black).
    if (!h.some((m) => m.color === this.kidColor)) return { status: 'nothing_to_undo' }
    const undone: string[] = []
    if (this.gameRecorded) this.unrecordGame()
    if (h[h.length - 1].color !== this.kidColor) undone.push(this.chess.undo()!.san)
    const k = this.chess.undo()
    if (k) undone.push(k.san)
    if (k && this.kidMoves.length) this.kidMoves.pop()
    this.grades.length = this.chess.history().length
    const prev = this.chess.history({ verbose: true }).at(-1)
    this.lastMove = prev ? { from: prev.from, to: prev.to } : null
    this.pending = null
    this.marks = { squares: [], arrows: [] }
    this.mood = null
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
    if (over === 'checkmate_kid_wins') this.mood = 'happy'
    this.summaryLine = this.gameSummary().parent_line
    this.panel = 'summary'
  }

  // ---------- Puzzles (Lichess puzzle database, CC0) ----------
  // The player solves by voice through the same Referee. Hints climb a ladder (idea → which piece →
  // the move) and every rung comes from the stored solution, so the coach never invents an answer.
  private puzzle: { p: Puzzle; theme: PuzzleTheme; step: number; hintLevel: number; hintsUsed: number; tries: number; solved: boolean } | null = null
  private lastPuzzleTheme: PuzzleTheme | null = null
  private savedGame: { pgn: string; kidColor: Color; grades: (Grade | null)[]; kidMoves: KidMoveLog[]; hintOpen: boolean; lastHintAtKidMove: number } | null = null

  private puzzleView(): PuzzleView | null {
    const z = this.puzzle
    if (!z) return null
    const info = THEME_INFO[z.theme]
    return {
      id: z.p.id,
      theme: z.theme,
      label: info.label,
      goal: this.kidsMode ? info.kidGoal : info.goal,
      rating: z.p.rating,
      found: Math.floor(z.step / 2),
      total: Math.floor(z.p.moves.length / 2),
      hintLevel: z.hintLevel,
      solved: z.solved,
      url: z.p.url,
    }
  }

  private playUci(uci: string): Move {
    const m = this.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    this.lastMove = { from: m.from, to: m.to }
    return m
  }

  startPuzzle(words?: string) {
    return this.exclusive(() => this.startPuzzleInner(words))
  }

  private async startPuzzleInner(words?: string): Promise<Record<string, unknown>> {
    const asked = themeFromWords(words)
    const weak = topMistakes(this.profile)
      .map((m) => THEME_FOR_MISTAKE[m])
      .find(Boolean)
    const theme: PuzzleTheme = asked ?? this.lastPuzzleTheme ?? weak ?? 'mateIn1'
    const why = asked ? 'the player asked for it' : !this.lastPuzzleTheme && weak === theme ? 'it practises a mistake Memory has seen before' : 'more of the same kind'
    this.parkGame()
    this.lesson = null
    const p = pickPuzzle(theme, this.profile.puzzles.seen)
    this.chess = new Chess(p.fen)
    // The puzzle starts with the opponent's move; the player is the side that answers it.
    this.kidColor = other(this.chess.turn())
    this.grades = []
    this.kidMoves = []
    this.pending = null
    this.hintOpen = false
    this.lastMove = null
    this.marks = { squares: [], arrows: [] }
    this.mood = null
    this.panel = null
    this.puzzle = { p, theme, step: 1, hintLevel: 0, hintsUsed: 0, tries: 0, solved: false }
    this.lastPuzzleTheme = theme
    this.emit()
    // Let the board settle, then show the opponent's move sliding in: that's what the player answers.
    this.thinking = true
    this.emit()
    await new Promise((r) => setTimeout(r, 700))
    this.thinking = false
    const setup = this.playUci(p.moves[0])
    this.point([{ from: setup.from, to: setup.to, kind: 'move' }], [])

    const pz = this.profile.puzzles
    const bt = pz.byTheme[theme] ?? { solved: 0, tried: 0 }
    this.profile = {
      ...this.profile,
      puzzles: { ...pz, tried: pz.tried + 1, seen: [...pz.seen, p.id].slice(-400), byTheme: { ...pz.byTheme, [theme]: { ...bt, tried: bt.tried + 1 } } },
    }
    saveProfile(this.profile)
    const info = THEME_INFO[theme]
    const goal = this.kidsMode ? info.kidGoal : info.goal
    this.say(`Puzzle: ${info.label}. ${goal}`)
    this.log('Tutor', `Puzzle ${p.id}: ${info.label}`, { rating: p.rating, why })
    return {
      status: 'puzzle_started',
      puzzle: info.label,
      goal,
      you_play: colorName(this.kidColor),
      opponent_just_played: this.describe(setup),
      your_moves_to_find: Math.floor(p.moves.length / 2),
      difficulty: p.rating < 900 ? 'easy' : p.rating < 1200 ? 'medium' : 'tricky',
      chosen_because: why,
      instruction: 'Say the goal in one short sentence and where the opponent just moved, then wait for their move. No hints yet. Never say the answer unless puzzle_hint gives it.',
    }
  }

  private async puzzleMoveInner(intent: MoveIntent): Promise<Record<string, unknown>> {
    const z = this.puzzle!
    if (z.solved) return { status: 'puzzle_already_solved', instruction: 'Offer another puzzle (start_puzzle) or going back to the game (stop_puzzle).' }
    const t0 = performance.now()
    const r = this.referee(intent, t0)
    if (!r.ok) return r.result
    const want = z.p.moves[z.step]
    const uci = r.ok.lan
    const last = z.step >= z.p.moves.length - 1
    // Lichess accepts any checkmate on the final move, so do we.
    let right = uci === want
    if (!right && last) {
      const c = new Chess(this.chess.fen())
      c.move(r.ok.san)
      right = c.isCheckmate()
    }
    if (!right) {
      z.tries++
      this.point([], [{ square: r.ok.to, kind: 'danger' }])
      this.setMood('worried')
      this.say(`${r.ok.san} is not the answer. Try again!`)
      this.log('Tutor', `Puzzle try ${r.ok.san} ✗`, { tries: z.tries }, performance.now() - t0)
      return {
        status: 'not_the_answer',
        you_tried: { piece: nameOf(r.ok.piece), to_where: whereIs(r.ok.to, this.kidColor), san: r.ok.san },
        board_unchanged: true,
        tries: z.tries,
        instruction: z.tries >= 2 ? 'Be encouraging, then offer a hint (puzzle_hint).' : 'Be encouraging and let them try again. Do not reveal the answer.',
      }
    }
    const mine = this.chess.move(r.ok.san)
    this.lastMove = { from: mine.from, to: mine.to }
    z.step++
    z.hintLevel = 0
    const you = { ...this.describe(mine), san: mine.san }
    if (z.step >= z.p.moves.length || this.chess.isCheckmate()) {
      z.solved = true
      const pz = this.profile.puzzles
      const bt = pz.byTheme[z.theme] ?? { solved: 0, tried: 1 }
      this.profile = { ...this.profile, puzzles: { ...pz, solved: pz.solved + 1, byTheme: { ...pz.byTheme, [z.theme]: { ...bt, solved: bt.solved + 1 } } } }
      saveProfile(this.profile)
      this.point([{ from: mine.from, to: mine.to, kind: 'suggest' }], [])
      this.setMood('happy')
      this.say(`Solved! ${mine.san}${this.chess.isCheckmate() ? ' is checkmate!' : '!'}`)
      this.log('Tutor', `Puzzle solved ✓`, { tries: z.tries, hints: z.hintsUsed }, performance.now() - t0)
      return {
        status: 'solved',
        you_played: you,
        checkmate: this.chess.isCheckmate(),
        wrong_tries: z.tries,
        hints_used: z.hintsUsed,
        puzzles_solved_total: this.profile.puzzles.solved,
        instruction: 'Celebrate in one sentence (bigger if no hints were used), then offer another puzzle or going back to the game.',
      }
    }
    // Right so far: the opponent answers with the puzzle's line.
    this.point([{ from: mine.from, to: mine.to, kind: 'suggest' }], [])
    this.emit()
    this.thinking = true
    this.emit()
    await new Promise((res) => setTimeout(res, 650))
    this.thinking = false
    const reply = this.playUci(z.p.moves[z.step])
    z.step++
    this.point([{ from: reply.from, to: reply.to, kind: 'move' }], [])
    this.say(`Yes! Buddy answers: ${nameOf(reply.piece)} to ${reply.to}. Find the next move.`)
    this.log('Tutor', `Puzzle step ✓ ${mine.san}`, { opponent: reply.san }, performance.now() - t0)
    return {
      status: 'correct_keep_going',
      you_played: you,
      opponent_replied: this.describe(reply),
      your_moves_left: Math.floor((z.p.moves.length - z.step + 1) / 2),
      instruction: 'Say "yes!" and where the opponent replied, then let them find the next move. No hints unless asked.',
    }
  }

  /** Next rung of the hint ladder: 1 the idea, 2 which piece, 3 the move itself. */
  puzzleHint() {
    return this.exclusive(() => this.puzzleHintInner())
  }

  private puzzleHintInner(): Record<string, unknown> {
    const z = this.puzzle
    if (!z) return { status: 'no_puzzle', instruction: 'There is no puzzle on. Offer one (start_puzzle).' }
    if (z.solved) return { status: 'already_solved' }
    z.hintLevel = Math.min(3, z.hintLevel + 1)
    z.hintsUsed++
    const want = z.p.moves[z.step]
    const from = want.slice(0, 2) as Square
    const piece = this.chess.get(from)!
    const concept = findConcept(THEME_INFO[z.theme].concept)?.[1]
    this.log('Tutor', `Puzzle hint ${z.hintLevel}`, { theme: z.theme })
    if (z.hintLevel === 1) {
      this.setMood(null)
      return {
        status: 'hint',
        level: 1,
        idea: concept ? (this.kidsMode ? concept.kid : concept.grownup) : THEME_INFO[z.theme].goal,
        look_for: concept?.look_for,
        instruction: 'Ask ONE question built from look_for. Do not name the piece or the square yet.',
      }
    }
    if (z.hintLevel === 2) {
      this.point([], [{ square: from, kind: 'focus' }])
      return {
        status: 'hint',
        level: 2,
        piece_to_move: nameOf(piece.type),
        where: whereIs(from, this.kidColor),
        square: from,
        shown_on_board: 'that piece is highlighted',
        instruction: 'Tell them which piece (it is glowing on the board), and ask where it could go. Not the square yet.',
      }
    }
    const facts = moveFacts(this.chess.fen(), want, this.kidColor, this.kidsMode)
    const san = new Chess(this.chess.fen()).move({ from, to: want.slice(2, 4), promotion: want[4] }).san
    this.point([{ from, to: want.slice(2, 4) as Square, kind: 'suggest' }], [])
    return {
      status: 'hint',
      level: 3,
      answer: san,
      move: facts,
      shown_on_board: 'green arrow',
      instruction: 'Explain why this move works using only the move facts, then let them play it.',
    }
  }

  // ---------- Saved games: autosave, continue, pause, review ----------
  private gameId = newGameId()
  private gameStarted = Date.now()
  private paused = false
  private review: { g: SavedGame; ply: number; moves: Move[] } | null = null

  private resultOf(): SavedGame['result'] {
    const over = this.overReason()
    return over === 'checkmate_kid_wins' ? 'won' : over === 'checkmate_opponent_wins' ? 'lost' : over ? 'draw' : null
  }

  /** Save the real game after every change (never a puzzle, lesson or replay). */
  private persist() {
    if (this.puzzle || this.lesson || this.review) return
    const h = this.chess.history()
    if (!h.length) return
    saveGame({
      id: this.gameId,
      started: this.gameStarted,
      updated: Date.now(),
      pgn: this.chess.pgn(),
      kidColor: this.kidColor,
      level: this.level,
      result: this.resultOf(),
      moves: h.length,
      grades: [...this.grades],
      opening: identifyOpening(h)?.name ?? null,
    })
  }

  /** Opening the app continues the last unfinished game, exactly where it was left. */
  private resumeLastGame() {
    const g = listGames().find((x) => !x.result)
    if (!g) return
    try {
      this.loadSaved(g)
    } catch {
      /* a corrupt save never blocks a fresh game */
    }
  }

  private loadSaved(g: SavedGame) {
    const c = new Chess()
    c.loadPgn(g.pgn)
    this.chess = c
    this.kidColor = g.kidColor
    this.grades = [...g.grades]
    this.kidMoves = []
    this.gameId = g.id
    this.gameStarted = g.started
    this.gameRecorded = !!g.result
    this.hintOpen = false
    this.pending = null
    this.paused = false
    const h = c.history({ verbose: true }).at(-1)
    this.lastMove = h ? { from: h.from, to: h.to } : null
  }

  pauseGame() {
    return this.exclusive(() => {
      if (this.puzzle || this.lesson || this.review) return { status: 'not_in_a_game' }
      this.paused = true
      this.marks = { squares: [], arrows: [] }
      this.say('Game paused. Say "resume" when you are ready.')
      this.log('Memory', 'Game paused and saved')
      return { status: 'paused', saved: true, instruction: 'Say the game is saved and paused, and they can say "resume" any time, even after closing the app.' }
    })
  }

  resumeGame() {
    return this.exclusive(async () => {
      if (!this.paused) return { status: 'not_paused' }
      this.paused = false
      this.say('Game resumed. Your move!')
      this.log('Memory', 'Game resumed')
      const yourTurn = this.chess.turn() === this.kidColor
      const opp = !yourTurn && !this.hintOpen && !this.overReason() ? await this.opponentMoveInner() : undefined
      return { status: 'resumed', your_turn: this.chess.turn() === this.kidColor, moves_so_far: this.chess.history().length, opponent_played: opp }
    })
  }

  /** "Continue my last game" / "review my last game". which: last | a number from the list (1 = newest) | an id. */
  openGame(which: string | number | undefined, action: 'continue' | 'review') {
    return this.exclusive(async () => {
      const games = listGames()
      const g =
        typeof which === 'number' ? games[which - 1]
        : which && which !== 'last' ? games.find((x) => x.id === which)
        : action === 'continue' ? games.find((x) => !x.result && x.id !== this.gameId) ?? games.find((x) => !x.result)
        : games.find((x) => x.id !== this.gameId || !!x.result) ?? games[0]
      if (!g) return { status: 'no_saved_games', instruction: 'There are no saved games yet. Offer a new game.' }
      if (action === 'continue') {
        if (g.result) return { status: 'already_finished', result: g.result, instruction: 'That game is over. Offer to review it (open_game with action review).' }
        this.persist()
        this.puzzle = null
        this.lesson = null
        this.review = null
        this.savedGame = null
        this.loadSaved(g)
        this.say('Here is your saved game. Your move!')
        this.log('Memory', 'Continued a saved game', { moves: g.moves })
        const opp = this.chess.turn() !== this.kidColor && !this.overReason() ? await this.opponentMoveInner() : undefined
        return { status: 'continued', you_play: colorName(this.kidColor), moves_so_far: g.moves, opening: g.opening, opponent_played: opp }
      }
      this.parkGame()
      this.puzzle = null
      this.lesson = null
      const c = new Chess()
      c.loadPgn(g.pgn)
      this.review = { g, ply: 0, moves: c.history({ verbose: true }) }
      this.log('Memory', 'Reviewing a saved game', { moves: g.moves, result: g.result })
      return { status: 'reviewing', played_on: new Date(g.started).toDateString(), result: g.result ?? 'unfinished', opening: g.opening, total_moves: g.moves, ...(await this.reviewAt(0)), instruction: 'Say what game this is in one sentence, then step through it with review_step when they say "next".' }
    })
  }

  reviewStep(go: string) {
    return this.exclusive(async () => {
      const z = this.review
      if (!z) return { status: 'not_reviewing', instruction: 'Offer to review a saved game (open_game).' }
      const n = Number(go)
      const ply =
        go === 'next' ? z.ply + 1 : go === 'back' ? z.ply - 1 : go === 'start' ? 0 : go === 'end' ? z.moves.length
        : go === 'next_mistake' ? (z.moves.findIndex((m, i) => i >= z.ply && m.color === z.g.kidColor && ['mistake', 'blunder'].includes(z.g.grades[i] ?? '')) + 1 || z.moves.length)
        : Number.isFinite(n) ? n : z.ply
      return this.reviewAt(Math.max(0, Math.min(z.moves.length, ply)))
    })
  }

  /** Put the replay at ply n and say what happened on that move, with the engine's better idea for weak moves. */
  private async reviewAt(ply: number): Promise<Record<string, unknown>> {
    const z = this.review!
    z.ply = ply
    const c = new Chess()
    for (const m of z.moves.slice(0, ply)) c.move(m.san)
    this.chess = c
    this.kidColor = z.g.kidColor
    this.grades = z.g.grades.slice(0, ply)
    const m = z.moves[ply - 1]
    this.lastMove = m ? { from: m.from, to: m.to } : null
    if (!m) {
      this.point([], [])
      return { at_move: 0, of: z.moves.length, note: 'the starting position' }
    }
    const by = m.color === z.g.kidColor ? 'you' : 'buddy'
    const grade = z.g.grades[ply - 1] ?? null
    const facts: Record<string, unknown> = {
      at_move: ply,
      of: z.moves.length,
      by,
      move: { san: m.san, piece: nameOf(m.piece), from: m.from, to: m.to, took: m.captured ? nameOf(m.captured) : undefined },
      grade,
    }
    const arrows: Arrow[] = [{ from: m.from, to: m.to, kind: 'move' }]
    if (by === 'you' && grade && ['inaccuracy', 'mistake', 'blunder'].includes(grade)) {
      const res = await getEngine().analyse(m.before, { depth: 10 })
      const best = res.lines[0]?.move
      if (best && best !== m.lan) {
        const bm = new Chess(m.before).move({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best[4] })
        facts.better_move = { san: bm.san, piece: nameOf(bm.piece), from: bm.from, to: bm.to, took: bm.captured ? nameOf(bm.captured) : undefined }
        facts.shown_on_board = 'their move in blue, the better one as a green arrow'
        arrows.push({ from: bm.from, to: bm.to, kind: 'suggest' })
      }
    }
    this.point(arrows, [])
    this.log('Tutor', `Review move ${ply}: ${m.san}`, { by, grade })
    return facts
  }

  private reviewView(): ReviewView | null {
    const z = this.review
    if (!z) return null
    const m = z.moves[z.ply - 1]
    return {
      id: z.g.id,
      started: z.g.started,
      result: z.g.result,
      opening: z.g.opening,
      ply: z.ply,
      total: z.moves.length,
      san: m?.san ?? null,
      by: m ? (m.color === z.g.kidColor ? 'you' : 'buddy') : null,
      grade: m ? (z.g.grades[z.ply - 1] ?? null) : null,
    }
  }

  // ---------- Learn mode: one piece at a time, for people new to chess ----------
  private lesson: { l: Lesson; gobbled: number; total: number; moves: number; done: boolean } | null = null

  private lessonView(): LessonView | null {
    const z = this.lesson
    if (!z) return null
    const how = HOW_IT_MOVES[z.l.piece]
    return {
      id: z.l.id,
      index: LESSONS.indexOf(z.l),
      count: LESSONS.length,
      title: this.kidsMode ? z.l.title : `The ${STD_NAME[z.l.piece]}`,
      how: this.kidsMode ? how.kid : how.grownup,
      gobbled: z.gobbled,
      total: z.total,
      reach: z.l.reach ?? null,
      done: z.done,
    }
  }

  startLesson(words?: string) {
    return this.exclusive(() => this.startLessonInner(words))
  }

  private startLessonInner(words?: string): Record<string, unknown> {
    const done = this.profile.lessonsDone ?? []
    const next = () => {
      const after = this.lesson ? LESSONS.indexOf(this.lesson.l) + 1 : 0
      return LESSONS.slice(after).find((l) => !done.includes(l.id)) ?? LESSONS[after] ?? LESSONS.find((l) => !done.includes(l.id))
    }
    const l = (words && !/next|another|continue/.test(words) ? lessonFromWords(words) : undefined) ?? next()
    if (!l) {
      return { status: 'all_lessons_done', instruction: 'They know how every piece moves! Offer a checkmate puzzle (start_puzzle theme mateIn1) or their first real game (new_game).' }
    }
    this.parkGame()
    this.puzzle = null
    this.loadLesson(l)
    const how = HOW_IT_MOVES[l.piece]
    this.say(`Lesson: ${this.lessonView()!.title}. ${this.lessonView()!.how}`)
    this.log('Tutor', `Lesson: ${l.id}`, { pawns: this.lesson!.total })
    return {
      status: 'lesson_started',
      lesson: this.lessonView()!.title,
      lesson_number: LESSONS.indexOf(l) + 1,
      of: LESSONS.length,
      how_it_moves: this.kidsMode ? how.kid : how.grownup,
      worth_points: how.worth || undefined,
      task: `Gobble all ${this.lesson!.total} enemy pawns with your ${nameOf(l.piece)}${l.reach ? `, then walk all the way to ${l.reach} to become a queen` : ''}.`,
      shown_on_board: 'the squares it can reach are lit up; the pawns to gobble are circled',
      instruction: 'Explain how_it_moves in your own short, warm words (one idea at a time), then give the task and let them try. No chess notation unless they use it.',
    }
  }

  private loadLesson(l: Lesson) {
    this.chess = new Chess(l.fen, { skipValidation: true })
    this.kidColor = 'w'
    this.grades = []
    this.kidMoves = []
    this.pending = null
    this.hintOpen = false
    this.lastMove = null
    this.mood = null
    this.panel = null
    const total = pieces(this.chess, 'b').length
    this.lesson = { l, gobbled: 0, total, moves: 0, done: false }
    this.showReach()
  }

  /** Light up where the lesson piece can go, and circle the pawns still to gobble. */
  private showReach() {
    const z = this.lesson
    if (!z) return
    const from = pieces(this.chess, 'w').find((sq) => this.chess.get(sq)!.type === z.l.piece)
    const dests = from ? this.chess.moves({ square: from, verbose: true }).map((m) => m.to) : []
    this.point(
      [],
      [
        ...dests.map((sq) => ({ square: sq, kind: 'focus' as const })),
        ...pieces(this.chess, 'b').map((sq) => ({ square: sq, kind: 'target' as const })),
        ...(z.l.reach && !z.done ? [{ square: z.l.reach as Square, kind: 'target' as const }] : []),
      ],
    )
  }

  private restartLessonInner(): Record<string, unknown> {
    if (!this.lesson) return { status: 'no_lesson' }
    this.loadLesson(this.lesson.l)
    this.say('Lesson restarted.')
    return { status: 'lesson_restarted', task: 'Same task again, from the start.' }
  }

  private async lessonMoveInner(intent: MoveIntent): Promise<Record<string, unknown>> {
    const z = this.lesson!
    if (z.done) return { status: 'lesson_already_done', instruction: 'Offer the next lesson (start_lesson) or a game.' }
    const t0 = performance.now()
    const r = this.referee(intent, t0)
    if (!r.ok) return r.result
    const m = this.chess.move(r.ok.san)
    this.lastMove = { from: m.from, to: m.to }
    z.moves++
    if (m.captured) z.gobbled++
    // Nobody plays against you in a lesson: it's your turn again.
    const [board, , castling] = this.chess.fen().split(' ')
    this.chess.load(`${board} w ${castling} - 0 1`, { skipValidation: true })
    const reached = !z.l.reach || pieces(this.chess, 'w').some((sq) => sq === z.l.reach)
    z.done = z.gobbled >= z.total && reached
    const left = z.total - z.gobbled
    if (z.done) {
      const doneList = [...new Set([...(this.profile.lessonsDone ?? []), z.l.id])]
      this.profile = { ...this.profile, lessonsDone: doneList }
      saveProfile(this.profile)
      this.point([{ from: m.from, to: m.to, kind: 'suggest' }], [])
      this.setMood('happy')
      this.say(`Lesson done in ${z.moves} moves!`)
    } else this.showReach()
    this.log('Tutor', `Lesson move ${m.san}${m.captured ? ' (gobbled!)' : ''}`, { left, moves: z.moves }, performance.now() - t0)
    const nextLesson = LESSONS[LESSONS.indexOf(z.l) + 1]
    return {
      status: z.done ? 'lesson_done' : 'lesson_move',
      you_played: { piece: nameOf(m.piece), to: m.to, to_where: whereIs(m.to, 'w'), gobbled_a_pawn: !!m.captured, promoted_to: m.promotion ? nameOf(m.promotion) : undefined },
      pawns_left: left,
      need_to_reach: !z.done && z.l.reach && left === 0 ? z.l.reach : undefined,
      moves_used: z.moves,
      next_lesson: z.done ? (nextLesson ? (this.kidsMode ? nextLesson.title : nextLesson.id) : 'none: offer a checkmate puzzle or a first game') : undefined,
      instruction: z.done
        ? 'Celebrate! Then offer the next lesson (start_lesson) or, if none, their first checkmate puzzle or a game.'
        : m.captured
          ? 'Cheer the gobble in a few words and say how many pawns are left.'
          : 'Short encouragement; remind them the lit-up squares are where it can go.',
    }
  }

  /** "How does the horse move?": the curated rule, plus that piece's real moves drawn on the board. */
  explainPiece(word: string) {
    return this.exclusive(() => {
      const sym = (Object.entries(STD_NAME).find(([, n]) => word.toLowerCase().includes(n))?.[0] ??
        lessonFromWords(word)?.piece) as PieceSymbol | undefined
      if (!sym) return { status: 'unknown_piece', instruction: 'Ask which piece they mean.' }
      return this.explainPieceInner(sym)
    })
  }

  private explainPieceInner(sym: PieceSymbol): Record<string, unknown> {
    const how = HOW_IT_MOVES[sym]
    const mine = pieces(this.chess, this.kidColor).filter((sq) => this.chess.get(sq)!.type === sym)
    if (mine.length) this.focusPiece = { type: sym, from: mine.length === 1 ? mine[0] : null }
    const moves = mine.flatMap((sq) => this.chess.moves({ square: sq, verbose: true }))
    if (moves.length && moves.length <= 8) this.point(moves.map((m) => ({ from: m.from, to: m.to, kind: 'option' as const })), [])
    else if (moves.length) this.point([], [...new Set(moves.map((m) => m.to))].map((sq) => ({ square: sq, kind: 'focus' as const })))
    else this.point([], mine.map((sq) => ({ square: sq, kind: 'focus' as const })))
    this.log('Tutor', `Explain how the ${STD_NAME[sym]} moves`, { on_board: mine.length, moves: moves.length })
    return {
      status: 'ok',
      piece: nameOf(sym),
      how_it_moves: this.kidsMode ? how.kid : how.grownup,
      tip: how.tip,
      worth_points: how.worth || undefined,
      yours_on_board: mine.map((sq) => ({ square: sq, where: whereIs(sq, this.kidColor) })),
      can_go_now: moves.slice(0, 8).map((m) => ({ to: m.to, where: whereIs(m.to, this.kidColor), takes: m.captured ? nameOf(m.captured) : undefined })),
      more_moves: moves.length > 8 ? moves.length - 8 : undefined,
      shown_on_board: moves.length ? 'its moves are drawn on the board' : 'it has no moves right now',
      instruction: mine.length
        ? 'Explain how_it_moves simply, then point at the board. Do not list squares unless asked.'
        : `Explain how_it_moves simply. There is no ${nameOf(sym)} of theirs on this board, so offer to try it in its own lesson (start_lesson ${STD_NAME[sym]}).`,
    }
  }

  /** Park an unfinished game (once) so "back to my game" can bring it back exactly after puzzles or lessons. */
  private parkGame() {
    if (!this.puzzle && !this.lesson && !this.review && this.chess.history().length && !this.overReason()) {
      this.savedGame = { pgn: this.chess.pgn(), kidColor: this.kidColor, grades: [...this.grades], kidMoves: [...this.kidMoves], hintOpen: this.hintOpen, lastHintAtKidMove: this.lastHintAtKidMove }
    }
    // A finished game's "recorded" flag must not leak into the puzzle or the board after it.
    this.gameRecorded = false
  }

  /** Leave puzzles or lessons: bring back the parked game if there was one. */
  stopPuzzle() {
    return this.exclusive(async () => {
      if (!this.puzzle && !this.lesson && !this.review) return { status: 'no_puzzle' }
      this.puzzle = null
      this.lesson = null
      this.review = null
      this.pending = null
      this.marks = { squares: [], arrows: [] }
      this.mood = null
      const g = this.savedGame
      this.savedGame = null
      if (g) {
        this.chess = new Chess()
        this.chess.loadPgn(g.pgn)
        this.kidColor = g.kidColor
        this.grades = g.grades
        this.kidMoves = g.kidMoves
        this.hintOpen = g.hintOpen
        this.lastHintAtKidMove = g.lastHintAtKidMove
        const h = this.chess.history({ verbose: true }).at(-1)
        this.lastMove = h ? { from: h.from, to: h.to } : null
      } else {
        this.chess = new Chess()
        this.kidColor = 'w'
        this.grades = []
        this.kidMoves = []
        this.lastMove = null
        this.hintOpen = false
        this.lastHintAtKidMove = -99
      }
      this.gameRecorded = false
      this.paused = false
      this.say(g ? 'Back to our game!' : 'New game! You play white.')
      this.log('Referee', g ? 'Back to the game' : 'New game after puzzles')
      // Parked on the buddy's turn with no hint pending (e.g. a game started as black): let it move.
      const opp = g && this.chess.turn() !== this.kidColor && !this.hintOpen ? await this.opponentMoveInner() : undefined
      return {
        status: g ? 'back_to_game' : 'new_game',
        you_play: colorName(this.kidColor),
        your_turn: this.chess.turn() === this.kidColor,
        hint_still_open: this.hintOpen || undefined,
        opponent_played: opp,
      }
    })
  }

  /** Taking back a finished game's last move means the result no longer stands. */
  private unrecordGame() {
    const over = this.overReason()
    const p = { ...this.profile, gamesPlayed: Math.max(0, this.profile.gamesPlayed - 1) }
    if (over === 'checkmate_kid_wins') p.wins = Math.max(0, p.wins - 1)
    else if (over === 'checkmate_opponent_wins') p.losses = Math.max(0, p.losses - 1)
    else if (over) p.draws = Math.max(0, p.draws - 1)
    this.profile = p
    saveProfile(p)
    this.gameRecorded = false
    if (this.panel === 'summary') this.panel = null
    this.log('Memory', 'Game result taken back', { over })
  }

  // ---------- Session memory (compressed by condense) ----------
  private compressing = false
  private compressedUpTo = 0 // in lineSeq units

  /** Lines said since the last compression (the App compresses every dozen). */
  get uncompressedLines() {
    return this.lineSeq - this.compressedUpTo
  }

  /** Compress the conversation so far into long-term memory for the next session. */
  async compressSession(): Promise<void> {
    const lines = this.transcript.slice(Math.max(0, this.transcript.length - (this.lineSeq - this.compressedUpTo)))
    const upTo = this.lineSeq
    const epoch = this.profileEpoch
    if (this.compressing || lines.length < 4) return
    this.compressing = true
    try {
      const messages = [
        ...(this.profile.sessionMemory ? [{ role: 'system' as const, content: `Earlier sessions: ${this.profile.sessionMemory}` }] : []),
        ...lines.map((l) => ({ role: l.who === 'kid' ? ('user' as const) : ('assistant' as const), content: l.text })),
      ]
      const t0 = performance.now()
      const c = await compress(messages)
      if (!c || epoch !== this.profileEpoch) return
      this.compressedUpTo = upTo
      this.recordSavings('session memory', c.before, c.after, performance.now() - t0)
      this.profile = { ...this.profile, sessionMemory: flatten(c.messages).slice(0, 6000) }
      saveProfile(this.profile)
    } finally {
      this.compressing = false
    }
  }

  recordSavings(what: string, before: number, after: number, ms?: number) {
    const prev = this.profile.condense
    this.profile = { ...this.profile, condense: { calls: prev.calls + 1, before: prev.before + before, after: prev.after + after } }
    saveProfile(this.profile)
    const pct = before ? Math.round((1 - after / before) * 100) : 0
    this.log('Memory', `condense: ${what} ${before.toLocaleString()} → ${after.toLocaleString()} tokens (−${pct}%)`, undefined, ms)
  }

  // ---------- Scout (background agent) ----------
  scout(source: ScoutSource): Record<string, unknown> {
    if (this.scouting) {
      return { status: 'already_scouting', progress: this.scoutProgress, instruction: 'Say the Scout is still studying their games and you will tell them as soon as it is done. Keep playing.' }
    }
    this.scouting = true
    const who = source.username ?? 'your'
    this.scoutProgress = source.site === 'chesscom' ? `Looking up ${who} on chess.com` : 'Reading your games'
    this.emit()
    // The Scout works in the background; the voice gets a hand-off line now and the findings later.
    void this.scoutJob(source).then((r) => this.onScoutDone?.(r))
    return {
      status: 'started',
      username: who,
      instruction:
        'Right now, say excitedly in ONE or TWO short sentences that your teammate agent, the Scout, is fetching their chess.com games and studying every move in the background, and that you will share what it finds. Then invite them to keep playing (say whose turn it is).',
    }
  }

  /** Called when a background Scout run ends (the App passes it to the voice, or speaks it offline). */
  onScoutDone: ((result: Record<string, unknown>) => void) | null = null

  private async scoutJob(source: ScoutSource): Promise<Record<string, unknown>> {
    const t0 = performance.now()
    const epoch = this.profileEpoch
    try {
      const report = await runScout(source, this.apiKey, (b, a) => this.recordSavings('Scout mistake log', b, a), (title, detail) => {
        this.scoutProgress = title
        this.log('Scout', title, detail)
      })
      if (epoch !== this.profileEpoch) return { status: 'cancelled', reason: 'the player asked to be forgotten' }
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
      this.scoutProgress = ''
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
      name: p.name ?? 'You',
      moves_played: this.kidMoves.length,
      result: this.overReason() ?? 'in_progress',
      mistakes_this_game: blunders.length,
      practised: motifs,
      found_better_move_after_hint: fixed,
      best_move: this.overReason() === 'checkmate_kid_wins' ? (this.kidMoves.at(-1)?.san ?? null) : best && best.wpAfter - best.wpBefore > 0.03 ? best.san : null,
      record: { games: p.gamesPlayed, wins: p.wins, losses: p.losses, draws: p.draws },
      recurring_mistakes: topMistakes(p),
    }
    const result =
      summary.result === 'checkmate_kid_wins'
        ? 'won by checkmate'
        : summary.result === 'checkmate_opponent_wins'
          ? 'lost to Squarely this time'
          : summary.result === 'in_progress'
            ? p.name ? 'is in the middle of a game' : 'are in the middle of a game'
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
    this.summaryStats = {
      result: summary.result,
      moves: n,
      mistakes: blunders.length,
      fixedAfterHint: fixed,
      bestMove: summary.best_move,
      practised: motifs,
      wins: p.wins,
      games: p.gamesPlayed,
    }
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
    // Already a fresh board in the requested colour: nothing to reset (models sometimes "start" a game on hello).
    const want = color ? (color === 'black' ? 'b' : 'w') : this.kidColor
    if (!this.chess.history().length && want === this.kidColor && this.chess.fen() === new Chess().fen()) {
      return { status: 'new_game', you_play: colorName(this.kidColor), note: 'board was already fresh' }
    }
    this.puzzle = null
    this.lesson = null
    this.review = null
    this.savedGame = null
    this.paused = false
    this.gameId = newGameId()
    this.gameStarted = Date.now()
    if (color) this.kidColor = color === 'black' ? 'b' : 'w'
    this.chess = new Chess()
    this.lastMove = null
    this.pending = null
    this.kidMoves = []
    this.grades = []
    this.lastHintAtKidMove = -99
    this.hintOpen = false
    this.gameRecorded = false
    this.panel = null
    this.marks = { squares: [], arrows: [] }
    this.mood = null
    this.say(`New game! You play ${colorName(this.kidColor)}.`)
    this.log('Referee', 'New game', { you_play: colorName(this.kidColor) })
    // Playing black: the buddy opens.
    this.thinking = false
    const opening = this.kidColor === 'b' ? await this.opponentMoveInner() : undefined
    return { status: 'new_game', you_play: colorName(this.kidColor), opponent_played: opening }
  }

  // ---------- Pointing (board annotations) and mood ----------
  /** Squarely "points" at the board: only squares that a tool result just computed. */
  private markTimer: ReturnType<typeof setTimeout> | undefined

  private point(arrows: Arrow[], squares: Mark[]) {
    this.marks = { arrows, squares }
    clearTimeout(this.markTimer)
    const sticky = arrows.some((a) => a.kind === 'option')
    if (!sticky && (arrows.length || squares.length)) {
      const danger = squares.some((q) => q.kind === 'danger')
      this.markTimer = setTimeout(() => this.clearMarks(), danger ? 15000 : 8000)
    }
    this.emit()
  }

  clearMarks() {
    clearTimeout(this.markTimer)
    if (!this.marks.arrows.length && !this.marks.squares.length) return
    this.marks = { squares: [], arrows: [] }
    this.emit()
  }

  private setMood(m: BuddyMood) {
    this.mood = m
    this.emit()
  }

  // ---------- Settings & screens (all reachable by voice) ----------
  changeSettings(args: Record<string, unknown>): Record<string, unknown> {
    const changed: Record<string, unknown> = {}
    if (isBoardTheme(args.board_theme)) changed.board_theme = this.settings.boardTheme = args.board_theme
    if (isPieceStyle(args.piece_style)) changed.piece_style = this.settings.pieceStyle = args.piece_style
    if (typeof args.talk_style === 'string' && args.talk_style in TALK_STYLE) {
      changed.talk_style = this.settings.talk = args.talk_style as TalkStyle
      changed.talk_rule = TALK_STYLE[this.settings.talk].rule
    }
    if (typeof args.show_agent_trace === 'boolean') changed.show_agent_trace = this.settings.showTrace = args.show_agent_trace
    if (typeof args.language === 'string' && args.language.trim() && args.language.trim().toLowerCase() !== 'auto') {
      changed.language = this.settings.language = args.language.trim().slice(0, 30)
      changed.language_rule = `Speak only ${changed.language} from now on, until the player explicitly asks for another language.`
    }
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

  closePanel = () => {
    this.panel = null
    this.emit()
  }

  forgetMe(confirm: boolean): Record<string, unknown> {
    if (!confirm) return { status: 'need_confirmation', note: 'Ask the player to confirm first: this erases their name and history.' }
    resetProfile()
    clearGames()
    this.profileEpoch++
    this.profile = loadProfile()
    this.scoutReport = null
    this.transcript = []
    this.compressedUpTo = this.lineSeq
    this.log('Memory', 'Profile erased')
    return { status: 'erased' }
  }
}

export const game = new GameController()
