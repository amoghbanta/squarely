// Scout card: start a background review of the kid's chess.com games and show what it found.
import { useState, type FormEvent } from 'react'
import type { ScoutReport } from '../scout/scout'
import type { Profile } from '../memory/store'

const MOTIF_LABEL: Record<string, string> = {
  fork: 'Forks (one piece attacks two)',
  hanging_piece: 'Pieces left unprotected',
  piece_in_danger: 'Pieces walking into danger',
  mate_threat: 'Missed checkmate threats',
  loses_material: 'Other big slips',
}

type Props = { report: ScoutReport | null; scouting: boolean; saved: Profile['scout']; onScout: (username: string) => void }

export function ScoutCard({ report, scouting, saved, onScout }: Props) {
  const [name, setName] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) onScout(name.trim())
  }
  const plan = report?.plan ?? (saved ? { headline: saved.headline, focus: saved.focus, tips: saved.tips } : null)
  return (
    <section className="scout" aria-label="Scout: study my past games">
      <h2>🔭 Scout my games</h2>
      {!report && (
        <form onSubmit={submit} className="type">
          <label htmlFor="cc" className="sr-only">
            chess.com username
          </label>
          <input id="cc" value={name} onChange={(e) => setName(e.target.value)} placeholder="chess.com username (or just say it)" />
          <button type="submit" disabled={scouting}>
            {scouting ? 'Studying…' : 'Scout'}
          </button>
        </form>
      )}
      {scouting && <p className="small">The Scout is reviewing every move in the background. Keep playing!</p>}
      {report && (
        <div className="scout-stats">
          <p>
            <b>{report.games}</b> games · <b>{report.movesReviewed}</b> moves reviewed · won {report.record.wins}, lost {report.record.losses}
          </p>
          <ul>
            {Object.entries(report.motifs)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <li key={k}>
                  {MOTIF_LABEL[k] ?? k}: <b>{v}</b>
                </li>
              ))}
          </ul>
        </div>
      )}
      {plan && (
        <div className="plan">
          <p className="plan-head">{plan.headline}</p>
          <ol>
            {plan.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}
