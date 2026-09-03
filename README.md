# Card Table

A multiplayer card game, in the spirit of buddyboardgames.com. Players
join a shared room (no accounts, minimum 4 players) and play a
rummy-style game: 3 decks with jokers, 13-card hands, a discard-or-draw
choice each turn, and a "buy the discard" side mechanic. **All 6 rounds**
of the game are implemented.

## How it works

- **`client/`** — Vue 3 + Vite + TypeScript. Lobby (create/join a room) plus
  the game board: your hand, the discard/stock piles, table melds, and the
  buy/draw/meld/discard prompts for whoever's turn it is.
- **`server/`** — Node + Express + Socket.io + TypeScript. Holds room and
  game state in memory (no database) and pushes each player their own view
  of the game over WebSockets — hands are hidden from everyone but their
  owner.

### Rules, as implemented

- Dealer flips the first discard; the player after the dealer acts first,
  and the dealer role rotates one seat each round.
- On your turn: take the visible discard for free, or pass and draw blind
  from the stock. Everyone else gets the same choice at the same time (pay
  1 coin to buy the discard instead of drawing blind, plus a random "dirty"
  penalty card) — whoever has priority (you first, then seat order after
  you) and says "take" wins it, as soon as that's determined, without
  waiting on anyone lower-priority who hasn't answered yet.
- To lay anything at all, your first lay each round must satisfy that
  round's contract (jokers are wild throughout):
  - **Round 1** — one set of 3–4 cards of the same rank, different suits.
  - **Round 2** — one run of 3+ consecutive same-suit cards.
  - **Round 3** — one run of 4+ consecutive same-suit cards.
  - **Round 4** — one run of 5+ consecutive same-suit cards.
  - **Round 5** — one run of 6+ consecutive same-suit cards.
  - **Round 6 (final)** — your entire hand at once: grouped into sets/runs
    of 3+, using every card but one, laid down in a single turn. Nothing
    can be laid before that — no partial opening, no adding to melds —
    since the moment someone manages it, they've emptied their hand and
    the round is already over. The board has a dedicated group-builder for
    this: start a group, click cards to add them to it, finish it, repeat,
    then lay the whole thing out (or just discard if you can't).

  For rounds 1–5, once you've opened (this turn or an earlier one), you
  can also lay new sets, new runs, and add cards to any meld on the table —
  yours or another player's.
- End your turn with a mandatory discard. Emptying your hand this way wins
  the round; everyone else pays the winner 2 coins (or whatever they have
  left, if less). The host can then start the next round, carrying coins
  forward.

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
