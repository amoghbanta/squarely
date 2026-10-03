// Tool surface the Gemini Live agent can call. Every tool result is computed by code (chess.js / Stockfish).
import { Behavior, type FunctionCall, type FunctionDeclaration } from '@google/genai'
import type { GameController } from '../game/controller'
import type { MoveIntent } from '../chess/resolver'

const PIECES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']

export const toolDeclarations: FunctionDeclaration[] = [
  {
    name: 'make_move',
    behavior: Behavior.BLOCKING,
    description:
      'Referee: play the kid\'s move. Translate kid words into fields: horse/pony=knight, castle/tower=rook, "the middle"=area middle, "take his X"=capture X, "the one near my king"=which near_king. Use san only if they literally said notation. Use option when answering a clarifying question. The result also contains the opponent reply or a tutor intervention.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        piece: { type: 'string', enum: PIECES },
        from: { type: 'string', description: 'square like e2, only if the kid said it' },
        to: { type: 'string', description: 'square like e4, only if the kid said it' },
        capture: { type: 'string', enum: PIECES, description: 'enemy piece type the kid wants to take' },
        area: { type: 'string', enum: ['middle', 'left', 'right', 'forward'] },
        which: { type: 'string', enum: ['left', 'right', 'near_king', 'front', 'back'] },
        castle: { type: 'string', enum: ['short', 'long'] },
        promotion: { type: 'string', enum: ['queen', 'rook', 'bishop', 'knight'] },
        san: { type: 'string' },
        option: { type: 'integer', description: '1-based choice from the last clarifying question' },
      },
    },
  },
  {
    name: 'engine_reply',
    behavior: Behavior.BLOCKING,
    description: 'Opponent: make the buddy\'s move now (use when the tutor paused the game and the kid wants to keep their move).',
    parametersJsonSchema: { type: 'object', properties: {} },
  },
  {
    name: 'analyse_position',
    behavior: Behavior.BLOCKING,
    description: 'Tutor: threats against the kid, pieces in danger, enemy pieces that can be won, and who is better. Call for "what\'s attacking me", "am I winning", "help", "hint".',
    parametersJsonSchema: { type: 'object', properties: {} },
  },
  {
    name: 'describe_board',
    behavior: Behavior.BLOCKING,
    description: 'Board awareness for "read the board", "where is my king", "what did he just move".',
    parametersJsonSchema: {
      type: 'object',
      properties: { focus: { type: 'string', enum: ['all', 'mine', 'theirs', 'king', 'last_move'] } },
    },
  },
  {
    name: 'undo',
    behavior: Behavior.BLOCKING,
    description: 'Take back the kid\'s last move (and the buddy\'s reply).',
    parametersJsonSchema: { type: 'object', properties: {} },
  },
  {
    name: 'remember',
    behavior: Behavior.BLOCKING,
    description: 'Memory: save the kid\'s name or a short friendly fact they share (e.g. favourite piece).',
    parametersJsonSchema: {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['name', 'fact'] }, value: { type: 'string' } },
      required: ['kind', 'value'],
    },
  },
  {
    name: 'game_summary',
    behavior: Behavior.BLOCKING,
    description: 'Parent summary of this game and the kid\'s record. Call when the game ends or a grown-up asks.',
    parametersJsonSchema: { type: 'object', properties: {} },
  },
  {
    name: 'set_level',
    behavior: Behavior.BLOCKING,
    description: 'Make the buddy easier (1) or tougher (5) when the kid asks.',
    parametersJsonSchema: { type: 'object', properties: { level: { type: 'integer' } }, required: ['level'] },
  },
  {
    name: 'scout_games',
    behavior: Behavior.NON_BLOCKING,
    description:
      'Scout: in the background, fetch the child\'s recent chess.com games, review every move with the engine, find their recurring mistakes and write a practice plan. Takes about a minute; keep playing and chatting while it works. Call when the child or a grown-up gives a chess.com username.',
    parametersJsonSchema: {
      type: 'object',
      properties: { username: { type: 'string', description: 'chess.com username, spelled as given' } },
      required: ['username'],
    },
  },
  {
    name: 'new_game',
    behavior: Behavior.BLOCKING,
    description: 'Start a new game.',
    parametersJsonSchema: { type: 'object', properties: {} },
  },
]

export async function runTool(game: GameController, call: Pick<FunctionCall, 'name' | 'args'>) {
  const args = (call.args ?? {}) as Record<string, unknown>
  game.log('Voice', `→ ${call.name}`, Object.keys(args).length ? args : undefined)
  const t0 = performance.now()
  let result: Record<string, unknown>
  switch (call.name) {
    case 'make_move':
      result = await game.makeMove(args as MoveIntent)
      break
    case 'engine_reply':
      result = await game.opponentMove()
      break
    case 'analyse_position':
      result = await game.analysePosition()
      break
    case 'describe_board':
      result = game.describeBoard(String(args.focus ?? 'all'))
      break
    case 'undo':
      result = game.undo()
      break
    case 'remember':
      result = game.remember(String(args.kind ?? 'fact'), String(args.value ?? ''))
      break
    case 'game_summary':
      result = game.gameSummary()
      break
    case 'set_level':
      result = game.setLevel(Number(args.level ?? 2))
      break
    case 'scout_games':
      result = await game.scout({ site: 'chesscom', username: String(args.username ?? '') })
      break
    case 'new_game':
      result = game.newGame()
      break
    default:
      result = { error: `unknown tool ${call.name}` }
  }
  game.log('Voice', `← ${call.name}`, result, performance.now() - t0)
  return result
}
