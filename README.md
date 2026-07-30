# Game Night

Party games for 2-6 friends — a collection of quick multiplayer mini-games, playable across devices via a shared room code.

## 🎮 Play it live

**https://game-night.yarnpals.workers.dev**

Create a room, share the invite link, and play together on your phones or laptops.

## Games

- **Draw & Act** — one player draws or acts a secret word; everyone else races to guess. Staged hints reveal the word length (20s) then its category (40s).
- **Pass the Pen** — one guesser, everyone else relay-draws the same secret; cooperative team score.
- **Kitty Cup** — a frantic 3v3 yarn-ball soccer match with random teams (bots fill empty spots).
- **Undercover (谁是卧底)** — everyone gets a secret word, but the undercover(s) get a similar different one. Describe your word, then vote out the spy. 4+ players.

English or 中文 word banks, chosen when you create a room.

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
