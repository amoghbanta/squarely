# Squarely: pitch, video and demo scripts

Replace `[NAME]` with the one real person this is for (the brief asks for a named real person).

---

## 1. Live demo checklist (do this 10 minutes before)

- [ ] Laptop on charger. Wired or good Bluetooth headphones **off**: judges need to hear Squarely, so use the laptop speakers and keep the mic close.
- [ ] Open https://squarely-chess.vercel.app in Chrome. Key pasted. Mic allowed.
- [ ] Settings: Kids mode **on**, level 1, Agent trace visible, board Meadow, pieces Friends.
- [ ] Settings → Forget me, then say your name fresh, so "it remembers" is real.
- [ ] Run the Scout once on `amoghbanta` so the plan is in memory (takes ~1 min). Then start a new game.
- [ ] Second tab: the same site in **Play without voice** mode, in case the wifi or mic dies.
- [ ] Phone with the backup video, ready to AirPlay or hold up.

### The reliable blunder (tested 8/8 at level 1)

1. "Pawn in front of my king, two steps." → e4. Squarely replies and says where it moved.
2. **"Bishop to a6."** The tutor always pauses here: the bishop can be taken by a pawn. The a6 square glows and an arrow shows the attacker. Squarely asks a question instead of giving the answer.
3. Say **"undo"**, then play a safe move ("move my horse to the middle" → *which horse?* → "the one near my king"). You get praise.

---

## 2. Live pitch (5 minutes, finalists)

**[0:00, hook. Board on screen, nothing touched.]**
"This is [NAME]. [NAME] is eight and loves chess, but there's nobody at home to play with. Chess apps want you to read notation and click squares. And the AI chess coaches? They make things up. Ask a chatbot about a chess position and it will confidently tell you something false. That's fine for an adult who knows better. It's terrible for a kid."

**[0:30] "So we built Squarely. You play chess by talking, and it never lies to you."**

**[0:40, demo part 1: voice play. Talk to it.]**
- "Hi Squarely, I'm [NAME]." It remembers the name.
- "Pawn in front of my king, two steps." It plays and moves, and says *where* it moved.
- "Move my horse to the middle." *"Which horse?"* It asks instead of guessing.
- Point at the screen: "Every line it speaks has a receipt. This one came from the Referee, which is chess.js. This one from Stockfish. The model is never the source of a chess fact."

**[1:40, demo part 2: the tutor.]**
- "Bishop to a6." (the planned blunder)
- Squarely stops the game with a question, something like *"Uh-oh, your bishop looks scared. Can you see who could grab it?"* The danger square glows and an arrow shows the attacker.
- "It asks a question. It doesn't hand over the answer." Say "undo", play a safe move, and it celebrates.

**[2:30, demo part 3: eyes closed.]** Close your eyes.
- "What's attacking me?" … "Where is my king?" … then one move by voice.
- "Everything works by voice. That makes this a real chess app for blind and low-vision players, not an afterthought."

**[3:10, the agent. Open the Agent tab.]**
"Under the hood, Gemini 3.8 Live is an agent with 14 tools and five roles:
- The Referee turns kid language into one legal move.
- The Tutor uses Stockfish to decide *if and when* to step in.
- The Opponent plays at your level.
- Memory remembers what you keep getting wrong.
- And the Scout: give it a chess.com name and it goes off in the background, while you keep playing. It pulls your recent games, reviews every move with its own Stockfish, counts your recurring mistakes, and Gemini 3.8 Flash writes a practice plan from only those counts. Mine says I hang pieces. It's right."

**[3:50, partners. One sentence each.]**
- Gemini 3.8 Live and 3.8 Flash: the whole agent.
- condense.chat: we built Squarely through condense's proxy, and the app uses it to compress past conversations into long-term memory, so Squarely remembers you next week without blowing the context.

**[4:10, close.]**
"Chess is the best thinking game we have for kids, but it needs a partner who is patient, at your level, and honest. Squarely is that partner, for [NAME], and for every kid who can't read a chessboard or can't see one. It's live right now at squarely-chess.vercel.app. Thank you."

**[If time is left, the parent summary]** "Show the parent summary." → *"[NAME] won by checkmate… practised: forks."*

### Likely judge questions

- **"How is this different from Gemini plus a chess prompt?"**
  - The model can't change the board or claim a fact without a tool call.
  - Blunder detection, threat finding and move legality are code: chess.js plus Stockfish in the browser.
  - The receipts prove it line by line.
- **"Latency?"**
  - Tool calls take tens of milliseconds.
  - Stockfish replies at its depth limit in well under a second.
  - The voice round trip is Gemini Live's native audio.
- **"Why is it an agent and not an app?"**
  - The model chooses the next action: play, ask, pause to teach, or dispatch the Scout.
  - The Scout is a multi-step background job that runs while the conversation continues and reports back on its own.
- **"Kid safety?"**
  - Chess-only topics.
  - It never asks for more than a first name.
  - Memory stays in the browser's localStorage, and "forget me" wipes it.
  - There is no account.
- **"Business?"**
  - Chess clubs and schools: a practice partner for every kid between lessons.
  - Parents get the summary.
  - Accessibility organisations for visually impaired players.

---

## 3. Two-minute submission video (shot list)

Record with QuickTime (File → New Screen Recording, include the mic). Show the screen plus voice; a face cam is optional.

| Time | Screen | Voiceover / what's said |
|---|---|---|
| 0:00–0:12 | Title: board with the Squarely avatar | "This is Squarely: chess you play by talking, with a coach that never makes things up. Built for [NAME], an eight-year-old with no one to play with." |
| 0:12–0:40 | Play 2 moves by voice, including the "which horse?" question | Let the live audio play. Caption: *Kid language → one legal move* |
| 0:40–1:05 | Blunder → Squarely pauses, the danger square glows → "undo" → good move → praise | Caption: *The tutor asks, it doesn't tell* |
| 1:05–1:20 | Close the laptop lid halfway or show eyes closed: "What's attacking me?" | Caption: *Fully playable without seeing the board* |
| 1:20–1:40 | Agent tab scrolling with tool calls; zoom on a receipt `✓ Tutor · Stockfish` | "Gemini 3.8 Live orchestrates 14 tools. Every chess fact it says comes from chess.js or Stockfish, and the receipts show which." |
| 1:40–1:55 | Scout card running, then the plan | "The Scout agent studies your chess.com games in the background and builds a practice plan." |
| 1:55–2:00 | URL + GitHub | "squarely-chess.vercel.app. Gemini 3.8, condense.chat, built today in Stockholm." |

Tip: record each segment separately and stitch them in iMovie. Retakes are cheap, and a single 2-minute take is fragile.

---

## 4. If something breaks live

- **The mic doesn't hear you:** check the browser permission icon, then reload. The game state survives a reload.
- **The wifi dies:** switch to the second tab (Play without voice). Type the same commands; the same tools run, and the browser speaks the replies.
- **The model rambles or mishears:** say "stop", then repeat shorter. Or click the board: keyboard and mouse play always work.
- **Everything is down:** play the backup video.
