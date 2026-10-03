// Squarely, the character: a squishy little pony-ish creature (a friendly nod to the knight) with a
// punky mane, big shiny eyes and a soft snout. Its face follows the conversation:
// idle (blinks, floats), listening (eyes wide, ears up), talking (mouth follows the real voice level),
// thinking (eyes up), worried (tutor stepped in), happy (praise or a win), sleeping.
import { useId } from 'react'

const INK = '#2a2350'

export type Mood = 'idle' | 'listening' | 'talking' | 'thinking' | 'worried' | 'happy' | 'sleeping'

type Props = { mood: Mood; level?: number; size?: number; className?: string }

export function Avatar({ mood, level = 0, size = 80, className = '' }: Props) {
  const uid = useId().replace(/:/g, '')
  const body = `sq-body-${uid}`
  const mane = `sq-mane-${uid}`
  // Mouth opening follows the voice level while talking.
  const open = mood === 'talking' ? 2.5 + Math.min(1, level * 6) * 9 : 0
  const eyeY = mood === 'thinking' ? 51 : 54
  const lookX = mood === 'thinking' ? 2 : 0
  const lookY = mood === 'thinking' ? -2 : 0
  const eyeR = mood === 'listening' ? 11 : 10
  return (
    <svg className={`avatar mood-${mood} ${className}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id={body} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--av-top, #a99bff)" />
          <stop offset="1" stopColor="var(--av-bottom, #6c5ce7)" />
        </linearGradient>
        <linearGradient id={mane} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff7aa8" />
          <stop offset="1" stopColor="#ffa25c" />
        </linearGradient>
      </defs>
      <g className="av-body">
        {/* little feet */}
        <ellipse cx="33" cy="94" rx="10" ry="5" fill="#5546cf" />
        <ellipse cx="67" cy="94" rx="10" ry="5" fill="#5546cf" />
        {/* a swoopy pony quiff behind the head, with a tiny chessboard in it */}
        <g className="av-mane">
          <path d="M36 40 C33 16 46 3 61 4 C73 5 80 14 77 27 L75 40 Z" fill={`url(#${mane})`} />
          <rect x="55" y="9" width="4.5" height="4.5" rx="0.8" fill="#fff" opacity="0.9" />
          <rect x="59.5" y="13.5" width="4.5" height="4.5" rx="0.8" fill="#fff" opacity="0.9" />
          <rect x="64" y="9" width="4.5" height="4.5" rx="0.8" fill="#fff" opacity="0.55" />
        </g>
        {/* ears (pony), pink inside; they perk up when listening */}
        <g className="av-ears">
          <path d="M19 36 C16 20 20 9 27 6 C33 11 36 21 35 31 Z" fill={`url(#${body})`} />
          <path d="M23 30 C22 21 24 14 27.5 11.5 C31 15 32 22 31 28 Z" fill="#ffb8d0" />
          <path d="M81 36 C84 20 80 9 73 6 C67 11 64 21 65 31 Z" fill={`url(#${body})`} />
          <path d="M77 30 C78 21 76 14 72.5 11.5 C69 15 68 22 69 28 Z" fill="#ffb8d0" />
        </g>
        {/* squishy rounded-square body */}
        <rect x="9" y="22" width="82" height="74" rx="32" fill={`url(#${body})`} />
        <rect x="9" y="22" width="82" height="74" rx="32" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
        {/* forelock falling over the forehead */}
        <path className="av-mane" d="M44 26 C51 24 57 29 57 38 C52 34 47 33 41 35 C41 31 41 28 44 26 Z" fill={`url(#${mane})`} />
        {/* small soft snout */}
        <ellipse cx="50" cy="76" rx="15" ry="10" fill="#efe9ff" />
        {/* shine */}
        <ellipse cx="27" cy="38" rx="7" ry="4" fill="#fff" opacity="0.35" transform="rotate(-25 27 38)" />
      </g>
      <g className="av-eyes">
        {mood === 'sleeping' || mood === 'happy' ? (
          <>
            <path d={mood === 'happy' ? 'M29 56 q7 -9 14 0' : 'M29 54 q7 5 14 0'} stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />
            <path d={mood === 'happy' ? 'M57 56 q7 -9 14 0' : 'M57 54 q7 5 14 0'} stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <g className="av-eye">
              <ellipse cx={36 + lookX} cy={eyeY + lookY} rx={eyeR * 0.78} ry={eyeR} fill={INK} />
              <circle cx={38.8 + lookX} cy={eyeY + lookY - 4} r="3.3" fill="#fff" />
              <circle cx={33.8 + lookX} cy={eyeY + lookY + 3.5} r="1.5" fill="#fff" opacity="0.85" />
            </g>
            <g className="av-eye">
              <ellipse cx={64 + lookX} cy={eyeY + lookY} rx={eyeR * 0.78} ry={eyeR} fill={INK} />
              <circle cx={66.8 + lookX} cy={eyeY + lookY - 4} r="3.3" fill="#fff" />
              <circle cx={61.8 + lookX} cy={eyeY + lookY + 3.5} r="1.5" fill="#fff" opacity="0.85" />
            </g>
          </>
        )}
        {mood === 'worried' && (
          <>
            <path d="M29 40 l11 -4" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />
            <path d="M71 40 l-11 -4" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />
          </>
        )}
      </g>
      <g className="av-mouth">
        {mood === 'talking' ? (
          <rect x={50 - 7} y={78 - open / 2} width="14" height={Math.max(3.5, open)} rx={Math.min(7, Math.max(1.8, open / 2))} fill={INK} />
        ) : mood === 'worried' ? (
          <path d="M44 81 q6 -5 12 0" stroke={INK} strokeWidth="3.6" fill="none" strokeLinecap="round" />
        ) : mood === 'thinking' ? (
          <path d="M45 79 h10" stroke={INK} strokeWidth="3.6" strokeLinecap="round" />
        ) : mood === 'listening' ? (
          <ellipse cx="50" cy="78" rx="4" ry="3.6" fill={INK} />
        ) : mood === 'happy' ? (
          <path d="M42 75 q8 10 16 0 z" fill={INK} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
        ) : (
          <path d="M44 76 q6 5 12 0" stroke={INK} strokeWidth="3.6" fill="none" strokeLinecap="round" />
        )}
        {mood !== 'worried' && mood !== 'thinking' && (
          <>
            <ellipse cx="21" cy="67" rx="6.5" ry="4" fill="rgba(255,122,168,0.55)" />
            <ellipse cx="79" cy="67" rx="6.5" ry="4" fill="rgba(255,122,168,0.55)" />
          </>
        )}
      </g>
    </svg>
  )
}
