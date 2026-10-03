import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import type { Square } from 'chess.js'
import { localVoice, type LocalVoiceStatus } from './voice/localVoice'
import { game, type LessonView, type PuzzleView, type ReviewView, type TranscriptLine } from './game/controller'
import { GRADE } from './ui/grades'
import { LESSONS } from './chess/lessons'
import { PUZZLE_THEMES, THEME_INFO, type PuzzleTheme } from './chess/puzzles'
import { Board } from './ui/Board'
import { MoveStrip } from './ui/MoveStrip'
import { GameRail } from './ui/GameRail'
import { identifyOpening } from './chess/knowledge'
import { ScoutActivity } from './ui/ScoutActivity'
import { TracePanel } from './ui/TracePanel'
import { LiveVoice, LIVE_MODEL, type LiveState } from './voice/live'
import { runTool, toolDeclarations } from './agent/tools'
import { languageNote, modeSwitchNote, systemInstruction, talkNote, TALK_STYLE, type TalkStyle } from './agent/prompt'
import { Avatar, type Mood } from './ui/Avatar'
import { parseOffline, phraseOffline } from './agent/offline'
import { ScoutCard } from './ui/ScoutCard'
import { Modal } from './ui/Modal'
import { BOARD_THEMES, PIECE_STYLES, type BoardTheme, type PieceStyle } from './ui/themes'
import { Group, Segmented, SwitchRow } from './ui/controls'
import { ChatIcon, KeyboardIcon, MicIcon, PersonIcon, SendIcon } from './ui/icons'
import { BRAIN_MODEL } from './scout/scout'
import { BrowserEars, earsSupported } from './voice/browserEars'

/** The Live system instruction for the current profile and settings. */
const instruction = () => systemInstruction(game.profile, game.level, game.kidsMode, game.settings.language, game.settings.talk)

const KEY_STORE = 'squarely.geminiKey'
const WAKE = /\b(wake up|hey|hi|connect( to)?|call|talk to)\b.*\b(squarely|gemini|big brain)\b/i
const readKey = () => {
  try {
    return sessionStorage.getItem(KEY_STORE) ?? localStorage.getItem(KEY_STORE) ?? ''
  } catch {
    return ''
  }
}

// The side panel (a sheet on phones) has two views: what was said, and what the agent did.
type Tab = 'chat' | 'agent'

/** Which tool backs a spoken line, in words a judge or parent understands. */
const RECEIPT: Record<string, string> = {
  make_move: 'Referee · chess.js',
  engine_reply: 'Opponent · Stockfish',
  analyse_position: 'Tutor · Stockfish',
  suggest_move: 'Tutor · Stockfish',
  review_move: 'Tutor · Stockfish',
  chess_knowledge: 'Library · curated',
  describe_board: 'Board · chess.js',
  undo: 'Referee',
  scout_games: 'Scout · Stockfish',
  game_summary: 'Memory',
  remember: 'Memory',
  new_game: 'Referee',
  start_puzzle: 'Puzzle · Lichess',
  start_lesson: 'Lesson · chess.js',
  explain_piece: 'Rules · chess.js',
  stop_lesson: 'Referee',
  puzzle_hint: 'Puzzle solution · Lichess',
  stop_puzzle: 'Referee',
}

/** "What you can say", by topic. Every example is a real command (tapping one says it). */
const HELP = [
  { icon: '♞', title: 'Move', examples: ['horse to the middle', 'take his castle with my queen', 'castle'] },
  { icon: '↩︎', title: 'Oops', examples: ['undo', 'keep going'] },
  { icon: '👀', title: 'Look around', examples: ["what's attacking me?", 'where is my king?', 'read the board'] },
  { icon: '🎓', title: 'Learn', examples: ['teach me how the pieces move', 'how does the horse move?', 'was that good?'] },
  { icon: '🧩', title: 'Puzzles', examples: ['give me a fork puzzle', 'hint', 'another one'] },
  { icon: '💾', title: 'Your games', examples: ['pause', 'review my last game', 'continue my last game'] },
  { icon: '🎨', title: 'Looks', examples: ['make the board blue', 'animal pieces', 'big letters'] },
  { icon: '💬', title: 'Talking', examples: ['talk less', 'be chatty', 'stop listening'] },
]

const LANGUAGES = ['English', 'Svenska', 'Español', 'Français', 'Deutsch', 'Italiano', 'Português', 'Nederlands', 'Polski', 'Türkçe', 'العربية', 'हिन्दी', '中文', '日本語', '한국어']

const PHONE_QUERY = '(max-width: 899px)'
const usePhone = () => {
  const [phone, setPhone] = useState(() => matchMedia(PHONE_QUERY).matches)
  useEffect(() => {
    const m = matchMedia(PHONE_QUERY)
    const on = () => setPhone(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return phone
}

export function App() {
  const s = useSyncExternalStore(game.subscribe, game.getSnapshot)
  const phone = usePhone()
  const [apiKey, setApiKey] = useState(readKey)
  const [keyDraft, setKeyDraft] = useState('')
  const [rememberKey, setRememberKey] = useState(false)
  const [liveState, setLiveState] = useState<LiveState>('idle')
  const [liveDetail, setLiveDetail] = useState('')
  const [micOn, setMicOn] = useState(false)
  const [earsOn, setEarsOn] = useState(false)
  const [heard, setHeard] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [level, setLevelUi] = useState(0)
  const [outLevel, setOutLevel] = useState(0)
  const [localTts, setLocalTts] = useState<LocalVoiceStatus>(localVoice.status)
  useEffect(() => {
    localVoice.onStatus = setLocalTts
    localVoice.onLevel = (l) => {
      setOutLevel(l)
      setSpeaking(l > 0)
    }
  }, [])
  const [text, setText] = useState('')
  const [typing, setTyping] = useState(false)
  const [armForget, setArmForget] = useState(false)
  const closeSummary = () => {
    game.closePanel()
  }
  const [tab, setTab] = useState<Tab>(() => (game.settings.showTrace ? 'agent' : 'chat'))
  const [sheetOpen, setSheetOpen] = useState(false)
  const [youOpen, setYouOpen] = useState(false)
  const [youTab, setYouTab] = useState<'games' | 'settings' | 'scout'>('games')
  const voice = useRef<LiveVoice | null>(null)

  voice.current ??= new LiveVoice({
    onToolCall: async (fc) => {
      const r = await runTool(game, fc)
      // A spoken "speak Swedish" must survive a reconnect too, so refresh the stored instruction.
      const changed = (r as { changed?: { language?: string; talk_style?: string } }).changed
      if (fc.name === 'change_settings' && (changed?.language || changed?.talk_style))
        voice.current?.updateInstruction(instruction())
      return r
    },
    onTranscript: (who, t) => game.addTranscript(who, t),
    onTurnComplete: () => game.endBuddyTurn(),
    onState: (st, detail) => {
      setLiveState(st)
      setLiveDetail(detail ?? '')
      game.log('Voice', `Live ${st}`, detail || undefined)
    },
    onLevel: (l) => setLevelUi(l),
    onSpeaking: (on) => {
      setSpeaking(on)
      if (!on) setOutLevel(0)
    },
    onOutLevel: setOutLevel,
    onUsage: (u) => game.recordUsage(u),
  })

  const connected = liveState === 'live'
  const hasKey = apiKey.trim().length > 0
  game.apiKey = hasKey ? apiKey.trim() : null
  const modalOpen = !apiKey || youOpen || (!!s.panel && s.panel !== 'scout')

  const start = useCallback(async () => {
    const v = voice.current!
    try {
      if (!v.connected) await v.connect(apiKey, instruction(), toolDeclarations)
      await v.startMic()
      setMicOn(v.micOn)
      v.sendText(game.profile.name ? `(${game.profile.name} is back. Greet them by name.)` : '(A new player arrived. Say hi and ask their name.)')
    } catch (e) {
      setLiveState('error')
      setLiveDetail(String(e))
    }
  }, [apiKey])

  const toggleMic = async () => {
    const v = voice.current!
    if (!connected) return start()
    if (v.micOn) {
      v.stopMic()
      setMicOn(false)
    } else {
      try {
        await v.startMic()
        setMicOn(v.micOn)
      } catch (e) {
        setLiveDetail(String(e))
      }
    }
  }

  // Offline only (no key): Kokoro-82M running in this browser (system voice while it downloads).
  const speakLocal = (line: string) => {
    game.addTranscript('buddy', line)
    game.endBuddyTurn()
    localVoice.speak(line)
  }

  /** With a key, typing wakes Gemini Live (no mic needed) instead of falling back to the robot voice. */
  const ensureLive = async () => {
    const v = voice.current!
    if (v.connected) return true
    if (!hasKey) return false
    try {
      await v.connect(apiKey, instruction(), toolDeclarations)
      return true
    } catch {
      return false
    }
  }

  /** One path for typed text and quick-action chips: Live if connected, else the offline parser. */
  const say = async (t: string) => {
    if (hasKey) voice.current!.warmAudio()
    game.addTranscript('kid', t)
    if (await ensureLive()) return voice.current!.sendText(t)
    const call = parseOffline(t)
    if (!call) {
      const name = game.getSnapshot().profile.name
      if (/^(hi|hello|hey|hej|hallo|hola)\b/i.test(t)) return speakLocal(`Hi${name ? ` ${name}` : ''}! Tell me a move, like "horse to the middle".`)
      return speakLocal('I only know chess words offline. Try "horse to the middle", "castle", or "undo".')
    }
    const r = await runTool(game, call, 'offline')
    speakLocal(phraseOffline(call.name!, r))
  }

  // Without Gemini: the browser hears the player (Web Speech API) and the offline parser plays.
  // "Wake up Squarely" / "connect to Gemini" hands over to Gemini Live, or asks for a key.
  const ears = useRef<BrowserEars | null>(null)
  const wake = async () => {
    ears.current?.stop()
    if (hasKey) {
      await start()
      return
    }
    speakLocal("To wake up my big brain, I need a free Gemini key. You can add one in settings.")
    setTimeout(() => setApiKey(''), 2500)
  }
  ears.current ??= new BrowserEars({
    onPhrase: (t) => {
      setHeard('')
      if (WAKE.test(t)) return void wakeRef.current()
      void sayRef.current(t)
    },
    onHeard: setHeard,
    onState: (on, err) => {
      setEarsOn(on)
      setHeard('')
      if (err === 'not-allowed') game.log('Voice', 'Microphone blocked by the browser')
    },
    muted: () => localVoice.busy,
  })
  const sayRef = useRef(say)
  const wakeRef = useRef(wake)
  useEffect(() => {
    sayRef.current = say
    wakeRef.current = wake
  })
  const toggleEars = () => {
    const e = ears.current!
    if (e.on) return e.stop()
    localVoice.warm()
    e.start()
    if (!game.getSnapshot().transcript.length) speakLocal('Hi! I can hear you now. Say a move, like "horse to the middle". Say "wake up Squarely" for my big brain.')
  }
  // Live takes the mic: browser ears switch off when Gemini starts listening.
  useEffect(() => {
    if (micOn) ears.current?.stop()
  }, [micOn])

  const submitText = (e: FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    void say(t)
  }

  // Tap / keyboard moves go through the same Referee tool, then the voice agent is told what happened.
  const onBoardMove = async (from: Square, to: Square) => {
    if (hasKey) voice.current!.warmAudio()
    const r = await runTool(game, { name: 'make_move', args: { from, to } }, 'tap')
    if (await ensureLive()) voice.current!.sendEvent(`[The player moved on the screen. make_move result: ${JSON.stringify(r)}. React per the rules.]`)
    else speakLocal(phraseOffline('make_move', r))
  }

  /** Buttons run their tool at once (no waiting on the model), then the voice is told what happened. */
  const act = async (name: string, args: Record<string, unknown> = {}, label = name) => {
    if (hasKey) voice.current!.warmAudio()
    const r = await runTool(game, { name, args }, 'tap')
    if (await ensureLive()) voice.current!.sendEvent(`[The player tapped the "${label}" button and the app ALREADY ran ${name} for them. Do not call ${name}, new_game or stop_puzzle yourself now. Result: ${JSON.stringify(r)}. React to it in one short sentence per the rules.]`)
    else speakLocal(phraseOffline(name, r))
  }

  // Background Scout finished: hand its findings to the voice once the buddy stops talking,
  // so it never cuts itself off. Offline, read them out.
  const scoutNote = useRef<Record<string, unknown> | null>(null)
  const flushScout = useCallback(() => {
    const r = scoutNote.current
    if (!r) return
    const v = voice.current!
    if (v.connected && speaking) return
    scoutNote.current = null
    game.noteSource('scout_games')
    if (v.connected) {
      const { instruction: _i, ...facts } = r
      v.sendEvent(`[Scout finished: your teammate Scout agent is done studying the games. Result: ${JSON.stringify(facts)}. Tell the player now in ONE or TWO warm sentences (use plan.buddy_line if present), then get back to the game.]`)
    } else if (hasKey) {
      game.addTranscript('buddy', phraseOffline('scout_games', r))
      game.endBuddyTurn()
    } else speakLocal(phraseOffline('scout_games', r))
  }, [speaking, hasKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    game.onScoutDone = (r) => {
      scoutNote.current = r
      flushScout()
    }
    flushScout()
  }, [flushScout])

  // Voice can switch the mic off ("stop listening"); the UI owns the mic.
  useEffect(() => {
    if (!s.micOffSeq) return
    const t = setTimeout(() => {
      voice.current?.stopMic()
      setMicOn(false)
    }, 1500) // let the goodbye finish
    return () => clearTimeout(t)
  }, [s.micOffSeq])

  useEffect(() => {
    if (!connected) setMicOn(false)
  }, [connected])

  // Long-term memory: condense compresses the conversation every dozen lines, when the mic stops,
  // and when the page is hidden, so the next session starts with a compact memory.
  useEffect(() => {
    if (game.uncompressedLines >= 12) void game.compressSession()
  }, [s.transcript.length])
  useEffect(() => {
    if (!micOn) void game.compressSession()
  }, [micOn])
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && void game.compressSession()
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [])

  // "Show me what the Scout found": the Scout lives in the You sheet.
  useEffect(() => {
    if (s.panel !== 'scout') return
    setYouTab('scout')
    setYouOpen(true)
    game.closePanel()
  }, [s.panel])
  // "Show / hide the agent trace" by voice.
  useEffect(() => {
    setTab(s.settings.showTrace ? 'agent' : 'chat')
  }, [s.settings.showTrace])

  const setKids = (on: boolean) => {
    game.changeSettings({ kids_mode: on })
    if (connected) voice.current!.sendEvent(modeSwitchNote(on))
  }

  const saveKey = (e: FormEvent) => {
    e.preventDefault()
    const k = keyDraft.trim()
    if (!k) return
    try {
      sessionStorage.setItem(KEY_STORE, k)
      if (rememberKey) localStorage.setItem(KEY_STORE, k)
    } catch {
      /* storage blocked: key lives in memory for this visit */
    }
    setApiKey(k)
  }

  const forgetKey = () => {
    voice.current?.close()
    try {
      sessionStorage.removeItem(KEY_STORE)
      localStorage.removeItem(KEY_STORE)
    } catch {
      /* ignore */
    }
    setApiKey('')
  }

  // Turn raw failures into something a parent can fix in one step.
  const problem =
    liveState === 'error' || (liveState === 'closed' && liveDetail)
      ? /api key|permission_denied|unauthenticated|401|403/i.test(liveDetail)
        ? { text: "That Gemini key didn't work. Check it in Google AI Studio and paste it again.", action: 'key' as const }
        : /notallowed|permission|denied|notfound|microphone/i.test(liveDetail)
          ? { text: 'Squarely needs the microphone. Allow it in the address bar, or type instead.', action: 'retry' as const }
          : /quota|resource_exhausted|429/i.test(liveDetail)
            ? { text: 'This key is out of quota for now. Try again in a minute, or use another key.', action: 'key' as const }
            : { text: 'Lost the connection. Your game is safe.', action: 'retry' as const }
      : null

  const status = s.paused
    ? 'Paused'
    : s.review
      ? `Replay · move ${s.review.ply} of ${s.review.total}`
      : s.lesson
    ? s.lesson.done
      ? 'Lesson done!'
      : 'Lesson: your move'
    : s.puzzle
    ? s.puzzle.solved
      ? 'Solved!'
      : s.thinking
        ? 'Watch…'
        : 'Puzzle: your move'
    : s.over
    ? s.over === 'checkmate_kid_wins'
      ? 'You won!'
      : s.over === 'checkmate_opponent_wins'
        ? 'Squarely won this one'
        : "It's a draw"
    : s.thinking
      ? 'Thinking…'
      : s.hintOpen && s.turn !== s.kidColor
        ? 'Undo or keep it?'
        : s.turn === s.kidColor
        ? 'Your move'
        : "Squarely's move"

  const micLabel =
    liveState === 'connecting' ? 'Connecting…' : micOn ? (speaking ? 'Squarely is talking' : 'Listening') : connected ? 'Tap to talk' : hasKey ? 'Start talking' : earsOn ? (speaking ? 'Squarely is talking' : 'Listening') : earsSupported ? 'Tap to talk' : 'Type to play'

  const mood: Mood =
    liveState === 'connecting'
      ? 'thinking'
      : speaking
        ? 'talking'
        : s.mood
          ? s.mood
          : s.thinking || s.scouting
            ? 'thinking'
            : micOn
              ? 'listening'
              : 'idle'

  const lastKid = [...s.transcript].reverse().find((l) => l.who === 'kid')
  const lastBuddy = [...s.transcript].reverse().find((l) => l.who === 'buddy')

  // One row of next steps under the board, chosen by what's happening. Each also works by voice.
  type Action = { label: string; run: () => void; primary?: boolean }
  const kidHasMoved = s.moves.some((m) => m.color === s.kidColor)
  const pieceWord = s.lesson ? (['rook', 'bishop', 'queen', 'king', 'knight', 'pawn'] as const)[s.lesson.index] : null
  const actions: Action[] = s.pendingOptions?.length || s.paused
    ? []
    : s.lesson
      ? s.lesson.done
        ? [
            ...(s.lesson.index < s.lesson.count - 1 ? [{ label: 'Next lesson', primary: true, run: () => void act('start_lesson', { lesson: 'next' }, 'Next lesson') }] : [{ label: 'Try a checkmate puzzle', primary: true, run: () => void act('start_puzzle', { theme: 'mateIn1' }, 'Checkmate puzzle') }]),
            { label: 'Play a game', run: () => void act('stop_lesson', {}, 'Play a game') },
          ]
        : [
            { label: 'How does it move?', primary: true, run: () => void act('explain_piece', { piece: pieceWord }, 'How does it move?') },
            { label: 'Start over', run: () => void act('undo', {}, 'Start the lesson over') },
          ]
      : s.review
        ? [
            { label: '◀', run: () => void act('review_step', { go: 'back' }, 'Previous move') },
            { label: 'Next ▶', primary: true, run: () => void act('review_step', { go: 'next' }, 'Next move') },
            { label: 'My mistakes', run: () => void act('review_step', { go: 'next_mistake' }, 'Show my next mistake') },
            { label: 'Done', run: () => void act('stop_review', {}, 'Done reviewing') },
          ]
      : s.puzzle
      ? s.puzzle.solved
        ? [
            { label: 'Next puzzle', primary: true, run: () => void act('start_puzzle', { theme: s.puzzle!.theme }, 'Next puzzle') },
            { label: 'Back to game', run: () => void act('stop_puzzle', {}, 'Back to game') },
          ]
        : [
            { label: ['Hint', 'Which piece?', 'Show me'][s.puzzle.hintLevel] ?? 'Show me', primary: true, run: () => void act('puzzle_hint', {}, 'Hint') },
            { label: 'Skip', run: () => void act('start_puzzle', { theme: s.puzzle!.theme }, 'Skip puzzle') },
          ]
      : s.over
        ? [
            { label: 'Play again', primary: true, run: () => void act('new_game', {}, 'Play again') },
            { label: 'Summary', run: () => game.showPanel('parent_summary') },
          ]
        : s.hintOpen
          ? [
              { label: '↩ Try again', primary: true, run: () => void act('undo', {}, 'Try again') },
              { label: 'Keep going', run: () => void act('engine_reply', {}, 'Keep going') },
            ]
          : [
              { label: 'Good move?', run: () => void act('suggest_move', {}, 'Show me a good move') },
              ...(kidHasMoved ? [{ label: 'Was that good?', run: () => void act('review_move', {}, 'Was that good?') }] : []),
              { label: 'Any danger?', run: () => void act('analyse_position', {}, "What's attacking me?") },
            ]

  const mode = s.lesson ? 'learn' : s.puzzle ? 'puzzles' : 'play'
  const setMode = (m: 'learn' | 'play' | 'puzzles') => {
    if (m === mode) return
    void (m === 'puzzles' ? act('start_puzzle', {}, 'Puzzles') : m === 'learn' ? act('start_lesson', {}, 'Learn') : act('stop_lesson', {}, 'Play'))
  }

  // What Squarely just said, and what you can do next.
  const now = (
    <div className="now">
    <div className="captions" aria-hidden>
      {heard ? <p className="cap-kid heard">{heard}…</p> : lastKid && <p className="cap-kid">{lastKid.text}</p>}
      {lastBuddy ? (
        <p className="cap-buddy">
          {lastBuddy.text}
          <Receipts sources={lastBuddy.sources} />
        </p>
      ) : (
        <p className="cap-buddy muted">{s.puzzle ? s.puzzle.goal : hasKey ? 'Tap Squarely and say hi.' : earsSupported ? 'Tap Squarely and say a move, like "horse to the middle".' : 'Type a move like "knight f3".'}</p>
      )}
    </div>

    {s.pendingOptions && s.pendingOptions.length > 0 ? (
      <div className="options" role="group" aria-label="Which move did you mean?">
        {s.pendingOptions.map((o, i) => (
          <button key={o.san} onClick={() => void act('make_move', { option: i + 1 }, `option ${i + 1}`)}>
            <b>{i + 1}</b> {o.label}
          </button>
        ))}
      </div>
    ) : (
      <div className="actions" role="group" aria-label="Next steps">
        {actions.map((a) => (
          <button key={a.label} className={a.primary ? 'act primary' : 'act'} onClick={a.run} disabled={s.thinking} autoFocus={a.primary && s.hintOpen}>
            {a.label}
          </button>
        ))}
      </div>
    )}

    {problem && (
      <div className="problem" role="alert">
        <span>{problem.text}</span>
        {problem.action === 'key' ? (
          <button className="pill-btn" onClick={forgetKey}>
            Change key
          </button>
        ) : (
          <button className="pill-btn" onClick={() => void start()}>
            Reconnect
          </button>
        )}
      </div>
    )}

    </div>
  )

  // Talk button with the keyboard beside it (on phones it's pinned to the bottom).
  // Typing: a composer like Messages (always under the panel on desktop, swapped in for the dock on phones).
  const composer = (
    <form onSubmit={submitText} className="type">
      <label htmlFor="say" className="sr-only">
        Type instead of talking
      </label>
      <input id="say" autoFocus={phone} value={text} onChange={(e) => setText(e.target.value)} placeholder={connected ? 'Type to Squarely…' : 'Type a move, like "knight f3"'} enterKeyHint="send" />
      <button type="submit" className="send" aria-label="Send">
        <SendIcon />
      </button>
      {phone && (
        <button type="button" className="icon-btn" aria-label="Back to voice" onClick={() => setTyping(false)}>
          <MicIcon />
        </button>
      )}
    </form>
  )

  // Squarely's face is the talk button.
  const talk = (
    <div className="mic-wrap">
      <button
        className={`mic ${micOn || earsOn ? 'on' : ''} ${speaking ? 'speaking' : ''} ${liveState === 'connecting' ? 'connecting' : ''}`}
        onClick={hasKey ? toggleMic : earsSupported ? toggleEars : () => setTyping(true)}
        disabled={liveState === 'connecting'}
        aria-pressed={micOn || earsOn}
        aria-label={micOn || earsOn ? 'Stop listening' : 'Talk to Squarely'}
        style={{ ['--lvl' as string]: String(Math.min(1, level * 5)) }}
      >
        <Avatar mood={mood} level={outLevel} size={84} />
        {(micOn || earsOn) && (
          <span className="rec" aria-hidden>
            <MicIcon />
          </span>
        )}
      </button>
      <span className="mic-label">{micLabel}</span>
    </div>
  )

  const dock = (
    <div className="dock">
      {typing ? (
        composer
      ) : (
        <>
          <button className="icon-btn big" aria-label="Type instead" onClick={() => setTyping(true)}>
            <KeyboardIcon />
          </button>
          {talk}
          <button className="icon-btn big" aria-label="Conversation and agent steps" onClick={() => setSheetOpen(true)}>
            <ChatIcon />
          </button>
        </>
      )}
    </div>
  )

  const side = (
    <>
      <Segmented
        label="Panel"
        value={tab}
        onChange={(t) => {
          setTab(t)
          game.changeSettings({ show_agent_trace: t === 'agent' })
        }}
        options={[
          { value: 'chat', label: 'Conversation' },
          { value: 'agent', label: 'Agent steps' },
        ]}
      />
      <div className="side-body">
        {tab === 'chat' ? (
          <Transcript lines={s.transcript} />
        ) : (
          <>
            <p className="caption">Gemini decides what to do next. Every fact it says comes from chess.js, Stockfish or the puzzle's own solution.</p>
            <TracePanel trace={s.trace} />
          </>
        )}
      </div>
    </>
  )

  return (
    <div className={`app ${phone ? 'is-phone' : ''}`}>
      <header className="topbar" inert={modalOpen}>
        <div className="brand">
          <Avatar mood={s.mood === 'happy' ? 'happy' : 'idle'} size={34} className="logo-avatar" />
          {!phone && <h1>Squarely</h1>}
        </div>
        <Segmented
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'learn', label: 'Learn' },
            { value: 'play', label: 'Play' },
            { value: 'puzzles', label: 'Puzzles' },
          ]}
        />
        <button className="profile-btn" onClick={() => setYouOpen(true)} aria-label={s.profile.name ? `${s.profile.name}: settings and progress` : 'Settings and progress'}>
          {s.profile.name ? s.profile.name[0].toUpperCase() : <PersonIcon />}
        </button>
      </header>

      <main className="layout" inert={modalOpen}>
        {!phone && (
          <GameRail
            moves={s.moves}
            kidColor={s.kidColor}
            fen={s.fen}
            turn={s.turn}
            name={s.profile.name ?? 'You'}
            level={s.level}
            opening={s.review?.opening ?? identifyOpening(s.moves.map((m) => m.san))?.name ?? null}
            progress={
              s.lesson
                ? {
                    title: 'Lessons',
                    items: LESSONS.map((l) => ({ label: l.title, done: (s.profile.lessonsDone ?? []).includes(l.id), current: l.id === s.lesson!.id })),
                  }
                : s.puzzle
                  ? {
                      title: 'Puzzles',
                      items: PUZZLE_THEMES.map((t) => {
                        const st = s.profile.puzzles.byTheme[t]
                        return { label: THEME_INFO[t].label, detail: st ? `${st.solved} of ${st.tried}` : undefined, done: !!st?.solved, current: t === s.puzzle!.theme }
                      }),
                    }
                  : null
            }
          />
        )}
        <section className="stage" aria-label="Game">
          <div className="status-row">
            <div className={`status ${s.thinking ? 'busy' : ''} ${s.over ? 'over' : ''} ${s.paused ? 'paused' : ''}`} aria-hidden>
              <span className="dot" />
              {status}
            </div>
            {!s.puzzle && !s.lesson && !s.review && !s.over && s.moves.length > 0 && !s.paused && (
              <button className="pause-btn" onClick={() => void act('pause_game', {}, 'Pause')} aria-label="Pause the game">
                ⏸
              </button>
            )}
          </div>
          <ScoutActivity scouting={s.scouting} progress={s.scoutProgress} report={s.scoutReport} onOpen={() => (setYouTab('scout'), setYouOpen(true))} />
          <div className="board-wrap">
          <Board
            marks={s.marks}
            kidsMode={s.kidsMode}
            boardTheme={s.settings.boardTheme}
            pieceStyle={s.settings.pieceStyle}
            fen={s.fen}
            pov={s.kidColor}
            lastMove={s.lastMove}
            lastGrade={s.puzzle ? null : (s.moves.at(-1)?.grade ?? null)}
            checkSquare={s.checkSquare}
            disabled={s.thinking || (!!s.over && !s.puzzle) || !!s.puzzle?.solved || !!s.lesson?.done || !!s.review || s.paused}
            onMove={onBoardMove}
          />
          {s.paused && (
            <div className="paused-veil">
              <p>Paused. Your game is saved.</p>
              <button className="primary" onClick={() => void act('resume_game', {}, 'Resume')}>
                ▶ Resume
              </button>
            </div>
          )}
          </div>
          {s.review ? (
            <ReviewLine rv={s.review} />
          ) : s.lesson ? (
            <LessonLine ls={s.lesson} onPick={(id) => void act('start_lesson', { lesson: id }, `${id} lesson`)} />
          ) : s.puzzle ? (
            <PuzzleLine pz={s.puzzle} onTheme={(t) => void act('start_puzzle', { theme: t }, `${THEME_INFO[t].label} puzzle`)} />
          ) : (
            <MoveStrip moves={s.moves} kidColor={s.kidColor} />
          )}

          {phone && now}
          {phone && dock}
          <div className="live-state sr-only" aria-hidden>
            {hasKey ? `${LIVE_MODEL} · ${liveState}` : localTts.state === 'loading' ? `Downloading local voice · ${localTts.pct}%` : 'Local voice'}
          </div>
        </section>

        <aside
          className={`side ${phone ? 'sheet' : ''} ${phone && sheetOpen ? 'open' : ''}`}
          aria-label="Conversation and agent steps"
          aria-hidden={phone && !sheetOpen ? true : undefined}
          inert={phone && !sheetOpen}
          onKeyDown={(e) => phone && e.key === 'Escape' && setSheetOpen(false)}
        >
          {phone && (
            <button className="grabber" onClick={() => setSheetOpen(false)} aria-label="Close panel">
              <span />
            </button>
          )}
          {!phone && (
            <div className="coach-top">
              {talk}
              {now}
            </div>
          )}
          {side}
          {!phone && composer}
        </aside>
        {phone && sheetOpen && <div className="scrim" onClick={() => setSheetOpen(false)} aria-hidden />}
      </main>

      {youOpen && (
        <Modal title="You" variant="sheet" onClose={() => setYouOpen(false)}>
          <div className="you-head">
            <Avatar mood="happy" size={56} />
            <div className="you-id">
              <h2>{s.profile.name ?? 'You'}</h2>
              <p>
                {s.profile.gamesPlayed} {s.profile.gamesPlayed === 1 ? 'game' : 'games'} · {s.profile.wins} {s.profile.wins === 1 ? 'win' : 'wins'} · {s.profile.puzzles.solved} puzzles · {(s.profile.lessonsDone ?? []).length}/6 lessons
              </p>
            </div>
            <button className="link-btn strong" onClick={() => setYouOpen(false)}>
              Done
            </button>
          </div>
          <Segmented
            label="Section"
            value={youTab}
            onChange={setYouTab}
            options={[
              { value: 'games', label: 'Games' },
              { value: 'settings', label: 'Settings' },
              { value: 'scout', label: 'Scout' },
            ]}
          />
          {youTab === 'games' && (
            <div className="you-body">
              <Group title="Game">
                <button className="row action" onClick={() => (setYouOpen(false), void act('new_game', {}, 'New game'))}>
                  New game
                </button>
                <button className="row action" onClick={() => (setYouOpen(false), void act('new_game', { color: s.kidColor === 'w' ? 'black' : 'white' }, 'Switch colours'))}>
                  New game as {s.kidColor === 'w' ? 'black' : 'white'}
                </button>
                <div className="row">
                  <span className="row-text">Squarely's level</span>
                  <Segmented
                    label="Level"
                    value={s.level}
                    onChange={(v) => game.changeSettings({ level: v })}
                    options={[1, 2, 3, 4, 5].map((l) => ({ value: l, label: String(l), aria: `Level ${l}` }))}
                  />
                </div>
                <button className="row action" onClick={() => (setYouOpen(false), game.showPanel('parent_summary'))}>
                  Game summary
                </button>
              </Group>

              {s.savedGames.length > 0 && (
                <Group title="Saved games" footer="Every game saves itself after each move.">
                  {s.savedGames.slice(0, 12).map((g, i) => (
                    <div className="row game-row" key={g.id}>
                      <span className="row-text">
                        <span>
                          {g.id === s.gameId && !s.puzzle && !s.lesson && !s.review ? 'Playing now' : g.result === 'won' ? '🏆 Won' : g.result === 'lost' ? 'Lost' : g.result === 'draw' ? 'Draw' : 'In progress'} · {Math.ceil(g.moves / 2)} {Math.ceil(g.moves / 2) === 1 ? 'move' : 'moves'}
                        </span>
                        <small>
                          {new Date(g.updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {new Date(g.updated).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                          {g.opening ? ` · ${g.opening}` : ''}
                        </small>
                      </span>
                      {!g.result && (g.id !== s.gameId || !!s.puzzle || !!s.lesson || !!s.review) && (
                        <button className="pill-btn ghost" onClick={() => (setYouOpen(false), void act('open_game', { action: 'continue', which: String(i + 1) }, 'Continue saved game'))}>
                          Continue
                        </button>
                      )}
                      <button className="pill-btn ghost" onClick={() => (setYouOpen(false), void act('open_game', { action: 'review', which: String(i + 1) }, 'Review saved game'))}>
                        Review
                      </button>
                    </div>
                  ))}
                </Group>
              )}

            </div>
          )}
          {youTab === 'settings' && (
            <div className="you-body settings-grid">
              <Group title="Look" footer='Or just say it: "make the board blue", "animal pieces".'>
                <div className="row swatches" role="radiogroup" aria-label="Board colours">
                  {(Object.keys(BOARD_THEMES) as BoardTheme[]).map((k) => (
                    <button
                      key={k}
                      role="radio"
                      aria-checked={s.settings.boardTheme === k}
                      aria-label={BOARD_THEMES[k].label}
                      title={BOARD_THEMES[k].label}
                      className={`swatch ${s.settings.boardTheme === k ? 'on' : ''}`}
                      style={{ background: `linear-gradient(135deg, ${BOARD_THEMES[k].light} 50%, ${BOARD_THEMES[k].dark} 50%)` }}
                      onClick={() => game.changeSettings({ board_theme: k })}
                    />
                  ))}
                </div>
                <div className="row">
                  <Segmented
                    label="Pieces"
                    value={s.settings.pieceStyle}
                    onChange={(v: PieceStyle) => game.changeSettings({ piece_style: v })}
                    options={(Object.keys(PIECE_STYLES) as PieceStyle[]).map((k) => ({ value: k, label: PIECE_STYLES[k].split(' (')[0] }))}
                  />
                </div>
              </Group>

              <Group title="Voice" footer="Friendly names: “horse” and “castle”, pieces with faces and simpler words, great for young players. Squarely sticks to one language; ask out loud to switch.">
                <SwitchRow label="Friendly names" checked={s.kidsMode} onChange={setKids} />
                <div className="row">
                  <span className="row-text">Talk</span>
                  <Segmented
                    label="Talk style"
                    value={s.settings.talk}
                    onChange={(v: TalkStyle) => {
                      game.changeSettings({ talk_style: v })
                      voice.current?.updateInstruction(instruction())
                      if (connected) voice.current!.sendEvent(talkNote(v))
                    }}
                    options={(Object.keys(TALK_STYLE) as TalkStyle[]).map((k) => ({ value: k, label: TALK_STYLE[k].label }))}
                  />
                </div>
                <label className="row">
                  <span className="row-text">Language</span>
                  <select
                    className="ios-select"
                    value={s.settings.language}
                    onChange={(e) => {
                      game.changeSettings({ language: e.target.value })
                      if (connected) voice.current!.sendEvent(languageNote(e.target.value))
                      voice.current?.updateInstruction(instruction())
                    }}
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="row action" onClick={() => (setYouOpen(false), game.showPanel('help'))}>
                  What can I say?
                </button>
              </Group>

              <Group title="Memory" footer="condense.chat compresses past conversations and the Scout's game log before Gemini reads them.">
                <div className="row">
                  <span className="row-text">
                    <span>Remembers from last time</span>
                    <small>{s.profile.sessionMemory ? `${s.profile.sessionMemory.slice(0, 90)}…` : 'Nothing yet'}</small>
                  </span>
                </div>
                <div className="row">
                  <span className="row-text">
                    <span>Tokens saved by condense</span>
                    <small>
                      {s.profile.condense.calls
                        ? `${(s.profile.condense.before - s.profile.condense.after).toLocaleString()} of ${s.profile.condense.before.toLocaleString()} (−${Math.round((1 - s.profile.condense.after / s.profile.condense.before) * 100)}%)`
                        : 'Nothing compressed yet'}
                    </small>
                  </span>
                </div>
              </Group>

              <Group title="Privacy" footer="Your key goes straight from this browser to Google. Games and progress stay on this device.">
                <button className="row action" onClick={() => (setYouOpen(false), forgetKey())}>
                  {hasKey ? 'Change Gemini key' : 'Add a Gemini key'}
                </button>
                <button
                  className="row action danger"
                  onClick={() => {
                    if (!armForget) {
                      setArmForget(true)
                      setTimeout(() => setArmForget(false), 4000)
                      return
                    }
                    game.forgetMe(true)
                    location.reload()
                  }}
                >
                  {armForget ? 'Tap again to erase name, games and progress' : 'Forget me'}
                </button>
              </Group>
            </div>
          )}
          {youTab === 'scout' && <div className="you-body">{<ScoutCard report={s.scoutReport} scouting={s.scouting} progress={s.scoutProgress} saved={s.profile.scout} onScout={(username) => void say(`My chess.com username is ${username}`)} />}</div>}
          <p className="caption center">
            {hasKey ? `Voice: ${LIVE_MODEL} · ${liveState}` : localTts.state === 'ready' ? 'Voice: Kokoro-82M in your browser' : 'Voice: on this device'} · Scout plan: {BRAIN_MODEL} · Engine: Stockfish 19 · Puzzles: Lichess
          </p>
        </Modal>
      )}

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {s.announce}
      </div>

      {!apiKey && (
        <Modal title="Welcome to Squarely">
          <form onSubmit={saveKey} className="welcome">
            <div className="welcome-hero">
              <Avatar mood="happy" size={120} />
            </div>
            <h2>Meet Squarely</h2>
            <p className="lead">Your chess buddy. Talk to play, learn the pieces and solve puzzles.</p>
            <label className="field">
              <span>Gemini API key</span>
              <input type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="Paste your key" autoComplete="off" />
            </label>
            <button type="submit" className="primary big" disabled={!keyDraft.trim()}>
              Let's play
            </button>
            <a className="row-link" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              <span className="row-link-icon" aria-hidden>
                ✦
              </span>
              <span>
                <strong>Get a free key</strong>
                <small>Google AI Studio · about a minute, no credit card</small>
              </span>
              <span aria-hidden>›</span>
            </a>
            <div className="welcome-foot">
              <label className="check">
                <input type="checkbox" checked={rememberKey} onChange={(e) => setRememberKey(e.target.checked)} /> Remember on this device
              </label>
              <button
                type="button"
                className="plain"
                onClick={() => {
                  localVoice.warm()
                  setApiKey(' ')
                }}
              >
                Play without a key
              </button>
            </div>
            <p className="fineprint">
              Your key goes only from this browser to Google. <a href="https://condense.chat" target="_blank" rel="noreferrer">condense.chat</a> shrinks Squarely's notes, so
              the free tier lasts longer.
            </p>
          </form>
        </Modal>
      )}

      {s.panel === 'summary' && s.summaryLine && (
        <Modal title={s.over ? 'Game over' : 'Game summary'} onClose={closeSummary}>
          <div className={`over-card ${s.over === 'checkmate_kid_wins' ? 'won' : ''}`}>
            {s.over === 'checkmate_kid_wins' && <Confetti />}
            <div className="welcome-hero small">
              <Avatar mood={s.over === 'checkmate_opponent_wins' ? 'idle' : 'happy'} size={104} />
            </div>
            <h2>{s.over === 'checkmate_kid_wins' ? 'You won!' : s.over === 'checkmate_opponent_wins' ? 'Good game!' : s.over ? "It's a draw!" : 'This game so far'}</h2>
            <p className="lead">
              {s.over === 'checkmate_kid_wins'
                ? 'Checkmate. What a finish!'
                : s.over === 'checkmate_opponent_wins'
                  ? 'Squarely got this one. Rematch?'
                  : s.over
                    ? 'Nobody could win this one.'
                    : 'Here is how it is going.'}
            </p>
            {s.summary && (
              <div className="stat-tiles">
                <div>
                  <b>{Math.max(1, s.summary.moves)}</b>
                  <span>your moves</span>
                </div>
                <div>
                  <b>{s.summary.bestMove ?? '–'}</b>
                  <span>best move</span>
                </div>
                <div>
                  <b>
                    {s.summary.wins}/{s.summary.games}
                  </b>
                  <span>games won</span>
                </div>
              </div>
            )}
            {s.summary && (s.summary.practised.length > 0 || s.summary.fixedAfterHint > 0) && (
              <p className="summary-note">
                {s.summary.practised.length > 0 && <>Practised spotting {s.summary.practised.map((m) => m.replace(/_/g, ' ')).join(', ')}. </>}
                {s.summary.fixedAfterHint > 0 && <>Found a better move after a hint {s.summary.fixedAfterHint === 1 ? 'once' : `${s.summary.fixedAfterHint} times`}.</>}
              </p>
            )}
            <div className="stack-buttons">
              {s.over ? (
                <>
                  <button
                    className="primary big"
                    onClick={() => {
                      closeSummary()
                      void act('new_game', {}, 'Play again')
                    }}
                  >
                    Play again
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      closeSummary()
                      void act('open_game', { action: 'review', which: s.gameId }, 'Review this game')
                    }}
                  >
                    Review this game
                  </button>
                </>
              ) : (
                <button className="primary big" onClick={closeSummary}>
                  Back to the game
                </button>
              )}
            </div>
            <p className="fineprint">Every number here comes from chess.js and Stockfish, not from the AI.</p>
          </div>
          <button className="card-close" onClick={closeSummary} aria-label="Close">
            ✕
          </button>
        </Modal>
      )}

      {s.panel === 'help' && (
        <Modal title="What you can say" onClose={game.closePanel}>
          <div className="help-head">
            <h2>Just say it</h2>
            <p className="lead">Tap any example to try it.</p>
          </div>
          <div className="help-grid">
            {HELP.map((h) => (
              <section key={h.title} className="help-card">
                <h3>
                  <span aria-hidden>{h.icon}</span> {h.title}
                </h3>
                <div className="help-examples">
                  {h.examples.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => {
                        game.closePanel()
                        void say(ex)
                      }}
                    >
                      “{ex}”
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <button className="card-close" onClick={game.closePanel} aria-label="Close">
            ✕
          </button>
        </Modal>
      )}
    </div>
  )
}

// A short burst of falling chess pieces for a kid's win (skipped under reduced motion).
function Confetti() {
  const bits = '♞♛♜♝♟♚♞♛♜♝♟♚'.split('')
  return (
    <div className="confetti" aria-hidden>
      {bits.map((b, i) => (
        <span key={i} style={{ left: `${(i * 83) % 100}%`, animationDelay: `${(i % 6) * 0.12}s` }}>
          {b}
        </span>
      ))}
    </div>
  )
}

// The replay under the board: which game, and the move being looked at with its grade.
function ReviewLine({ rv }: { rv: ReviewView }) {
  const g = rv.grade ? GRADE[rv.grade] : null
  return (
    <section className="puzzle-line" aria-label="Game replay">
      <div className="pz-head">
        <span className="pz-tag">Replay</span>
        <span className="review-move">
          {rv.san ? `${rv.by === 'you' ? 'You' : 'Squarely'}: ${rv.san}` : 'Start'}
          {g && (
            <span className="review-grade" style={{ color: g.color }}>
              {' '}
              {g.icon} {g.label}
            </span>
          )}
        </span>
        <span className="pz-src">
          {new Date(rv.started).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {rv.result ?? 'unfinished'}
          {rv.opening ? ` · ${rv.opening}` : ''}
        </span>
      </div>
    </section>
  )
}

// The lesson under the board: which piece (a menu to jump), how it moves, and pawns gobbled so far.
function LessonLine({ ls, onPick }: { ls: LessonView; onPick: (id: string) => void }) {
  return (
    <section className={`puzzle-line lesson-line ${ls.done ? 'solved' : ''}`} aria-label="Lesson">
      <div className="pz-head">
        <label className="pz-menu">
          <span className="sr-only">Lesson</span>
          <select value={ls.id} onChange={(e) => onPick(e.target.value)}>
            {LESSONS.map((l, i) => (
              <option key={l.id} value={l.id}>
                {i + 1}. {l.title}
              </option>
            ))}
          </select>
        </label>
        <span className="pz-steps" aria-label={`${ls.gobbled} of ${ls.total} pawns gobbled`}>
          {Array.from({ length: ls.total }, (_, i) => (
            <i key={i} className={i < ls.gobbled ? 'on' : ''} />
          ))}
        </span>
        <span className="pz-src">
          Lesson {ls.index + 1} of {ls.count}
        </span>
      </div>
      <p className="lesson-how">{ls.done ? 'Well done! 🎉' : ls.how}</p>
    </section>
  )
}

// The puzzle under the board: which kind (a menu to switch), how far along, the goal, and its source.
function PuzzleLine({ pz, onTheme }: { pz: PuzzleView; onTheme: (t: PuzzleTheme) => void }) {
  return (
    <section className={`puzzle-line ${pz.solved ? 'solved' : ''}`} aria-label="Puzzle">
      <div className="pz-head">
        <label className="pz-menu">
          <span className="sr-only">Puzzle kind</span>
          <select value={pz.theme} onChange={(e) => onTheme(e.target.value as PuzzleTheme)}>
            {PUZZLE_THEMES.map((t) => (
              <option key={t} value={t}>
                {THEME_INFO[t].label}
              </option>
            ))}
          </select>
        </label>
        <span className="pz-steps" aria-label={`${pz.found} of ${pz.total} moves found`}>
          {Array.from({ length: pz.total }, (_, i) => (
            <i key={i} className={i < pz.found ? 'on' : ''} />
          ))}
        </span>
        <a className="pz-src" href={pz.url} target="_blank" rel="noreferrer">
          Lichess · {pz.rating}
        </a>
      </div>
    </section>
  )
}

function Receipts({ sources }: { sources: string[] }) {
  const shown = [...new Set(sources.map((x) => RECEIPT[x]).filter(Boolean))]
  if (!shown.length) return null
  return (
    <span className="receipts">
      {shown.map((r) => (
        <span key={r} className="receipt" title="This line is backed by a computed tool result">
          ✓ {r}
        </span>
      ))}
    </span>
  )
}

function Transcript({ lines }: { lines: TranscriptLine[] }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])
  return (
    <div className="transcript" ref={box} aria-label="Conversation">
      {!lines.length && <p className="caption center">Your conversation with Squarely shows up here.</p>}
      {lines.map((l, i) => (
        <div key={i} className={`msg ${l.who}`}>
          {l.who === 'buddy' && <Avatar mood="idle" size={28} className="msg-avatar" />}
          <div className={`bubble ${l.who}`}>
            {l.text}
            {l.who === 'buddy' && <Receipts sources={l.sources} />}
          </div>
        </div>
      ))}
    </div>
  )
}
