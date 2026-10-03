# Browser e2e checks

Drive the real app in headless Chromium over CDP (no extra deps).

```bash
CHROME=$(find ~/Library/Caches/ms-playwright -name chrome-headless-shell -type f | head -1)
# offline tool tests (no key needed)
CHROME=$CHROME node scripts/e2e/cdp.mjs http://localhost:5173/ 2500 \
  "localStorage.clear(); sessionStorage.setItem('squarely.geminiKey',' '); location.reload(); 1" \
  "WAIT:2500" "$(cat scripts/e2e/tools-regression.js)"
# live voice tests: put your own key in sessionStorage instead of ' '
```

Expression prefixes: `WAIT:<ms>`, `SHOT:<png path>`, `KEYS:<Enter,ArrowUp,...>`.
