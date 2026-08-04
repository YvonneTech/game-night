# Game Night

Party games for 2-6 friends — **seven** quick multiplayer mini-games, playable across devices via a shared room code. No sign-up, English or 中文.

## 🎮 Play it live

**https://game-night.yvonnetech.workers.dev**

Create a room, share the invite link, and play together on your phones or laptops.

## Games

- **Draw & Act (你画我猜 & 你比我猜)** — one player draws or acts a secret word; everyone else races to guess. Staged hints reveal the word length (20s) then its category (40s).
- **Pass the Pen (接力画)** — one guesser, everyone else relay-draws the same secret; cooperative team score.
- **Kitty Cup (猫咪杯)** — a frantic 3v3 yarn-ball soccer match with random teams (bots fill empty spots).
- **Undercover (谁是卧底)** — everyone gets a secret word, but the undercover(s) get a similar different one. Describe your word, then vote out the spy. 4+ players.
- **Wavelength (心有灵犀)** — one player gives a clue for a hidden spot on a spectrum (cold ↔ hot); everyone else slides to guess it. 3+ players.
- **Fake Artist (假画家)** — everyone co-draws on one canvas — one fake artist only sees the category, not the word. Spot the fake by their strokes! 3+ players.
- **Telephone (传声画筒)** — everyone writes a secret sentence, then chains rotate: draw what you got, caption the drawing you got, repeat. At the end every chain is replayed step-by-step so you can trace exactly where it drifted. 3+ players.

English or 中文 word banks, chosen when you create a room.

## Tech

- **Cloudflare Workers + Durable Objects** — one Durable Object per room holds authoritative game state and fans out updates over WebSockets; empty rooms auto-recycle.
- **React + Vite + TypeScript** single-page client, served as static assets by the Worker.
- Real-time sync, per-viewer hidden info (secret words/roles), reconnect, and invite links — no accounts, no database to run.

## Run

```bash
npm install
npm run build
npm run dev:worker
```

Open `http://localhost:8787`.

For Vite hot reload:

```bash
npm run dev
npm run dev:worker
```

Open `http://localhost:5173`.

## Deploy

```bash
npm run build
npm run deploy
```
