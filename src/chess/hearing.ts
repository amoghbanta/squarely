// Speech-to-text fallback: fixes chess words that speech recognisers mishear
// ("night to G3" → "knight to g3", "pawn to see for" → "pawn to c4"). Pure text, no guessing about
// the board: what's legal is still decided by the Referee, which offers the nearest legal moves.

const PIECE_SOUNDALIKES: [RegExp, string][] = [
  [/\b(night|nights|nite|knights|knigh)\b/g, 'knight'],
  [/\b(rock|rocks|rooks|brook|ruk|ruke)\b/g, 'rook'],
  [/\b(porn|pond|prawn|pawns|paun|pon|pawned)\b/g, 'pawn'],
  [/\b(bishops|fish up)\b/g, 'bishop'],
  [/\b(queens|queeen)\b/g, 'queen'],
  [/\b(kings)\b/g, 'king'],
  [/\b(castles)\b/g, 'castle'],
]

// Spoken file letters. Plain "a" is left out on purpose (it's usually the article).
const LETTER: Record<string, string> = {
  ay: 'a', eh: 'a',
  b: 'b', be: 'b', bee: 'b',
  c: 'c', see: 'c', sea: 'c', si: 'c',
  d: 'd', dee: 'd',
  e: 'e', ee: 'e',
  f: 'f', ef: 'f', eff: 'f',
  g: 'g', gee: 'g', jee: 'g', ji: 'g',
  h: 'h', aitch: 'h', age: 'h',
}
const NUMBER: Record<string, string> = {
  '1': '1', one: '1', won: '1',
  '2': '2', two: '2', too: '2', to: '2',
  '3': '3', three: '3', tree: '3', free: '3',
  '4': '4', four: '4', for: '4', fore: '4',
  '5': '5', five: '5',
  '6': '6', six: '6', sex: '6', sicks: '6',
  '7': '7', seven: '7',
  '8': '8', eight: '8', ate: '8',
}
const SQUARE_RE = new RegExp(`\\b(${Object.keys(LETTER).join('|')})[\\s-]*(${Object.keys(NUMBER).join('|')})\\b`, 'g')

/** Lower-cases and repairs misheard chess words and squares. */
export function normalizeSpeech(text: string): string {
  let t = ` ${text.toLowerCase().replace(/[.,!?]/g, ' ')} `
  for (const [re, word] of PIECE_SOUNDALIKES) t = t.replace(re, word)
  // "a4" written as "a 4" (a digit after plain "a" is safe to read as a square).
  t = t.replace(/\ba[\s-]+([1-8])\b/g, 'a$1')
  t = t.replace(SQUARE_RE, (whole, l: string, n: string) => {
    // A digit is clear; a sound-alike number ("to", "for") only counts after a clear letter.
    const soundalikeNumber = !/^[1-8]$/.test(n) && !/^(one|two|three|four|five|six|seven|eight)$/.test(n)
    if (soundalikeNumber && l.length > 1 && !['bee', 'see', 'dee', 'gee', 'eff', 'aitch'].includes(l)) return whole
    // "...knight to e2" style: "to" right after a letter is far more often the word "to" than the number.
    if (n === 'to' || n === 'too') return whole
    return `${LETTER[l]}${NUMBER[n]}`
  })
  return t.replace(/\s+/g, ' ').trim()
}
