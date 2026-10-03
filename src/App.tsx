import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import type { Square } from 'chess.js'
import { game } from './game/controller'
import { Board } from './ui/Board'
import { TracePanel } from './ui/TracePanel'
import { LiveVoice, LIVE_MODEL, type LiveState } from './voice/live'
import { runTool, toolDeclarations } from './agent/tools'
import { modeSwitchNote, systemInstruction } from './agent/prompt'
import { parseOffline, phraseOffline } from './agent/offline'
import { Modal } from './ui/Modal'
import { BOARD_THEMES, PIECE_STYLES } from './ui/themes'
import { ScoutCard } from './ui/ScoutCard'

const KEY_STORE = 'squarely.geminiKey'
const readKey = () => {
  try {
    return sessionStorage.getItem(KEY_STORE) ?? localStorage.getItem(KEY_STORE) ?? ''
  } catch {
    return ''
  }
}

export function App() {
  const s = useSyncExternalStore(game.subscribe, game.getSnapshot)
  const [apiKey, setApiKey] = useState(readKey)
  const [keyDraft, setKeyDraft] = useState('')
  const [rememberKey, setRememberKey] = useState(false)
  const [liveState, setLiveState] = useState<LiveState>('idle')
  const [liveDetail, setLiveDetail] = useState('')
  const [micOn, setMicOn] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [level, setLevelUi] = useState(0)
  const [text, setText] = useState('')
  const voice = useRef<LiveVoice | null>(null)

  voice.current ??= new LiveVoice({
    onToolCall: (fc) => runTool(game, fc),
    onTranscript: (who, t) => game.addTranscript(who, t),
    onState: (st, detail) => {
      setLiveState(st)
      setLiveDetail(detail ?? '')
      game.log('Voice', `Live ${st}`, detail || undefined)
    },
    onLevel: (l) => setLevelUi(l),
    onSpeaking: setSpeaking,
  })

  const connected = liveState === 'live'
  const modalOpen = !apiKey || !!s.panel
  const hasKey = apiKey.trim().length > 0
  game.apiKey = hasKey ? apiKey.trim() : null

  const start = useCallback(async () => {
    const v = voice.current!
    try {
      if (!v.connected) await v.connect(apiKey, systemInstruction(game.profile, game.level, game.kidsMode), toolDeclarations)
      await v.startMic()
      setMicOn(true)
      v.sendText(game.profile.name ? `(${game.profile.name} is back. Greet them by name.)` : '(A new kid arrived. Say hi and ask their name.)')
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
    try {
      speechSynthesis.cancel()
      speechSynthesis.speak(new SpeechSynthesisUtterance(line))
    } catch {
      /* no TTS available */
    }
  }

  const submitText = async (e: FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    game.addTranscript('kid', t)
    if (connected) return voice.current!.sendText(t)
    const call = parseOffline(t)
    if (!call) return speakLocal('I only know chess words offline. Try "horse to the middle" or "undo".')
    const r = await runTool(game, call)
    speakLocal(phraseOffline(call.name!, r))
  }

  // Tap / keyboard moves go through the same Referee tool, then the voice agent is told what happened.
  const onBoardMove = async (from: Square, to: Square) => {
    const r = await runTool(game, { name: 'make_move', args: { from, to } })
    if (connected) voice.current!.sendEvent(`[The kid moved on the screen. make_move result: ${JSON.stringify(r)}. React per the rules.]`)
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

  // "Show me what the Scout found": bring the Scout card into view.
  useEffect(() => {
    if (s.panel !== 'scout') return
    void document.querySelector('.scout')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    game.closePanel()
  }, [s.panel])

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

  const status = s.over
    ? s.over === 'checkmate_kid_wins'
      ? 'You won! 🎉'
      : s.over === 'checkmate_opponent_wins'
        ? 'Buddy won this time'
        : "It's a draw"
    : s.thinking
      ? 'Buddy is thinking…'
      : s.turn === s.kidColor
        ? 'Your turn!'
        : "Buddy's turn"

  return (
    <div className="app">
      <header>
        <h1>
          <span aria-hidden>♞</span> Squarely
        </h1>
        <p className="tag">{s.kidsMode ? 'The chess friend that never lies to your kid.' : 'The voice chess coach that never makes things up.'}</p>
        <div className="hdr-right">
          {s.profile.name && <span className="hello">Hi, {s.profile.name}!</span>}
          <label className="switch">
            <input type="checkbox" checked={s.kidsMode} onChange={(e) => setKids(e.target.checked)} /> Kids mode
          </label>
          <details className="settings">
            <summary>🎨 Look &amp; level</summary>
            <div className="settings-body">
              <label>
                Board
                <select value={s.settings.boardTheme} onChange={(e) => game.changeSettings({ board_theme: e.target.value })}>
                  {Object.entries(BOARD_THEMES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Pieces
                <select value={s.settings.pieceStyle} onChange={(e) => game.changeSettings({ piece_style: e.target.value })}>
                  {Object.entries(PIECE_STYLES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Buddy level
                <select value={s.level} onChange={(e) => game.changeSettings({ level: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5].map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </label>
              <p className="small">Or just say it: "make the board blue", "animal pieces".</p>
            </div>
          </details>
          <button className="ghost" onClick={() => game.changeSettings({ show_agent_trace: !s.settings.showTrace })}>
            {s.settings.showTrace ? 'Hide' : 'Show'} agent trace
          </button>
          <button className="ghost" onClick={() => game.showPanel('help')} aria-label="What can I say?">
            ?
          </button>
        </div>
      </header>

      <main className={s.settings.showTrace ? 'with-trace' : ''} inert={modalOpen}>
        <section className="play">
          <div className="status" aria-hidden>
            {status}
          </div>
          <Board kidsMode={s.kidsMode} boardTheme={s.settings.boardTheme} pieceStyle={s.settings.pieceStyle} fen={s.fen} pov={s.kidColor} lastMove={s.lastMove} checkSquare={s.checkSquare} disabled={s.thinking || !!s.over} onMove={onBoardMove} />

          <div className="controls">
            <button
              className={`mic ${micOn ? 'on' : ''} ${speaking ? 'speaking' : ''}`}
              onClick={hasKey ? toggleMic : undefined}
              disabled={!hasKey || liveState === 'connecting'}
              aria-pressed={micOn}
              aria-label={micOn ? 'Stop listening' : 'Talk to Squarely'}
              style={{ ['--lvl' as string]: String(Math.min(1, level * 4)) }}
            >
              <span aria-hidden>{micOn ? '🎙️' : '🎤'}</span>
              <span>{liveState === 'connecting' ? 'Connecting…' : micOn ? 'Listening' : connected ? 'Tap to talk' : 'Start talking'}</span>
            </button>
            <form onSubmit={submitText} className="type">
              <label htmlFor="say" className="sr-only">
                Type instead of talking
              </label>
              <input id="say" value={text} onChange={(e) => setText(e.target.value)} placeholder={connected ? 'Or type: horse to the middle' : 'Offline: type "knight f3", "undo", "what\'s attacking me?"'} />
              <button type="submit">Say</button>
            </form>
            <div className="live-state">
              {LIVE_MODEL} · {liveState}
              {liveDetail && liveState !== 'live' ? ` · ${liveDetail.slice(0, 80)}` : ''}
            </div>
          </div>

          {s.pendingOptions && (
            <ol className="options" aria-label="Which move did you mean?">
              {s.pendingOptions.map((o, i) => (
                <li key={o.san}>
                  <button onClick={() => (connected ? voice.current!.sendText(`option ${i + 1}`) : runTool(game, { name: 'make_move', args: { option: i + 1 } }).then((r) => speakLocal(phraseOffline('make_move', r))))}>
                    {i + 1}. {o.label}
                  </button>
                </li>
              ))}
            </ol>
          )}

          <div className="transcript" aria-label="Conversation">
            {s.transcript.slice(-6).map((l, i) => (
              <p key={i} className={l.who}>
                <b>{l.who === 'kid' ? 'You' : 'Squarely'}:</b> {l.text}
              </p>
            ))}
          </div>

          <ScoutCard
            report={s.scoutReport}
            scouting={s.scouting}
            saved={s.profile.scout}
            onScout={(username) =>
              connected
                ? voice.current!.sendText(`My chess.com username is ${username}`)
                : void runTool(game, { name: 'scout_games', args: { username } }).then((r) => speakLocal(phraseOffline('scout_games', r)))
            }
          />

          <div className="footer-actions">
            <button className="ghost" onClick={() => game.showPanel('parent_summary')}>
              Parent summary
            </button>
            <button className="ghost" onClick={() => void game.newGame()}>
              New game
            </button>
            <button className="ghost" onClick={() => void game.newGame(s.kidColor === 'w' ? 'black' : 'white')}>
              Play as {s.kidColor === 'w' ? 'black' : 'white'}
            </button>
            <button className="ghost" onClick={() => (game.forgetMe(true), location.reload())}>
              Forget me
            </button>
            {apiKey && (
              <button className="ghost" onClick={forgetKey}>
                {hasKey ? 'Remove my key' : 'Add a Gemini key'}
              </button>
            )}
          </div>
        </section>

        {s.settings.showTrace && <TracePanel trace={s.trace} />}
      </main>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {s.announce}
      </div>

      {!apiKey && (
        <Modal title="Bring your Gemini key">
          <form onSubmit={saveKey} className="stack">
            <h2 id="keytitle">Bring your Gemini key</h2>
            <p>
              Squarely talks with Gemini Live straight from your browser. Paste a key from{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                Google AI Studio
              </a>
              . It never touches our servers. We don't have any.
            </p>
            <input type="password" autoFocus value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="AIza…" aria-label="Gemini API key" />
            <label className="check">
              <input type="checkbox" checked={rememberKey} onChange={(e) => setRememberKey(e.target.checked)} /> Remember on this device
            </label>
            <div className="row">
              <button type="submit">Let's play</button>
              <button type="button" className="ghost" onClick={() => setApiKey(' ')}>
                Play offline (typing only)
              </button>
            </div>
          </form>
        </Modal>
      )}

      {s.panel === 'summary' && s.summaryLine && (
        <Modal title="For grown-ups" onClose={game.closePanel}>
          <h2>For grown-ups 👋</h2>
          <p className="summary">{s.summaryLine}</p>
          <p className="small">Every fact above was computed by chess.js and Stockfish, not guessed by the AI.</p>
          <button onClick={game.closePanel}>Close</button>
        </Modal>
      )}

      {s.panel === 'help' && (
        <Modal title="What you can say" onClose={game.closePanel}>
          <h2>Just say it 🎤</h2>
          <ul className="help">
            <li><b>Move:</b> "horse to the middle", "take his castle with my queen", "pawn to e4", "castle"</li>
            <li><b>Oops:</b> "undo", "keep it"</li>
            <li><b>Look around:</b> "what's attacking me?", "where is my king?", "read the board", "what did you just move?"</li>
            <li><b>Change things:</b> "make the board blue", "animal pieces", "big letters", "high contrast", "turn off kids mode", "make it harder"</li>
            <li><b>Games:</b> "new game", "let me play black", "my chess.com username is …"</li>
            <li><b>Grown-ups:</b> "show the parent summary", "hide the agent trace", "forget me", "stop listening"</li>
          </ul>
          <button onClick={game.closePanel}>Got it</button>
        </Modal>
      )}
    </div>
  )
}
