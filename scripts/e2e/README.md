# Browser e2e checks

These drive the real app in headless Chromium over the Chrome DevTools Protocol (`cdp.mjs`, no test framework). Start the dev server first (`npm run dev`).

```bash
export CHROME=$(find ~/Library/Caches/ms-playwright -name chrome-headless-shell -type f | head -1)
OFFLINE="localStorage.clear(); sessionStorage.setItem('squarely.geminiKey',' '); location.reload(); 1"

# offline suites (no key): each returns { check: 'PASS' | 'FAIL …' }
for t in tools-regression puzzles lessons saved-games hearing; do
  node scripts/e2e/cdp.mjs http://localhost:5173/ 2500 "$OFFLINE" "WAIT:3000" "$(cat scripts/e2e/$t.js)"
done
node scripts/e2e/cdp.mjs http://localhost:5173/ 2500 "$OFFLINE" "WAIT:3000" "$(cat scripts/e2e/drag.js)"

# live voice scenarios: put your own Gemini key in sessionStorage instead of ' '
LIVE="localStorage.clear(); sessionStorage.setItem('squarely.geminiKey','YOUR_KEY'); location.reload(); 1"
node scripts/e2e/cdp.mjs http://localhost:5173/ 2500 "$LIVE" "WAIT:3000" "$(cat scripts/e2e/live-tutor.js)"
```

`cdp.mjs <url> <ms> <step>…` runs each step in order. A step is a JavaScript expression (its value is printed), `WAIT:<ms>`, `SHOT:<path>` (screenshot) or `KEYS:<key,key>`. `W`, `H`, `MOBILE=1` and `DARK=1` set the viewport and colour scheme.

| Script | What it checks |
|---|---|
| `tools-regression.js` | Ambiguity and options, settings, screens, the move lock, playing black, undo, illegal moves, forget-me, review-fix regressions |
| `puzzles.js` | Puzzle start, wrong tries, the hint ladder (and that hints never leak the answer), solving, the parked game, weakness-based themes |
| `lessons.js` | Every lesson is solvable, restart, `explain_piece`, the parked game, beginner phrases |
| `saved-games.js` | Autosave, pause/resume, continue, review with grades and better moves, reopening the app |
| `hearing.js` | Sound-alike repair, the nearest-legal-move fallback, refusing garbled words, "move it", talk styles |
| `drag.js` | Drag-and-drop, illegal drops snapping back, tap-tap |
| `mate-promo-castle.js` | Mate, promotion and castling |
| `live-*.js` | Real Gemini Live runs: tutor beat, eyes-closed play, settings by voice, language lock, puzzles, misheard moves, the beginner flow |
| `live-token-session.js` | A measured session (2 games, 3 puzzles, Scout); read `window.__tokenReport` when it's done |
