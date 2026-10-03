# Squarely: 2-minute demo video, recording plan, finalist pitch

What the jury scores: **creativity and technical complexity**, plus a **bonus for partner tech** (Google DeepMind Gemini, condense.chat). In 2 minutes the video has to show three things: a real person with a real problem, an agent (not a chatbot) doing several things on its own, and the partners doing real work.

**The story in one line:** *My nephew keeps sending me chess.com challenges. I don't have time to play, his parents don't either, and none of us can teach him. So I built him a chess buddy he can just talk to: it teaches, plays, sets puzzles, and never makes things up.*

**Rule for the script:** one idea per beat, show it rather than say it, and let Squarely do most of the talking. The nephew is the thread that ties the beats together (learn → play → puzzles → his chess.com games).

---

## The 2-minute script

The **bold** lines are what you say *to Squarely*; "VO" is your voiceover, recorded afterwards over the clip. Times are targets.

| Time | On screen | Audio |
|---|---|---|
| **0:00–0:14** Hook | Phone or laptop showing a pile of chess.com challenges from the nephew (blur his username). Cut to the Squarely welcome screen. | VO: "My nephew keeps sending me chess challenges. I don't have time, his parents don't either, and honestly none of us can teach him. So I built him a buddy that can." |
| **0:14–0:26** Hello | Type the name (Squarely greets you by it, spelled right), paste the Gemini key, tap **Let's play**. Squarely talks while the spotlight moves: board → Learn/Play/Puzzles → Agent steps. | Squarely's tour plays out (about 10 s). No VO. |
| **0:26–0:42** Learn | **"I don't know how chess works. Can you teach me?"** The lesson opens with squares lit up. **"Horse to c3"**, then a pawn gets gobbled. | Squarely explains in plain words. VO (short): "Zero knowledge needed. One piece at a time." |
| **0:42–1:04** Tutor | Play tab after **e4**. **"Bishop to a6"** (a blunder). Squarely looks worried, highlights the bishop and *asks a question*. **"Undo"**, then **"what's a good move?"** and a green arrow appears. Zoom in on the green receipt under its line. | VO: "When he blunders, it doesn't hand him the answer. It asks a question. And every fact comes from the chess engine, not the AI: there's a receipt under every line." |
| **1:04–1:16** Puzzle | **"Give me a fork puzzle"**, then **"hint"**, then **"which piece?"** (the knight glows). Solve it by voice. | VO: "Real puzzles from Lichess, with hints that climb one step at a time." |
| **1:16–1:30** Accessible | Close your eyes on camera, or cover the board with your hand. **"Read the board"**, then **"where is my king?"**, then a move. Optional: a 2-second cut with VoiceOver on, announcing the move. | VO: "No mouse, no reading, no setup. It's voice-first out of the box, and every move is announced to screen readers. Anyone can play, including people who can't see the board." |
| **1:30–1:46** Agent | **"My chess.com username is amoghbanta"** (or the nephew's). The Scout card starts; open **Agent steps** for 3 s while it works. | VO: "That started a second agent. The Scout pulls his real chess.com games and checks every move with Stockfish in the background, then plans what to practise next." |
| **1:46–2:00** Under the hood + close | `docs/images/tech.png` full screen for about 5 s (slow zoom from the Gemini card to the "small things" grid), then the mascot. | VO: "Gemini 3.8 Live drives 28 tools in real time. Flash writes the plan through condense.chat, which halves its memory tokens. Squarely: now my nephew has someone to play with." |

**If you're running long, cut in this order:**
1. The VoiceOver cut (keep the eyes-closed moment).
2. The puzzle's "which piece?" step.
3. The Learn VO line.
4. The tour, trimmed to its first 6 seconds.

Never cut the hook (the story), the tutor question and receipt (the truth law), or Agent steps (it shows it's an agent).

### Lines that reliably work

- **Blunder:** play **e4**, then **"bishop to a6"**. This always triggers the tutor.
- **Learn:** **"I don't know how chess works, can you teach me?"** or **"teach me the horse"**.
- **Eyes closed:** **"read the board"**, **"where is my king?"**, **"what's attacking me?"**
- **Puzzle:** **"give me a fork puzzle"**, **"hint"**, **"which piece?"**, **"show me"**.
- **Before recording:** test the VoiceOver cut once (⌘F5). If it's noisy, drop it and keep the eyes-closed moment.

---

## How to record

**Setup (10 minutes, once)**
1. Record on the deployed site (condense runs there), or on localhost with `CONDENSE_API_KEY` set.
2. Open the profile sheet → **Settings → Forget me** (tap twice), so the welcome screen and the tour show. Have the key copied and ready to paste. Type the name in the welcome screen rather than saying it: speech recognition mishears unusual names.
3. Chrome setup:
   - Hide the bookmarks bar.
   - Go full screen (⌃⌘F) and zoom to about 110%.
   - Close other tabs and turn on Do Not Disturb.
   - Allow the mic for the site in advance, so no permission prompt appears in the shot.
4. Sound: work in a quiet room and **use the MacBook speakers, not headphones**, so the recording captures both your voice and Squarely's. Chrome's echo cancellation keeps Squarely from hearing itself.
5. For the hook: screenshot the chess.com challenges on your phone and blur the username.

**Recording**
1. Press ⌘⇧5, choose **Record Selected Portion** (just the browser), and set **Options → Microphone** to the MacBook microphone.
2. Record **one clip per beat**, and redo only the clip that goes wrong.
3. Do one dry run first. Then Forget me again before recording the Hello beat.
4. Record the VO lines last, in one take with the AirPods mic or a quiet room. Read them slowly; they're written to fit.

**Editing (iMovie or CapCut, about 20 minutes)**
1. Put the clips in order and trim dead air hard. Speed up the waiting for Squarely to 1.5×, but keep its voice at 1×.
2. Lay the VO over the clips and duck Squarely's audio under the VO only where they overlap.
3. Add small captions per beat:
   - "Learn"
   - "Never gives the answer"
   - "Lichess puzzles"
   - "Eyes closed"
   - "Second agent"
4. Export 1080p and check it's **≤ 2:00**.

**Backup:** if the wifi or mic fails, everything works by typing (the box under Squarely), and offline with an in-browser voice.

---

## 5-minute finalist pitch (if we get through)

1. **Story (30s).** "My nephew keeps sending me chess.com challenges. I don't have time, his parents don't either, and none of us can teach him. Chess apps assume you already know the game, and AI chat tutors make things up about the board."
2. **Live demo (2:30).** The same beats, live:
   - the tour,
   - a lesson,
   - blunder → question → undo → green arrow,
   - a puzzle with the hint ladder,
   - eyes-closed "read the board",
   - the Scout launched by voice,
   - a glance at Agent steps.
3. **How it works (1:00).**
   - Gemini 3.8 Live orchestrates 28 tools.
   - The **truth law:** code computes every fact (chess.js, Stockfish, the Lichess solution, a curated chess book), and the model only phrases it. Every line shows its receipt.
   - Misheard speech is repaired in code, never guessed.
   - A second agent works in the background.
   - Accessible by default: voice out of the box, screen-reader announcements, big letters, and an offline voice with no key.
4. **Partners, with numbers (40s).**
   - Gemini 3.8 Live + 3.8 Flash.
   - condense.chat: the Scout's Flash call goes through its proxy, and memory and the Scout log come out 50% smaller (measured: 3,592 → 1,795 tokens in a real session).
   - Building Squarely through dense: 481.7M → 188.8M tokens (−61%), $109 → $57.
5. **Close (20s).** "Squarely is for every kid whose family doesn't have time to play, and for anyone who can't see the board. Now my nephew has someone to play with."

**Have ready:**
- a charged laptop, on wired internet if possible;
- a headset for a noisy room;
- the key copied;
- the mic already allowed;
- a game already a few moves in.
