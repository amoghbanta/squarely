# Squarely: 2-minute demo video, recording plan, finalist pitch

What the jury scores: **creativity and technical complexity**, plus a **bonus for partner tech** (Google DeepMind Gemini, condense.chat). The video has to show, in 2 minutes: a real person with a real problem, an agent (not a chatbot) doing several things on its own, and the partners doing real work.

**The story in one line:** *I never properly learned chess, and nobody around me plays. Squarely is a chess buddy you just talk to: it teaches you, plays you, quizzes you, and it never makes things up.*

---

## The 2-minute script

Say your lines naturally; the quoted lines in **bold** are what you say *to Squarely*. Times are targets. Record each beat as its own clip (see "How to record").

| Time | On screen | You say (voiceover or live) |
|---|---|---|
| **0:00–0:12** Hook | Welcome screen, the plush mascot. Tap Squarely. | "I'm Amogh. I never really learned chess, and nobody around me plays. So I built a chess buddy you just *talk* to, and one rule: it never makes things up." |
| **0:12–0:35** Learn | **"Hi Squarely, I don't know how to play chess. Can you teach me?"** It opens the castle lesson (or say **"teach me the horse"**). Squares light up. Say **"horse to c3"**, then **"horse to e4"**: pawns get gobbled. | "Total beginners start in Learn: one piece at a time, the rule in plain words, and where it can go lit up on the board." |
| **0:35–1:05** Play + tutor | Play tab, a game a few moves in. Make a blunder by voice: **"bishop to a6"** (after e4, bishop a6 drops it). Squarely pauses, looks worried, highlights the bishop and *asks a question*. Say **"undo"**, then **"what's a good move for my queen?"**: green arrow. Then **"was that good?"**: a grade badge. | "When I blunder, it doesn't give me the answer. It pauses and asks a question. Every fact it says comes from the chess engine, not the AI. See the receipt under each line." |
| **1:05–1:22** Puzzles | Puzzles tab, **"give me a fork puzzle"**, then **"hint"**, then **"which piece?"** (the knight glows), then solve it by voice. | "Puzzles come from the Lichess database. Hints climb a ladder: the idea, then which piece, then the move, all taken from the puzzle's real solution." |
| **1:22–1:40** Agent + Scout | Say **"my chess.com username is amoghbanta"**. The Scout card appears and starts working; keep playing a move. Open **Agent steps** for 3 seconds. | "That started a second agent, the Scout. It's pulling my real games and checking every move with Stockfish in the background while we keep playing. On the right you can see every decision the agent makes, in plain English." |
| **1:40–1:55** Under the hood | Agent steps panel, or a still of the README "agent" diagram. | "Gemini 3.8 Live orchestrates 28 tools in real time. Gemini 3.8 Flash writes the Scout's plan through the condense.chat proxy. condense also halves the memory and Scout tokens, so a free Gemini key goes twice as far there, and building Squarely through dense used 61% fewer tokens." |
| **1:55–2:00** Close | Mascot happy face / banner. | "Squarely. Chess you play by talking, with a coach that never makes things up." |

**If you're running long, cut in this order:** the "was that good?" grade → the Learn second move → the Scout keep-playing move. Never cut the tutor beat (it's the truth law, which is the differentiator) or the Agent steps glimpse (it shows it's an agent).

### Lines that reliably work (tested)

- Blunder that always triggers the tutor: play **e4**, then **"bishop to a6"**.
- Learn: **"I don't know how to play chess, can you teach me?"** starts the castle lesson; **"teach me the horse"** jumps to the knight.
- Misheard-move moment (optional, nice for "agentic"): **"night to G3"** at the start makes it say a horse can't go there and offer f3/h3 with numbered arrows.
- Puzzle: **"give me a fork puzzle"**, **"hint"**, **"which piece?"**, **"show me"**.

---

## How to record

**Setup (10 minutes, once)**
1. Use the deployed site (`https://squarely-chess.vercel.app`), so condense runs through Vercel, or localhost with `CONDENSE_API_KEY` set.
2. Open the profile sheet, go to **Settings → Forget me** (tap twice) for a fresh start, so the welcome screen and the first lesson show. Paste the key again.
3. Chrome: hide the bookmarks bar, enter full screen (⌃⌘F), zoom to about 110%. Close other tabs. Turn on Do Not Disturb.
4. A quiet room. **Use the MacBook speakers, not headphones**, at medium volume: the screen recording captures your voice *and* Squarely's through the mic. Chrome's echo cancellation stops Squarely hearing itself.

**Recording**
1. Press **⌘⇧5** → **Record Selected Portion** (just the browser) → **Options → Microphone: MacBook Pro Microphone**. Record.
2. **One clip per beat** (6 clips). If a beat goes wrong, redo just that clip. Leave a one-second pause before and after you speak.
3. Do one dry run of the whole script first, so Squarely's memory and saved game are in a good state.

**Editing (iMovie or CapCut, about 20 minutes)**
1. Drop the 6 clips in order and trim dead air hard. Waiting for Squarely's reply can be sped up to 1.5×, but keep its voice at 1×.
2. Record the hook and the "under the hood" lines as voiceover, if that's easier than speaking live.
3. Add short captions for the beat titles: "Learn", "Tutor (never gives the answer)", "Lichess puzzles", "Background agent", "Under the hood".
4. Export 1080p and check it's **≤ 2:00**.

**Backup:** if the venue wifi or mic fails on the day, everything works by typing (the box under Squarely) and offline with an in-browser voice.

---

## 5-minute finalist pitch (if we get through)

1. **Problem (30s).** "I'm Amogh. I never properly learned chess and nobody around me plays. Apps are built for people who already know the game, and AI chat tutors make things up about the board."
2. **Live demo (2:30).** Same beats as the video, live: lesson, then blunder → question → undo → green arrow, then a puzzle with the hint ladder, then the Scout launched by voice, then a glance at Agent steps.
3. **How it works (1:00).**
   - Gemini 3.8 Live orchestrates 28 tools.
   - The **truth law:** code computes every fact (chess.js, Stockfish, the Lichess solution, a curated chess book) and the model only phrases it.
   - Misheard speech is repaired in code and never guessed.
   - A second agent works in the background.
4. **Partners, with numbers (40s).**
   - Gemini 3.8 Live + 3.8 Flash.
   - condense.chat: the Scout's Flash call goes through its proxy; memory and the Scout log are 50% smaller (measured: 3,592 → 1,795 tokens in a real session).
   - Building Squarely through dense: 481.7M → 188.8M tokens (−61%), $109 → $57.
5. **Close (20s).** "Squarely is for anyone who wants to learn and play chess and has no one to play with, including kids and people who can't see the board. Chess you play by talking, with a coach that never makes things up."

Have ready: a charged laptop on wired internet if possible, a headset for a noisy room, the key already pasted, and a game already a few moves in.
