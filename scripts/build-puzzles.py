#!/usr/bin/env python3
"""Build src/chess/puzzles.json: a small, kid-friendly slice of the Lichess puzzle database (CC0).

Streams https://database.lichess.org/lichess_db_puzzle.csv.zst and stops as soon as every theme
has enough well-rated, popular, easy puzzles. Run:
  curl -s https://database.lichess.org/lichess_db_puzzle.csv.zst | zstd -dc | python3 scripts/build-puzzles.py
"""
import csv, json, sys

# Kid-facing themes, in the order the menu shows them. Each puzzle is filed under its first match.
THEMES = ['mateIn1', 'hangingPiece', 'fork', 'mateIn2', 'pin', 'skewer', 'discoveredAttack']
PER_THEME = 40
out = {t: [] for t in THEMES}
r = csv.reader(sys.stdin)
next(r)
for row in r:
    pid, fen, moves, rating, rd, pop, plays, themes, url = row[:9]
    rating, rd, pop, plays = int(rating), int(rd), int(pop), int(plays)
    if not (500 <= rating <= 1500 and rd <= 90 and pop >= 85 and plays >= 300):
        continue
    tags = themes.split()
    if 'veryLong' in tags or 'long' in tags:
        continue
    t = next((t for t in THEMES if t in tags), None)
    if not t or len(out[t]) >= PER_THEME:
        continue
    out[t].append({'id': pid, 'fen': fen, 'moves': moves.split(), 'rating': rating, 'themes': tags, 'url': url})
    if all(len(v) >= PER_THEME for v in out.values()):
        break

for v in out.values():
    v.sort(key=lambda p: p['rating'])
json.dump(out, open('src/chess/puzzles.json', 'w'), separators=(',', ':'))
print({k: len(v) for k, v in out.items()}, file=sys.stderr)
