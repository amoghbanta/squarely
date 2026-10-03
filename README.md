# Squarely

**Chess you play by talking, with a coach that never makes things up.**

Squarely is a voice-first chess partner for anyone who has no one to play and practise with. It's kid-friendly by default, with a kids-mode toggle, and accessible out of the box because you never need to see the board.

Built at the {Tech: Europe} × Google DeepMind Agentic AI Hack, Stockholm, 3 October 2026.

## Try it

1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Open the app, paste your key, tap **Start talking**.

Your key goes straight from your browser to Google. Squarely has no server.

## Run locally

```bash
npm install
npm run dev   # http://localhost:5173
```

Requires Node 20+. `npm run dev` / `npm run build` copy the Stockfish WASM build from `node_modules/stockfish` into `public/stockfish/`.

## How it works

- **Voice agent:** Gemini 3.8 Live (`gemini-3.8-live`) with function calling. It decides what to do next: play the move, ask "which horse?", pause for a hint, or send the Scout off.
- **Truth law:** the model never judges a position. Every claim it speaks comes from a tool result computed by chess.js or Stockfish.
- **Roles:**
  - **Referee** (chess.js) validates every move and asks when a request is ambiguous.
  - **Opponent** (Stockfish WASM) plays at your level.
  - **Tutor** spots blunders by win-probability drop and asks a hint question instead of giving the answer.
  - **Memory** (localStorage) keeps your name and recurring mistakes.
  - **Scout** is a background agent. It reviews your recent chess.com games with its own engine and turns the patterns into a practice plan with Gemini 3.8 Flash.
- **Agent trace:** a side panel shows every tool call and which role handled it.

## Credits

- [Stockfish.js](https://github.com/nmrugg/stockfish.js) (GPLv3) by Nathan Rugg / Chess.com, based on [Stockfish](https://github.com/official-stockfish/Stockfish).
- [chess.js](https://github.com/jhlywa/chess.js).
- Google Gemini API: Gemini 3.8 Live and Gemini 3.8 Flash.
