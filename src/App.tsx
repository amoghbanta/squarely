import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import type { Square } from 'chess.js'
import { game, type TranscriptLine } from './game/controller'
import { Board } from './ui/Board'
import { TracePanel } from './ui/TracePanel'
import { LiveVoice, LIVE_MODEL, type LiveState } from './voice/live'
import { runTool, toolDeclarations } from './agent/tools'
import { modeSwitchNote, systemInstruction } from './agent/prompt'
import { parseOffline, phraseOffline } from './agent/offline'
import { ScoutCard } from './ui/ScoutCard'
import { Modal } from './ui/Modal'
import { BOARD_THEMES, PIECE_STYLES, type BoardTheme, type PieceStyle } from './ui/themes'
import { Group, Segmented, SwitchRow } from './ui/controls'
import { GearIcon, HelpIcon, KeyboardIcon, MicIcon, MoreIcon, SendIcon, StopIcon } from './ui/icons'
import { BRAIN_MODEL } from './scout/scout'

const KEY_STORE = 'squarely.geminiKey'
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
  describe_board: 'Board · chess.js',
  undo: 'Referee',
  scout_games: 'Scout · Stockfish',
  game_summary: 'Memory',
  remember: 'Memory',
  new_game: 'Referee',
}

const QUICK = ["What's attacking me?", 'Give me a hint', 'Undo', 'Read the board']

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
  const [speaking, setSpeaking] = useState(false)
  const [level, setLevelUi] = useState(0)
  const [text, setText] = useState('')
  const [typing, setTyping] = useState(false)
  const [tab, setTab] = useState<Tab>('coach')
  const [sheetOpen, setSheetOpen] = useState(false)
  const voice = useRef<LiveVoice | null>(null)

  voice.current ??= new LiveVoice({
    onToolCall: (fc) => runTool(game, fc),
    onTranscript: (who, t) => game.addTranscript(who, t),
    onTurnComplete: () => game.endBuddyTurn(),
    onState: (st, detail) => {
      setLiveState(st)
      setLiveDetail(detail ?? '')
      game.log('Voice', `Live ${st}`, detail || undefined)
    },
    onLevel: (l) => setLevelUi(l),
    onSpeaking: setSpeaking,
  })

  const connected = liveState === 'live'
  const hasKey = apiKey.trim().length > 0
  game.apiKey = hasKey ? apiKey.trim() : null
  const modalOpen = !apiKey || (!!s.panel && s.panel !== 'scout')

  const start = useCallback(async () => {
    const v = voice.current!
    try {
      if (!v.connected) await v.connect(apiKey, systemInstruction(game.profile, game.level, game.kidsMode), toolDeclarations)
      await v.startMic()
      setMicOn(true)
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
      await v.startMic()
      setMicOn(true)
    }
  }

  const speakLocal = (line: string) => {
    game.addTranscript('buddy', line)
    game.endBuddyTurn()
    try {
      speechSynthesis.cancel()
      speechSynthesis.speak(new SpeechSynthesisUtterance(line))
    } catch {
      /* no TTS available */
    }
  }

  /** One path for typed text and quick-action chips: Live if connected, else the offline parser. */
  const say = async (t: string) => {
    game.addTranscript('kid', t)
    if (connected) return voice.current!.sendText(t)
    const call = parseOffline(t)
    if (!call) return speakLocal('I only know chess words offline. Try "horse to the middle" or "undo".')
    const r = await runTool(game, call)
    speakLocal(phraseOffline(call.name!, r))
  }

  const submitText = (e: FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    void say(t)
  }

  // Tap / keyboard moves go through the same Referee tool, then the voice agent is told what happened.
  const onBoardMove = async (from: Square, to: Square) => {
    const r = await runTool(game, { name: 'make_move', args: { from, to } })
    if (connected) voice.current!.sendEvent(`[The player moved on the screen. make_move result: ${JSON.stringify(r)}. React per the rules.]`)
    else speakLocal(phraseOffline('make_move', r))
  }

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

  const status = s.over
    ? s.over === 'checkmate_kid_wins'
      ? 'You won!'
      : s.over === 'checkmate_opponent_wins'
        ? 'Squarely won this one'
        : "It's a draw"
    : s.thinking
      ? 'Thinking…'
      : s.turn === s.kidColor
        ? 'Your move'
        : "Squarely's move"

  const micLabel =
    liveState === 'connecting' ? 'Connecting…' : micOn ? (speaking ? 'Squarely is talking' : 'Listening') : connected ? 'Tap to talk' : hasKey ? 'Start talking' : 'Type to play'

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
          <span className="logo" aria-hidden>
            ♞
          </span>
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
          <Board
            kidsMode={s.kidsMode}
            boardTheme={s.settings.boardTheme}
            pieceStyle={s.settings.pieceStyle}
            fen={s.fen}
            pov={s.kidColor}
            lastMove={s.lastMove}
            checkSquare={s.checkSquare}
            disabled={s.thinking || !!s.over}
            onMove={onBoardMove}
          />

          <div className="captions" aria-hidden>
            {lastKid && <p className="cap-kid">{lastKid.text}</p>}
            {lastBuddy ? (
              <p className="cap-buddy">
                {lastBuddy.text}
                <Receipts sources={lastBuddy.sources} />
              </p>
            ) : (
              <p className="cap-buddy muted">{hasKey ? 'Tap the mic and say hi.' : 'Type a move like "knight f3", or add a Gemini key to talk.'}</p>
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
                    className={`mic ${micOn ? 'on' : ''} ${speaking ? 'speaking' : ''} ${liveState === 'connecting' ? 'connecting' : ''}`}
                    onClick={hasKey ? toggleMic : () => setTyping(true)}
                    disabled={liveState === 'connecting'}
                    aria-pressed={micOn}
                    aria-label={micOn ? 'Stop listening' : 'Talk to Squarely'}
                    style={{ ['--lvl' as string]: String(Math.min(1, level * 5)) }}
                  >
                    {micOn ? <StopIcon /> : <MicIcon />}
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
            {LIVE_MODEL} · {liveState}
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
                <Group title="Privacy" footer="Your key goes straight from this browser to Google. Your games and progress stay on this device.">
                  <button className="row action" onClick={forgetKey}>
                    {hasKey ? 'Change Gemini key' : 'Add a Gemini key'}
                  </button>
                  <button className="row action danger" onClick={() => (game.forgetMe(true), location.reload())}>
                    Forget me
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
            <span className="logo big" aria-hidden>
              ♞
            </span>
            <h2>Talk to play chess</h2>
            <p>
              Squarely uses Gemini Live, straight from your browser. Paste a key from{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                Google AI Studio
              </a>
              . It goes only to Google. Squarely has no server.
            </p>
            <input type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="Paste your Gemini API key" aria-label="Gemini API key" />
            <label className="check">
              <input type="checkbox" checked={rememberKey} onChange={(e) => setRememberKey(e.target.checked)} /> Remember on this device
            </label>
            <button type="submit" className="primary">
              Let's play
            </button>
            <button type="button" className="plain" onClick={() => setApiKey(' ')}>
              Play without voice
            </button>
          </form>
        </Modal>
      )}

      {s.panel === 'summary' && s.summaryLine && (
        <Modal title="For grown-ups" onClose={game.closePanel}>
          <h2>For grown-ups</h2>
          <p className="summary">{s.summaryLine}</p>
          <p className="caption">Every fact above was computed by chess.js and Stockfish, not guessed by the AI.</p>
          <button className="primary" onClick={game.closePanel}>
            Done
          </button>
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
        <div key={i} className={`bubble ${l.who}`}>
          {l.text}
          {l.who === 'buddy' && <Receipts sources={l.sources} />}
        </div>
      ))}
    </div>
  )
}
