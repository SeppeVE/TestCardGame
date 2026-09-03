# Card Table

A multiplayer card game, in the spirit of buddyboardgames.com. Players
join a shared room (no accounts) and play a rummy-style game: 3 decks with
jokers, 13-card hands, a discard-or-draw choice each turn, and a "buy the
discard" side mechanic. Only **round 1** of the planned 7-round game is
implemented so far.

## How it works

- **`client/`** — Vue 3 + Vite + TypeScript. Lobby (create/join a room) plus
  the game board: your hand, the discard/stock piles, table melds, and the
  buy/draw/meld/discard prompts for whoever's turn it is.
- **`server/`** — Node + Express + Socket.io + TypeScript. Holds room and
  game state in memory (no database) and pushes each player their own view
  of the game over WebSockets — hands are hidden from everyone but their
  owner.

### Round 1 rules, as implemented

- Dealer flips the first discard; the player after the dealer acts first.
- On your turn: take the visible discard, or draw blind from the stock. If
  you decline the discard, everyone else (in seat order) gets one chance
  to buy it for 1 coin — buying also costs a random "dirty" penalty card
  drawn blind from the stock.
- To lay anything at all, your first lay each round must be one set of 3–4
  cards of the same rank in different suits (jokers are wild). Once you've
  done that (this turn or an earlier one), you can also lay runs of 3+
  consecutive same-suit cards, and add cards to any meld on the table —
  yours or another player's.
- End your turn with a mandatory discard. Emptying your hand this way wins
  the round; everyone else pays the winner 2 coins (or whatever they have
  left, if less).
- Rounds 2–7 (different lay requirements each round, per the classic
  contract-rummy progression) aren't built yet.

No accounts — you pick a display name, create or join a room by a 4-letter
code (or a shareable link), and that's it. Your identity is remembered in
your browser's `localStorage`, so refreshing the page rejoins you as the
same player instead of a stranger. If the host disconnects, host status
passes to the next connected player immediately (it doesn't automatically
come back on reconnect); a disconnected player's spot in the room is
freed entirely after 10 minutes of not returning.

## Running it locally

Requires Node 18+.

```bash
npm install          # installs both workspaces
npm run dev           # runs server (:3001) and client (:5173) together
```

Then open http://localhost:5173, create a room, and open the invite link
in another tab/browser to test joining as a second player.

Run them separately if you prefer: `npm run dev:server` / `npm run dev:client`.

### Configuration

Copy the `.env.example` files if you need to change ports or origins:

- `server/.env` — `PORT`, `CLIENT_ORIGIN` (must match wherever the client is served from, for CORS)
- `client/.env` — `VITE_SERVER_URL` (where the client looks for the Socket.io server)

## Deploying

This needs a host that can run a persistent Node process for the server
(the client is a normal static site, but the server holds live WebSocket
connections, so it can't be a serverless function). Cheap options: a small
VPS, [Fly.io](https://fly.io), [Render](https://render.com), or
[Railway](https://railway.app).

1. Deploy `server/` as a Node service (`npm run build -w server && npm run start -w server`). Set `CLIENT_ORIGIN` to your client's deployed URL.
2. Deploy `client/` as a static site (`npm run build -w client` outputs `client/dist`) to Vercel/Netlify/anywhere static. Set `VITE_SERVER_URL` to your server's deployed URL at build time.
3. Because the client uses client-side routing (`/room/:code`), configure your static host to rewrite unknown paths to `index.html` (a "SPA fallback" — Vercel/Netlify do this by default or with a one-line config).

## What's next

The lobby is the whole scope of this milestone. Once you're ready, the
natural next steps are: an actual game (cards, turns, rules) synced through
the same room state, a "start game" action for the host, and reconnect
handling for mid-game drops.
