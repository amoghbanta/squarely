// Tool surface the Gemini Live agent can call. Every tool result is computed by code (chess.js / Stockfish).
import { Behavior, type FunctionCall, type FunctionDeclaration } from '@google/genai'
import type { GameController } from '../game/controller'
import type { MoveIntent } from '../chess/resolver'
import { BOARD_THEMES, PIECE_STYLES } from '../ui/themes'

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
    description: 'Start a new game. The player may choose to play white or black.',
    parametersJsonSchema: { type: 'object', properties: { color: { type: 'string', enum: ['white', 'black'] } } },
  },
  {
    name: 'change_settings',
    behavior: Behavior.BLOCKING,
    description:
      'Change how the app looks or behaves: board colours, piece style, kids mode, buddy level, or showing the agent trace panel. Use for "make the board blue", "animal pieces", "turn off kids mode", "make it harder". Only pass the fields to change.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        board_theme: { type: 'string', enum: Object.keys(BOARD_THEMES), description: 'meadow=green, ocean=blue, candy=pink, wood=brown, space=dark, contrast=high contrast for low vision' },
        piece_style: { type: 'string', enum: Object.keys(PIECE_STYLES), description: 'friends=pieces with faces, classic, animals, letters=big letters (easy to see)' },
        kids_mode: { type: 'boolean' },
        level: { type: 'integer', description: '1 easiest to 5 hardest' },
        show_agent_trace: { type: 'boolean' },
      },
    },
  },
  {
    name: 'show_screen',
    behavior: Behavior.BLOCKING,
    description: 'Open or close a screen: parent_summary (report for grown-ups), scout (game-study results), help (what you can say), or game (close any popup).',
    parametersJsonSchema: { type: 'object', properties: { screen: { type: 'string', enum: ['parent_summary', 'scout', 'help', 'game'] } }, required: ['screen'] },
  },
  {
    name: 'stop_listening',
    behavior: Behavior.BLOCKING,
    description: 'Turn the microphone off when the player says goodbye, "stop listening" or "pause". Say a short goodbye first.',
    parametersJsonSchema: { type: 'object', properties: {} },
  },
  {
    name: 'forget_me',
    behavior: Behavior.BLOCKING,
    description: 'Erase the player\'s name, history and Scout results. Ask "are you sure?" first and only pass confirm=true after they say yes.',
    parametersJsonSchema: { type: 'object', properties: { confirm: { type: 'boolean' } }, required: ['confirm'] },
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
      result = await game.undo()
      break
    case 'remember':
      result = game.remember(String(args.kind ?? 'fact'), String(args.value ?? ''))
      break
    case 'game_summary':
      result = game.showPanel('parent_summary')
      break
    case 'set_level':
      result = game.setLevel(Number(args.level ?? 2))
      break
    case 'scout_games':
      result = await game.scout({ site: 'chesscom', username: String(args.username ?? '') })
      break
    case 'new_game':
      result = await game.newGame(args.color === 'black' || args.color === 'white' ? args.color : undefined)
      break
    case 'change_settings':
      result = game.changeSettings(args)
      break
    case 'show_screen':
      result = game.showPanel(String(args.screen ?? 'game'))
      break
    case 'stop_listening':
      game.requestMicOff()
      result = { status: 'mic_off' }
      break
    case 'forget_me':
      result = game.forgetMe(args.confirm === true)
      break
    default:
      result = { error: `unknown tool ${call.name}` }
  }
  game.log('Voice', `← ${call.name}`, result, performance.now() - t0)
  return result
}
