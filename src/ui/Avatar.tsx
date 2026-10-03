// Squarely, the character: a soft, fuzzy cream plush with little bunny-bear ears, beady eyes, rosy
// cheeks and a purple scarf with a tiny chessboard on it. Its face follows the conversation:
// idle (blinks, floats), listening (ears perk, eyes a touch bigger), talking (mouth follows the real
// voice level), thinking (eyes up), worried (tutor stepped in), happy (praise or a win), sleeping.
import { useId } from 'react'

const INK = '#2b2233'

export type Mood = 'idle' | 'listening' | 'talking' | 'thinking' | 'worried' | 'happy' | 'sleeping'

type Props = { mood: Mood; level?: number; size?: number; className?: string }

export function Avatar({ mood, level = 0, size = 80, className = '' }: Props) {
  const uid = useId().replace(/:/g, '')
  const fur = `sq-fur-${uid}`
  const plush = `sq-plush-${uid}`
  const scarf = `sq-scarf-${uid}`
  // Mouth opening follows the voice level while talking.
  const open = mood === 'talking' ? 2 + Math.min(1, level * 6) * 6 : 0
  const eyeY = mood === 'thinking' ? 52 : 55
  const lookX = mood === 'thinking' ? 1.5 : 0
  const eyeR = mood === 'listening' ? 4.4 : 3.8
  return (
    <svg className={`avatar mood-${mood} ${className}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        {/* soft fur: a gentle wobble on the outline only */}
        <filter id={fur} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3" />
          <feDisplacementMap in="SourceGraphic" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <radialGradient id={plush} cx="45%" cy="38%" r="70%">
          <stop offset="0" stopColor="#fffaf2" />
          <stop offset="0.65" stopColor="#fbefdf" />
          <stop offset="1" stopColor="#efdcc4" />
        </radialGradient>
        <linearGradient id={scarf} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--av-top, #8b7bff)" />
          <stop offset="1" stopColor="var(--av-bottom, #6c5ce7)" />
        </linearGradient>
      </defs>
      <g className="av-body">
        {/* little feet */}
        <ellipse cx="36" cy="93" rx="9" ry="5" fill="#ead6bb" />
        <ellipse cx="64" cy="93" rx="9" ry="5" fill="#ead6bb" />
        <g filter={`url(#${fur})`}>
          {/* soft ears, pink inside; they perk up when listening */}
          <g className="av-ears">
            <ellipse cx="31" cy="24" rx="9.5" ry="15" fill={`url(#${plush})`} transform="rotate(-14 31 24)" />
            <ellipse cx="69" cy="24" rx="9.5" ry="15" fill={`url(#${plush})`} transform="rotate(14 69 24)" />
          </g>
          {/* round, squishy body */}
          <ellipse cx="50" cy="58" rx="39" ry="36" fill={`url(#${plush})`} />
        </g>
        <ellipse cx="31" cy="25" rx="4.5" ry="9" fill="#ffc6d6" transform="rotate(-14 31 25)" className="av-ear-in" />
        <ellipse cx="69" cy="25" rx="4.5" ry="9" fill="#ffc6d6" transform="rotate(14 69 25)" className="av-ear-in" />
        {/* a purple scarf with a tiny chessboard */}
        <path d="M17 76 C30 85 70 85 83 76 L84 82 C70 92 30 92 16 82 Z" fill={`url(#${scarf})`} />
        <g fill="#fff" opacity="0.85">
          <rect x="62" y="81" width="3.2" height="3.2" rx="0.5" />
          <rect x="65.2" y="84.2" width="3.2" height="3.2" rx="0.5" />
          <rect x="68.4" y="81" width="3.2" height="3.2" rx="0.5" />
        </g>
        {/* soft light on the head */}
        <ellipse cx="36" cy="38" rx="8" ry="4" fill="#fff" opacity="0.4" transform="rotate(-18 36 38)" />
      </g>
      <g className="av-eyes">
        {mood === 'sleeping' || mood === 'happy' ? (
          <>
            <path d={mood === 'happy' ? 'M35 56 q4 -5 8 0' : 'M35 55 q4 3 8 0'} stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />
            <path d={mood === 'happy' ? 'M57 56 q4 -5 8 0' : 'M57 55 q4 3 8 0'} stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <g className="av-eye">
              <ellipse cx={39 + lookX} cy={eyeY} rx={eyeR * 0.9} ry={eyeR * 1.1} fill={INK} />
              <circle cx={40.2 + lookX} cy={eyeY - 1.6} r="1.2" fill="#fff" />
            </g>
            <g className="av-eye">
              <ellipse cx={61 + lookX} cy={eyeY} rx={eyeR * 0.9} ry={eyeR * 1.1} fill={INK} />
              <circle cx={62.2 + lookX} cy={eyeY - 1.6} r="1.2" fill="#fff" />
            </g>
          </>
        )}
        {mood === 'worried' && (
          <>
            <path d="M34 47 l8 -2.5" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
            <path d="M66 47 l-8 -2.5" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
          </>
        )}
      </g>
      <g className="av-mouth">
        {mood === 'talking' ? (
          <ellipse cx="50" cy={66 + open / 4} rx="4" ry={Math.max(1.6, open / 2)} fill="#c2405f" stroke={INK} strokeWidth="1.6" />
        ) : mood === 'worried' ? (
          <path d="M45.5 68 q4.5 -3.5 9 0" stroke={INK} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        ) : mood === 'thinking' ? (
          <path d="M46.5 66.5 h7" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
        ) : mood === 'listening' ? (
          <ellipse cx="50" cy="66.5" rx="2.6" ry="2.2" fill={INK} />
        ) : mood === 'happy' ? (
          <path d="M44 64.5 q6 7 12 0 z" fill="#c2405f" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
        ) : (
          <path d="M45 64.5 q5 4.5 10 0" stroke={INK} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        )}
        {mood !== 'worried' && mood !== 'thinking' && (
          <>
            <ellipse cx="28.5" cy="63" rx="6" ry="3.8" fill="#ffadc3" opacity="0.75" />
            <ellipse cx="71.5" cy="63" rx="6" ry="3.8" fill="#ffadc3" opacity="0.75" />
          </>
        )}
      </g>
    </svg>
  )
}
