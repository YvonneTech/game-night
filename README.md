# Game Night

Party games for 2-6 friends — **ten** quick multiplayer mini-games, playable across devices via a shared room code. No sign-up, English or 中文.

## 🎮 Play it live

**https://game-night.yvonnetech.workers.dev**

Create a room, share the invite link, and play together on your phones or laptops.

## Games

- **Pictionary (你画我猜)** — one player draws a secret word while everyone else races to guess it.
- **Telephone (传声画筒)** — everyone writes a secret sentence, then chains rotate: draw what you got, caption the drawing you got, repeat. At the end every chain is replayed step-by-step so you can trace exactly where it drifted. 3+ players.
- **Pass the Pen (接力画)** — one guesser, everyone else relay-draws the same secret; cooperative team score.
- **Sketchy (滥竽充画)** — everyone co-draws on one canvas — one fake artist only sees the category, not the word. Spot the fake by their strokes! 3+ players.
- **Charades (你演我猜)** — one player acts out a secret word without speaking while everyone else races to guess it.
- **Undercover (谁是卧底)** — everyone gets a secret word, but the undercover(s) get a similar different one. Describe your word, then vote out the spy. 4+ players.
- **In Sync (心有灵序)** — everyone gets a secret number on the same spectrum, reveals a clue when ready, and places their card into the shared order before all numbers are flipped. No points. 3+ players.
- **Balderdash (胡说八道)** — obscure word, fake definitions. Everyone invents a believable definition, then votes for the REAL one. +100 for spotting truth, +50 per fool. Host can reveal hints. 3+ players.
- **Emoji Movie (表情猜成语)** — one player describes a secret movie (EN) / 成语 (中文) with emojis only, everyone else races to guess it.
- **Slip Up (说漏嘴)** — best in the same room. Everyone gets a secret taboo (a word you can't say or an action you can't do) that only *others* can see. Bait each other into slipping, tap Caught! when they do; fewest slip-ups when the timer runs out wins. 3+ players.

### Temporarily retired

**Kitty Cup (猫咪杯)** is hidden from the game selector while its real-time networking is redesigned to reduce multiplayer latency. Its implementation remains in the repository for possible future work.

**Punchline (神回复)** is hidden from the game selector while its gameplay is reconsidered. Its implementation remains in the repository for possible future work.

English or 中文 word banks, chosen when you create a room.

## Tech

- **Cloudflare Workers + Durable Objects** — one Durable Object per room holds authoritative game state and fans out updates over WebSockets; empty rooms auto-recycle.
- **React + Vite + TypeScript** single-page client, served as static assets by the Worker.
- Real-time sync, per-viewer hidden info (secret words/roles), and invite links — no accounts, no database to run.
- Each room stores a private reconnect token in the browser, so reopening the invite link restores the same player and host role. Disconnected seats have a short grace period; fully empty rooms expire after 10 minutes and delete their Durable Object storage.

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
