// Squarely, the character: a little device with a chessboard screen whose face follows the conversation.
// mood: idle (blinks), listening (eyes wide), talking (mouth follows the real voice level),
// thinking (eyes up), worried (tutor stepped in), happy (praise or a win).
import { useId } from 'react'

const INK = '#1d1b3a'
const CHECKER = Array.from({ length: 36 }, (_, i) => [i % 6, Math.floor(i / 6)])
  .filter(([c, r]) => (c + r) % 2)
  .map(([c, r]) => <rect key={`${c}${r}`} x={14 + c * 12} y={14 + r * 12} width="12" height="12" />)

export type Mood = 'idle' | 'listening' | 'talking' | 'thinking' | 'worried' | 'happy' | 'sleeping'

type Props = { mood: Mood; level?: number; size?: number; className?: string }

export function Avatar({ mood, level = 0, size = 80, className = '' }: Props) {
  const uid = useId().replace(/:/g, '')
  const grad = `sq-body-${uid}`
  const clip = `sq-screen-${uid}`
  // Mouth opening follows the voice level while talking.
  const open = mood === 'talking' ? 3 + Math.min(1, level * 6) * 13 : 0
  const eyeY = mood === 'thinking' ? 42 : 45
  const pupilDx = mood === 'thinking' ? 2 : 0
  const pupilDy = mood === 'thinking' ? -2 : 0
  const eyeR = mood === 'listening' ? 11 : 10
  return (
    <svg className={`avatar mood-${mood} ${className}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--av-top, #8e8cff)" />
          <stop offset="1" stopColor="var(--av-bottom, #5e5ce6)" />
        </linearGradient>
        <clipPath id={clip}>
          <rect x="14" y="14" width="72" height="72" rx="17" />
        </clipPath>
      </defs>
      <g className="av-body">
        <rect x="4" y="4" width="92" height="92" rx="28" fill={`url(#${grad})`} />
        <rect x="4" y="4" width="92" height="92" rx="28" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
        {/* the screen is a chessboard */}
        <g clipPath={`url(#${clip})`}>
          <rect x="14" y="14" width="72" height="72" fill="#fbfaff" />
          <g fill="#d8d3ff">{CHECKER}</g>
        </g>
        <rect x="14" y="14" width="72" height="72" rx="17" fill="none" stroke="rgba(63,60,184,0.35)" strokeWidth="1.5" />
      </g>
      <g className="av-eyes">
        {mood === 'sleeping' || mood === 'happy' ? (
          <>
            <path d={mood === 'happy' ? 'M30 47 q7 -9 14 0' : 'M30 46 q7 5 14 0'} stroke={INK} strokeWidth="4.5" fill="none" strokeLinecap="round" />
            <path d={mood === 'happy' ? 'M56 47 q7 -9 14 0' : 'M56 46 q7 5 14 0'} stroke={INK} strokeWidth="4.5" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <g className="av-eye">
              <ellipse cx={37 + pupilDx} cy={eyeY + pupilDy} rx={eyeR * 0.65} ry={eyeR * 0.75} fill={INK} />
              <circle cx={39.2 + pupilDx} cy={eyeY + pupilDy - 2.6} r="2.2" fill="#fff" />
            </g>
            <g className="av-eye">
              <ellipse cx={63 + pupilDx} cy={eyeY + pupilDy} rx={eyeR * 0.65} ry={eyeR * 0.75} fill={INK} />
              <circle cx={65.2 + pupilDx} cy={eyeY + pupilDy - 2.6} r="2.2" fill="#fff" />
            </g>
          </>
        )}
        {mood === 'worried' && (
          <>
            <path d="M28 32 l11 -4" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
            <path d="M72 32 l-11 -4" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
          </>
        )}
      </g>
      <g className="av-mouth">
        {mood === 'talking' ? (
          <rect x={50 - 9} y={66 - open / 2} width="18" height={Math.max(4, open)} rx={Math.min(9, Math.max(2, open / 2))} fill="#1d1b3a" />
        ) : mood === 'worried' ? (
          <path d="M40 72 q10 -8 20 0" stroke="#1d1b3a" strokeWidth="4.5" fill="none" strokeLinecap="round" />
        ) : mood === 'thinking' ? (
          <path d="M43 70 h14" stroke="#1d1b3a" strokeWidth="4.5" strokeLinecap="round" />
        ) : mood === 'listening' ? (
          <ellipse cx="50" cy="69" rx="6" ry="5" fill="#1d1b3a" />
        ) : (
          <path d={mood === 'happy' ? 'M36 64 q14 16 28 0' : 'M40 66 q10 9 20 0'} stroke="#1d1b3a" strokeWidth="4.5" fill={mood === 'happy' ? '#1d1b3a' : 'none'} strokeLinecap="round" />
        )}
        {(mood === 'happy' || mood === 'idle' || mood === 'listening') && (
          <>
            <circle cx="27" cy="60" r="5.5" fill="rgba(255,122,168,0.55)" />
            <circle cx="73" cy="60" r="5.5" fill="rgba(255,122,168,0.55)" />
          </>
        )}
      </g>
    </svg>
  )
}
