// Memory role: the kid's profile, kept only in this browser's localStorage.

export type Profile = {
  name: string | null
  gamesPlayed: number
  wins: number
  losses: number
  draws: number
  mistakes: Record<string, number> // e.g. { fork: 2, hanging_piece: 3 }
  notes: string[] // short facts the kid shared ("likes horses")
  lastSummary: string | null
  scout: { username: string; at: number; headline: string; focus: string; tips: string[] } | null
}

const KEY = 'squarely.profile.v1'

const empty = (): Profile => ({
  name: null,
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  mistakes: {},
  notes: [],
  lastSummary: null,
  scout: null,
})

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...empty(), ...(JSON.parse(raw) as Partial<Profile>) } : empty()
  } catch {
    return empty()
  }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* storage unavailable: memory is best-effort */
  }
}

export function resetProfile() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/** Most frequent recurring mistakes, for the tutor and the system prompt. */
export function topMistakes(p: Profile, n = 2): string[] {
  return Object.entries(p.mistakes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k)
}
