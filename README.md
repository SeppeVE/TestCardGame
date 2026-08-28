# Card Table

A multiplayer card game, in the spirit of buddyboardgames.com. This first
milestone only covers **getting players into a shared room** — no game
logic yet. That's the next step, built on top of this foundation.

## How it works

- **`client/`** — Vue 3 + Vite + TypeScript. Lets you create a room, share
  its link/code, and see who's in the lobby in real time.
- **`server/`** — Node + Express + Socket.io + TypeScript. Holds room state
  in memory (no database) and pushes updates to everyone in a room over
  WebSockets.

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
