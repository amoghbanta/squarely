import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import type { Square } from 'chess.js'
import { localVoice, type LocalVoiceStatus } from './voice/localVoice'
import { game, type PuzzleView, type TranscriptLine } from './game/controller'
import { Board } from './ui/Board'
import { MoveStrip } from './ui/MoveStrip'
import { ScoutActivity } from './ui/ScoutActivity'
import { TracePanel } from './ui/TracePanel'
import { LiveVoice, LIVE_MODEL, type LiveState } from './voice/live'
import { runTool, toolDeclarations } from './agent/tools'
import { languageNote, modeSwitchNote, systemInstruction } from './agent/prompt'
import { Avatar, type Mood } from './ui/Avatar'
import { parseOffline, phraseOffline } from './agent/offline'
import { ScoutCard } from './ui/ScoutCard'
import { Modal } from './ui/Modal'
import { BOARD_THEMES, PIECE_STYLES, type BoardTheme, type PieceStyle } from './ui/themes'
import { Group, Segmented, SwitchRow } from './ui/controls'
import { GearIcon, HelpIcon, KeyboardIcon, MicIcon, MoreIcon, SendIcon } from './ui/icons'
import { BRAIN_MODEL } from './scout/scout'
import { BrowserEars, earsSupported } from './voice/browserEars'

const KEY_STORE = 'squarely.geminiKey'
const WAKE = /\b(wake up|hey|hi|connect( to)?|call|talk to)\b.*\b(squarely|gemini|big brain)\b/i
const readKey = () => {
  try {
    return sessionStorage.getItem(KEY_STORE) ?? localStorage.getItem(KEY_STORE) ?? ''
  } catch {
    return ''
  }
}

type Tab = 'coach' | 'agent' | 'scout' | 'settings'

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
  puzzle_hint: 'Puzzle solution · Lichess',
  stop_puzzle: 'Referee',
}

const LANGUAGES = ['English', 'Svenska', 'Español', 'Français', 'Deutsch', 'Italiano', 'Português', 'Nederlands', 'Polski', 'Türkçe', 'العربية', 'हिन्दी', '中文', '日本語', '한국어']

const QUICK = ['Give me a puzzle', 'Show me a good move', 'Was that good?', "What's attacking me?", 'What opening is this?', 'Undo']

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
  const [showGrownUp, setShowGrownUp] = useState(false)
  const [armForget, setArmForget] = useState(false)
  const closeSummary = () => {
    setShowGrownUp(false)
    game.closePanel()
  }
  const [tab, setTab] = useState<Tab>('coach')
  const [sheetOpen, setSheetOpen] = useState(false)
  const voice = useRef<LiveVoice | null>(null)

  voice.current ??= new LiveVoice({
    onToolCall: async (fc) => {
      const r = await runTool(game, fc)
      // A spoken "speak Swedish" must survive a reconnect too, so refresh the stored instruction.
      if (fc.name === 'change_settings' && (r as { changed?: { language?: string } }).changed?.language)
        voice.current?.updateInstruction(systemInstruction(game.profile, game.level, game.kidsMode, game.settings.language))
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
  })

  const connected = liveState === 'live'
  const hasKey = apiKey.trim().length > 0
  game.apiKey = hasKey ? apiKey.trim() : null
  const modalOpen = !apiKey || (!!s.panel && s.panel !== 'scout')

  const start = useCallback(async () => {
    const v = voice.current!
    try {
      if (!v.connected) await v.connect(apiKey, systemInstruction(game.profile, game.level, game.kidsMode, game.settings.language), toolDeclarations)
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
      await v.connect(apiKey, systemInstruction(game.profile, game.level, game.kidsMode, game.settings.language), toolDeclarations)
      return true
    } catch {
      return false
    }
  }

  /** One path for typed text and quick-action chips: Live if connected, else the offline parser. */
  const say = async (t: string) => {
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
    speakLocal("To wake up my big brain, I need a free Gemini key. Ask a grown-up to paste one in.")
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
    const r = await runTool(game, { name: 'make_move', args: { from, to } }, 'tap')
    if (await ensureLive()) voice.current!.sendEvent(`[The player moved on the screen. make_move result: ${JSON.stringify(r)}. React per the rules.]`)
    else speakLocal(phraseOffline('make_move', r))
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

  // "Show me what the Scout found": switch the panel (and open the sheet on phones).
  useEffect(() => {
    if (s.panel !== 'scout') return
    setTab('scout')
    setSheetOpen(true)
    game.closePanel()
  }, [s.panel])
  // "Show / hide the agent trace" by voice.
  useEffect(() => {
    setTab((t) => (s.settings.showTrace ? 'agent' : t === 'agent' ? 'coach' : t))
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

  const status = s.puzzle
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

  const openTab = (t: Tab) => {
    setTab(t)
    if (phone) setSheetOpen(true)
  }

  return (
    <div className={`app ${phone ? 'is-phone' : ''}`}>
      <header className="topbar" inert={modalOpen}>
        <div className="brand">
          <Avatar mood={s.mood === 'happy' ? 'happy' : 'idle'} size={38} className="logo-avatar" />
          <div>
            <h1>Squarely</h1>
            <p className="tagline">{s.kidsMode ? 'Chess by voice, with a coach that never makes things up.' : 'Voice chess coach. Every fact checked by the engine.'}</p>
          </div>
        </div>
        <div className="top-actions">
          {s.profile.name && <span className="hello">Hi, {s.profile.name}</span>}
          <button className="icon-btn" onClick={() => game.showPanel('help')} aria-label="What can I say?">
            <HelpIcon />
          </button>
          <button className="icon-btn" onClick={() => openTab('settings')} aria-label="Settings">
            <GearIcon />
          </button>
        </div>
      </header>

      <main className="layout" inert={modalOpen}>
        <section className="stage" aria-label="Game">
          <div className={`status ${s.thinking ? 'busy' : ''} ${s.over ? 'over' : ''}`} aria-hidden>
            <span className="dot" />
            {status}
          </div>
          <ScoutActivity
            scouting={s.scouting}
            progress={s.scoutProgress}
            report={s.scoutReport}
            onOpen={() => {
              setTab('scout')
              setSheetOpen(true)
            }}
          />
          <Board
            marks={s.marks}
            kidsMode={s.kidsMode}
            boardTheme={s.settings.boardTheme}
            pieceStyle={s.settings.pieceStyle}
            fen={s.fen}
            pov={s.kidColor}
            lastMove={s.lastMove}
            lastGrade={s.moves.at(-1)?.grade ?? null}
            checkSquare={s.checkSquare}
            disabled={s.thinking || !!s.over}
            onMove={onBoardMove}
          />
          {s.puzzle ? <PuzzleBar pz={s.puzzle} say={(t) => void say(t)} /> : <MoveStrip moves={s.moves} kidColor={s.kidColor} />}

          <div className="captions" aria-hidden>
            {heard ? <p className="cap-kid heard">{heard}…</p> : lastKid && <p className="cap-kid">{lastKid.text}</p>}
            {lastBuddy ? (
              <p className="cap-buddy">
                {lastBuddy.text}
                <Receipts sources={lastBuddy.sources} />
              </p>
            ) : (
              <p className="cap-buddy muted">{hasKey ? 'Tap the mic and say hi.' : earsSupported ? 'Tap the mic and say a move, like "horse to the middle".' : 'Type a move like "knight f3", or add a Gemini key to talk.'}</p>
            )}
          </div>

          {s.pendingOptions && s.pendingOptions.length > 0 && (
            <div className="options" role="group" aria-label="Which move did you mean?">
              {s.pendingOptions.map((o, i) => (
                <button key={o.san} onClick={() => void say(`option ${i + 1}`)}>
                  <b>{i + 1}</b> {o.label}
                </button>
              ))}
            </div>
          )}

          {s.hintOpen && !s.over && (
            <div className="hint-actions" role="group" aria-label="What next?">
              <button className="primary" autoFocus onClick={() => void say('undo')}>
                ↩ Try again
              </button>
              <button className="pill-btn" onClick={() => void say('keep it')}>
                Keep going ▶
              </button>
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

          <div className="dock">
            {typing ? (
              <form onSubmit={submitText} className="type">
                <label htmlFor="say" className="sr-only">
                  Type instead of talking
                </label>
                <input id="say" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={connected ? 'Type to Squarely…' : 'e.g. knight f3, undo'} enterKeyHint="send" />
                <button type="submit" className="send" aria-label="Send">
                  <SendIcon />
                </button>
                <button type="button" className="icon-btn" aria-label="Back to voice" onClick={() => setTyping(false)}>
                  <MicIcon />
                </button>
              </form>
            ) : (
              <>
                <button className="icon-btn big" aria-label="Type instead" onClick={() => setTyping(true)}>
                  <KeyboardIcon />
                </button>
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
                <button className="icon-btn big" aria-label="Coach, agent trace and Scout" onClick={() => (phone ? setSheetOpen(true) : setTab('agent'))}>
                  <MoreIcon />
                </button>
              </>
            )}
          </div>
          <div className="live-state" aria-hidden>
            {hasKey
              ? `${LIVE_MODEL} · ${liveState}`
              : localTts.state === 'loading'
                ? `Downloading local voice (Kokoro) · ${localTts.pct}%`
                : localTts.state === 'ready'
                  ? 'Local voice: Kokoro-82M, in your browser'
                  : 'Local voice: system'}
          </div>
        </section>

        <aside
          className={`side ${phone ? 'sheet' : ''} ${phone && sheetOpen ? 'open' : ''}`}
          aria-label="Coach, agent and settings"
          aria-hidden={phone && !sheetOpen ? true : undefined}
          inert={phone && !sheetOpen}
          onKeyDown={(e) => phone && e.key === 'Escape' && setSheetOpen(false)}
        >
          {phone && (
            <button className="grabber" onClick={() => setSheetOpen(false)} aria-label="Close panel">
              <span />
            </button>
          )}
          <Segmented
            label="Panel"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'coach', label: 'Coach' },
              { value: 'agent', label: 'Agent' },
              { value: 'scout', label: 'Scout' },
              { value: 'settings', label: 'Settings' },
            ]}
          />
          <div className="side-body">
            {tab === 'coach' && (
              <>
                <Transcript lines={s.transcript} />
                <div className="chips" aria-label="Quick questions">
                  {QUICK.map((q) => (
                    <button key={q} className="chip" onClick={() => void say(q)}>
                      {q}
                    </button>
                  ))}
                </div>
                <Group>
                  <button className="row action" onClick={() => void game.newGame()}>
                    New game
                  </button>
                  <button className="row action" onClick={() => void game.newGame(s.kidColor === 'w' ? 'black' : 'white')}>
                    Play as {s.kidColor === 'w' ? 'black' : 'white'}
                  </button>
                  <button className="row action" onClick={() => game.showPanel('parent_summary')}>
                    Parent summary
                  </button>
                </Group>
              </>
            )}
            {tab === 'agent' && (
              <>
                <p className="caption">Every tool call, live. The voice model decides what to do; chess.js and Stockfish compute every fact it says.</p>
                <TracePanel trace={s.trace} />
              </>
            )}
            {tab === 'scout' && (
              <ScoutCard
                report={s.scoutReport}
                scouting={s.scouting}
                progress={s.scoutProgress}
                saved={s.profile.scout}
                onScout={(username) => void say(`My chess.com username is ${username}`)}
              />
            )}
            {tab === 'settings' && (
              <>
                <Group title="Player" footer="Kids mode uses friendly piece names and characters. Off: standard chess terms and notation.">
                  <SwitchRow label="Kids mode" checked={s.kidsMode} onChange={setKids} />
                  <div className="row">
                    <span className="row-text">Squarely's level</span>
                    <Segmented
                      label="Level"
                      value={s.level}
                      onChange={(v) => game.changeSettings({ level: v })}
                      options={[1, 2, 3, 4, 5].map((l) => ({ value: l, label: String(l), aria: `Level ${l}` }))}
                    />
                  </div>
                </Group>
                <Group title="Language" footer="Squarely sticks to one language. To switch, pick it here or ask out loud: “can you speak Swedish?”">
                  <label className="row">
                    <span className="row-text">Speak</span>
                    <select
                      className="ios-select"
                      value={s.settings.language}
                      onChange={(e) => {
                        game.changeSettings({ language: e.target.value })
                        if (connected) voice.current!.sendEvent(languageNote(e.target.value))
                        voice.current?.updateInstruction(systemInstruction(game.profile, game.level, game.kidsMode, e.target.value))
                      }}
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                </Group>
                <Group title="Board" footer='Or just say it: "make the board blue", "animal pieces".'>
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
                <Group title="Memory" footer="condense.chat compresses past conversations and the Scout's game log before Gemini reads them.">
                  <div className="row">
                    <span className="row-text">
                      <span>Tokens saved by condense</span>
                      <small>
                        {s.profile.condense.calls
                          ? `${(s.profile.condense.before - s.profile.condense.after).toLocaleString()} of ${s.profile.condense.before.toLocaleString()} (−${Math.round((1 - s.profile.condense.after / s.profile.condense.before) * 100)}%) over ${s.profile.condense.calls} compressions`
                          : 'Nothing compressed yet'}
                      </small>
                    </span>
                  </div>
                  <div className="row">
                    <span className="row-text">
                      <span>Remembers from last time</span>
                      <small>{s.profile.sessionMemory ? `${s.profile.sessionMemory.slice(0, 90)}…` : 'Nothing yet'}</small>
                    </span>
                  </div>
                </Group>
                <Group title="Privacy" footer="Your key goes straight from this browser to Google. Your games and progress stay on this device.">
                  <button className="row action" onClick={forgetKey}>
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
                <p className="caption center">
                  Voice: {LIVE_MODEL} · Scout plan: {BRAIN_MODEL} · Engine: Stockfish 19
                </p>
              </>
            )}
          </div>
        </aside>
        {phone && sheetOpen && <div className="scrim" onClick={() => setSheetOpen(false)} aria-hidden />}
      </main>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {s.announce}
      </div>

      {!apiKey && (
        <Modal title="Bring your Gemini key">
          <form onSubmit={saveKey} className="stack">
            <Avatar mood="happy" size={88} className="hero-avatar" />
            <h2>Hi, I'm Squarely!</h2>
            <p>I talk with Gemini Live. To wake me up, I need a free Gemini key from Google AI Studio.</p>
            <a className="studio-cta" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              <span className="studio-badge" aria-hidden>✦</span>
              <span>
                <strong>Get a free key in Google AI Studio</strong>
                <span>About a minute with any Google account. No credit card.</span>
              </span>
              <span aria-hidden>↗</span>
            </a>
            <ol className="studio-steps">
              <li>Sign in at AI Studio</li>
              <li>Tap <b>Create API key</b></li>
              <li>Paste it below</li>
            </ol>
            <p className="condense-note">
              <b>Your free tier goes further here.</b> Before Gemini reads Squarely's memory and Scout notes,{' '}
              <a href="https://condense.chat" target="_blank" rel="noreferrer">
                condense.chat
              </a>{' '}
              shrinks them, so each call uses fewer of your tokens.
            </p>
            <p className="caption">
              Gemini's free tier is plenty to try Squarely. Your key goes only from this browser to Google; we never see it.
            </p>
            <input type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="Paste your Gemini API key" aria-label="Gemini API key" />
            <label className="check">
              <input type="checkbox" checked={rememberKey} onChange={(e) => setRememberKey(e.target.checked)} /> Remember on this device
            </label>
            <button type="submit" className="primary">
              Let's play
            </button>
            <button
              type="button"
              className="plain"
              onClick={() => {
                localVoice.warm()
                setApiKey(' ')
              }}
            >
              Play without a key (local voice)
            </button>
          </form>
        </Modal>
      )}

      {s.panel === 'summary' && s.summaryLine && (
        <Modal title={s.over ? 'Game over' : 'For grown-ups'} onClose={closeSummary}>
          {s.over && !showGrownUp ? (
            <div className={`over-card ${s.over === 'checkmate_kid_wins' ? 'won' : ''}`}>
              {s.over === 'checkmate_kid_wins' && <Confetti />}
              <Avatar mood={s.over === 'checkmate_opponent_wins' ? 'idle' : 'happy'} size={120} />
              <h2>{s.over === 'checkmate_kid_wins' ? 'You won! Checkmate!' : s.over === 'checkmate_opponent_wins' ? 'Good game!' : "It's a draw!"}</h2>
              <p>{s.over === 'checkmate_kid_wins' ? 'What a finish. Want to play again?' : 'Want a rematch?'}</p>
              <button
                className="primary"
                onClick={() => {
                  closeSummary()
                  void say('new game')
                }}
              >
                Play again
              </button>
              <button className="link-btn" onClick={() => setShowGrownUp(true)}>
                For grown-ups ›
              </button>
            </div>
          ) : (
            <>
              <h2>For grown-ups</h2>
              <p className="summary">{s.summaryLine}</p>
              <p className="caption">Every fact above was computed by chess.js and Stockfish, not guessed by the AI.</p>
              <button className="primary" onClick={closeSummary}>
                Done
              </button>
            </>
          )}
        </Modal>
      )}

      {s.panel === 'help' && (
        <Modal title="What you can say" onClose={game.closePanel}>
          <h2>Just say it</h2>
          <ul className="help">
            <li>
              <b>Move</b>"horse to the middle", "take his castle with my queen", "pawn in front of my king, two steps", "castle"
            </li>
            <li>
              <b>Oops</b>"undo", "keep it"
            </li>
            <li>
              <b>Look around</b>"what's attacking me?", "where is my king?", "read the board", "what did you just move?"
            </li>
            <li>
              <b>Change things</b>"make the board blue", "animal pieces", "big letters", "turn off kids mode", "make it harder"
            </li>
            <li>
              <b>Games</b>"new game", "let me play black", "my chess.com username is …"
            </li>
            <li>
              <b>Grown-ups</b>"show the parent summary", "show the agent trace", "forget me", "stop listening"
            </li>
          </ul>
          <button className="primary" onClick={game.closePanel}>
            Got it
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

// The puzzle on the board: goal, progress, and the hint ladder as buttons (same words work by voice).
function PuzzleBar({ pz, say }: { pz: PuzzleView; say: (t: string) => void }) {
  return (
    <section className={`puzzle-bar ${pz.solved ? 'solved' : ''}`} aria-label="Puzzle">
      <div className="pz-head">
        <span className="pz-tag">{pz.label}</span>
        <span className="pz-steps" aria-label={`${pz.found} of ${pz.total} moves found`}>
          {Array.from({ length: pz.total }, (_, i) => (
            <i key={i} className={i < pz.found ? 'on' : ''} />
          ))}
        </span>
        <a className="pz-src" href={pz.url} target="_blank" rel="noreferrer">
          Lichess · {pz.rating}
        </a>
      </div>
      <p className="pz-goal">{pz.solved ? 'Solved! 🎉' : pz.goal}</p>
      <div className="pz-actions">
        {pz.solved ? (
          <button className="primary" onClick={() => say('another puzzle')}>
            Next puzzle
          </button>
        ) : (
          <button className="primary" onClick={() => say('hint')}>
            {['Hint', 'Which piece?', 'Show me'][pz.hintLevel] ?? 'Show me'}
          </button>
        )}
        {!pz.solved && (
          <button className="pill-btn ghost" onClick={() => say('another puzzle')}>
            Skip
          </button>
        )}
        <button className="pill-btn ghost" onClick={() => say('back to my game')}>
          Back to game
        </button>
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
