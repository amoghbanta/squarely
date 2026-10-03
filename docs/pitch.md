# Squarely: 2-minute demo video, recording plan, finalist pitch

What the jury scores: **creativity and technical complexity**, plus a **bonus for partner tech** (Google DeepMind Gemini, condense.chat). In 2 minutes the video has to show three things: a real problem, an agent (not a chatbot) doing several things on its own, and the partners doing real work.

**The story:** chess apps assume you can see the board and already have someone to learn from. Squarely is played entirely by talking. Built for my nephew, and for everyone like him.

**The rule:** the story gets about 20 seconds; the rest is the product working. Show it rather than say it, and let Squarely do the talking.

---

## The final script (2:00)

The **bold** lines are what you say *to Squarely*. "VO" is your voiceover, recorded afterwards and laid over the clip. Record each beat as its own clip.

### 0:00–0:18 · Hook

*On screen:* the welcome screen with the mascot, then slowly push in.

> **VO:** "Chess apps assume you can see the board. If you can't, or you're just starting and have no one to teach you, you're locked out. Squarely is a chess buddy you play entirely by talking. I built it for my nephew, and for everyone like him who wants to get better at chess but has no one to play with."

### 0:18–0:28 · Hello (the agent introduces itself)

*On screen:* type your name, paste the key, tap **Let's play**. Squarely gives the spoken tour while the spotlight moves: board → Learn/Play/Puzzles → Agent steps.

*Audio:* Squarely only. Cut the clip right after "Ready when you are, Amogh!"

### 0:28–0:38 · Learn (no one to teach you)

> **You:** "Teach me how the horse moves."

*On screen:* the knight lesson opens, its squares light up, and Squarely explains the L-shape in plain words.

> **You:** "Horse to c3."

*On screen:* it moves and a pawn gets gobbled. Caption: **Learn from zero**.

### 0:38–0:58 · Eyes closed (can't see the board) ⭐ the centrepiece

*On screen:* a new game. **Close your eyes on camera**, or cover the board with your hand. Caption: **Eyes closed**.

> **You:** "Pawn to e4."

*Squarely confirms it and plays its reply out loud.*

> **You:** "Read me the board."

*Squarely reads the position. Trim to its first sentence.*

> **You:** "What's attacking me?"

*Squarely names the threat on the exact squares, or says you're safe.*

> **VO (short):** "No mouse, no screen. It even tells me what's attacking me."

### 0:58–1:16 · Tutor (the truth law)

*On screen:* eyes open, same game.

> **You:** "Bishop to a6."

*That's a blunder: the b7 pawn takes it. Squarely pauses, looks worried, highlights the bishop and **asks a question** instead of giving the answer.*

> **You** (interrupt it mid-sentence, which shows barge-in): **"Undo."**
>
> **You:** "What's a good move?"

*A green arrow appears. Zoom in on the green receipt under Squarely's line ("Tutor · Stockfish").* Caption: **Asks, never tells. Every fact from code.**

> **VO:** "It asks before it tells. And every fact comes from the chess engine, not the AI. There's a receipt under every line."

### 1:16–1:30 · Puzzles

> **You:** "Give me a fork puzzle."
>
> **You:** "Hint."
>
> **You:** "Which piece?"

*The knight glows. Solve it by dragging the piece, or say the move.* Caption: **Real Lichess puzzles**.

### 1:30–1:42 · Second agent

> **You:** "My nephew's chess.com username is ____."

*The Scout card starts working. Tap **Agent steps** for 3 seconds while it fetches games and runs Stockfish, and keep playing a move if there's time.* Caption: **Agent 2 · in the background**.

> **VO:** "That started a second agent. It studies his real chess.com games in the background and plans what he should practise."

### 1:42–1:54 · Under the hood

*On screen:* `docs/images/tech.png` full screen, slowly pushing from Squarely → the Scout → the tools.

> **VO:** "Two agents. Squarely runs on Gemini 3.8 Live and calls 28 tools. Code works out every fact, and Gemini just says it. The Scout runs on Gemini Flash through condense.chat, which halves its tokens."

### 1:54–2:00 · Close

*On screen:* the happy mascot, then "Squarely".

> **VO:** "Now my nephew has someone to play with. And so does anyone who can't see the board."

---

### The voice commands, in order (keep this next to you)

| # | Say | What it shows |
|---|---|---|
| 1 | *(type your name, paste the key, Let's play)* | Gemini connects at once and gives the spoken tour |
| 2 | "Teach me how the horse moves." | Learn mode: the lesson opens with legal squares lit up |
| 3 | "Horse to c3." | A voice move in a lesson |
| 4 | "Let's play a game." *(cut this out)* | Back to a new game |
| 5 | "Pawn to e4." | Eyes-closed play; Squarely replies with its move |
| 6 | "Read me the board." | Board description computed by chess.js |
| 7 | "What's attacking me?" | Threats from Stockfish |
| 8 | "Bishop to a6." | Blunder → pause → a question, not the answer |
| 9 | "Undo." *(interrupt it)* | Barge-in plus undo |
| 10 | "What's a good move?" | Green arrow, Stockfish receipt |
| 11 | "Give me a fork puzzle." | A Lichess puzzle |
| 12 | "Hint." → "Which piece?" | The hint ladder, from the puzzle's real solution |
| 13 | "My nephew's chess.com username is ____." | The second agent starts in the background |

**Backups if something misfires:**
- A move gets misheard: say it again with "horse" or "castle". It never plays a garbled move; it offers numbered choices instead.
- No threat shows up at step 7: just keep it, since "you're safe" also works on camera.
- The Scout is slow: show the card and Agent steps, and cut. You don't need the finished report.

**If you're running long, cut in this order:**
1. "Horse to c3".
2. "Read me the board" (keep e4 and "what's attacking me?").
3. The puzzle's "which piece?".
4. The Scout VO, keeping the visuals.

Never cut the hook, the eyes-closed beat, the tutor question with its receipt, or the second agent.

---

## How to record

**Tool:** **Cap** (cap.so, open source; `brew install --cask cap`).
- It records the screen, your mic and the Mac's own sound as separate tracks, so Squarely's voice comes through clean.
- Its built-in editor handles trimming, auto-zoom and 1080p export.
- Alternative: **OBS Studio** (with a pause hotkey) plus **Shotcut** for editing. Both are open source.

**Setup (10 minutes, once)**
1. Record on localhost with `CONDENSE_API_KEY` set, or on the deployed site after `vercel deploy --prod`.
2. Open the profile sheet, go to **Settings → Forget me** (tap twice), so the welcome screen and the tour show. Keep the key copied.
3. Allow the mic for the site beforehand, so no permission prompt appears in the shot.
4. Chrome: hide the bookmarks bar, go full screen (⌃⌘F), zoom to about 110%. Close other tabs and turn on Do Not Disturb.
5. **Wear headphones.** Cap captures Squarely's audio directly, so it won't hear itself, and your mic stays clean.
6. Camera bubble on for the eyes-closed beat only, if Cap's camera is enabled.

**Recording**
1. Do one full dry run. Then Forget me again before the Hello clip.
2. Record **one clip per beat** and redo only the clip that goes wrong. Leave a second of silence before and after each command.
3. Record all the VO lines last, in one take, slowly.

**Editing (about 20 minutes)**
1. Put the clips in order and trim dead air hard. Speed up the waits to 1.5×, but keep Squarely's voice at 1×.
2. Lay in the VO, and lower Squarely's audio only where they overlap.
3. Add the captions: "Learn from zero", "Eyes closed", "Asks, never tells", "Real Lichess puzzles", "Agent 2 · in the background".
4. Export 1080p and check it's **≤ 2:00**.

---

## 5-minute finalist pitch (if we get through)

1. **Hook (30s).** The same opener: "Chess apps assume you can see the board…" Then the nephew line.
2. **Live demo (2:30).** The same commands, live: tour → learn → eyes closed (e4, "what's attacking me?") → blunder → question → undo → green arrow → puzzle hint ladder → Scout by voice → Agent steps.
3. **How it works (1:00).**
   - Two agents: Squarely (Gemini 3.8 Live, 28 tools) and the Scout (Gemini 3.8 Flash, background).
   - The **truth law:** code computes every fact (chess.js, Stockfish, the Lichess solution, a curated chess book), and the model only phrases it. Every line shows its receipt.
   - Misheard speech is repaired in code, never guessed.
   - Accessible by default: voice out of the box, screen-reader announcements, big letters, and an offline voice with no key.
4. **Partners, with numbers (40s).**
   - Gemini 3.8 Live + 3.8 Flash.
   - condense.chat: the Scout's Flash call goes through its proxy, and memory and the Scout log come out 50% smaller (measured: 3,592 → 1,795 tokens in a real session).
   - Building Squarely through dense: 481.7M → 188.8M tokens (−61%), $109 → $57.
5. **Close (20s).** "Now my nephew has someone to play with. And so does anyone who can't see the board."

**Have ready:**
- a charged laptop, on wired internet if possible;
- a headset;
- the key copied and the mic allowed;
- a game already a few moves in.
