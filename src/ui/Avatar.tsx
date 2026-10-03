// Squarely, the character: a friendly rounded square whose face follows the conversation.
// mood: idle (blinks), listening (eyes wide), talking (mouth follows the real voice level),
// thinking (eyes up), worried (tutor stepped in), happy (praise or a win).
import { useId } from 'react'

export type Mood = 'idle' | 'listening' | 'talking' | 'thinking' | 'worried' | 'happy' | 'sleeping'

type Props = { mood: Mood; level?: number; size?: number; className?: string }

export function Avatar({ mood, level = 0, size = 80, className = '' }: Props) {
  const grad = `sq-body-${useId().replace(/:/g, '')}`
  // Mouth opening follows the voice level while talking.
  const open = mood === 'talking' ? 3 + Math.min(1, level * 6) * 13 : 0
  const eyeY = mood === 'thinking' ? 40 : 44
  const pupilDx = mood === 'thinking' ? 2 : 0
  const pupilDy = mood === 'thinking' ? -4 : mood === 'listening' ? 0 : 1
  const eyeR = mood === 'listening' ? 11 : 10
  return (
    <svg className={`avatar mood-${mood} ${className}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--av-top, #8e8cff)" />
          <stop offset="1" stopColor="var(--av-bottom, #5e5ce6)" />
        </linearGradient>
      </defs>
      <g className="av-body">
        <rect x="6" y="6" width="88" height="88" rx="28" fill={`url(#${grad})`} />
        {/* a tiny chequer on the forehead: it's a chess square */}
        <rect x="62" y="14" width="10" height="10" rx="2.5" fill="rgba(255,255,255,0.28)" />
        <rect x="72" y="24" width="10" height="10" rx="2.5" fill="rgba(255,255,255,0.28)" />
        <rect x="6" y="6" width="88" height="88" rx="28" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      </g>
      <g className="av-eyes">
        {mood === 'sleeping' || mood === 'happy' ? (
          <>
            <path d={mood === 'happy' ? 'M27 46 q8 -10 16 0' : 'M27 46 q8 6 16 0'} stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" />
            <path d={mood === 'happy' ? 'M57 46 q8 -10 16 0' : 'M57 46 q8 6 16 0'} stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <g className="av-eye">
              <ellipse cx="35" cy={eyeY} rx={eyeR} ry={eyeR + 1} fill="#fff" />
              <circle cx={36 + pupilDx} cy={eyeY + pupilDy} r="5" fill="#1d1b3a" />
              <circle cx={38 + pupilDx} cy={eyeY + pupilDy - 2} r="1.6" fill="#fff" />
            </g>
            <g className="av-eye">
              <ellipse cx="65" cy={eyeY} rx={eyeR} ry={eyeR + 1} fill="#fff" />
              <circle cx={66 + pupilDx} cy={eyeY + pupilDy} r="5" fill="#1d1b3a" />
              <circle cx={68 + pupilDx} cy={eyeY + pupilDy - 2} r="1.6" fill="#fff" />
            </g>
          </>
        )}
        {mood === 'worried' && (
          <>
            <path d="M24 31 l13 -5" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
            <path d="M76 31 l-13 -5" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
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
            <circle cx="22" cy="62" r="6" fill="rgba(255,120,160,0.45)" />
            <circle cx="78" cy="62" r="6" fill="rgba(255,120,160,0.45)" />
          </>
        )}
      </g>
    </svg>
  )
}
