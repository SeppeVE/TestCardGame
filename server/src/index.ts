import "dotenv/config";
import { createServer } from "node:http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { handleDiscardDecision, handleEndTurn, handleLayMeld, startRound1 } from "./game/engine.js";
import { buildGameView } from "./game/view.js";
import { RoomManager, type InternalRoom } from "./rooms.js";
import type { ClientToServerEvents, ServerToClientEvents } from "./types.js";

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.get("/health", (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
});

const rooms = new RoomManager();
rooms.startSweeping();

const MAX_NAME_LENGTH = 24;
const MIN_GAME_PLAYERS = 2;
const MAX_GAME_PLAYERS = 8;

function sanitizeName(name: string): string {
  return name.trim().slice(0, MAX_NAME_LENGTH);
}

/** Push each connected player their own personalized view of the game (hands are hidden from each other). */
function broadcastGameState(room: InternalRoom): void {
  if (!room.game) return;
  const playerInfos = rooms.getPlayerInfos(room);
  for (const player of room.players.values()) {
    if (!player.socketId) continue;
    io.to(player.socketId).emit("game:state", buildGameView(room.game, playerInfos, player.id));
  }
}

function sendGameStateTo(room: InternalRoom, socketId: string, playerId: string): void {
  if (!room.game) return;
  const playerInfos = rooms.getPlayerInfos(room);
  io.to(socketId).emit("game:state", buildGameView(room.game, playerInfos, playerId));
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ playerName }, ack) => {
    const name = sanitizeName(playerName);
    if (!name) return ack({ ok: false, error: "Name is required." });

    const { room, playerId } = rooms.createRoom(name);
    rooms.attachSocket(room.code, playerId, socket.id);
    socket.join(room.code);
    ack({ ok: true, room: rooms.toPublicState(room), playerId });
  });

  socket.on("room:join", ({ roomCode, playerName, playerId }, ack) => {
    const name = sanitizeName(playerName);
    if (!name) return ack({ ok: false, error: "Name is required." });
    if (!roomCode) return ack({ ok: false, error: "Room code is required." });

    const result = rooms.joinRoom(roomCode, name, playerId);
    if ("error" in result) return ack({ ok: false, error: result.error });

    const { room, playerId: joinedId } = result;
    rooms.attachSocket(room.code, joinedId, socket.id);
    socket.join(room.code);

    const state = rooms.toPublicState(room);
    ack({ ok: true, room: state, playerId: joinedId });
    socket.to(room.code).emit("room:state", state);
    // Rejoining mid-game (e.g. a refresh) should drop the player straight
    // back into the board instead of an empty lobby view.
    sendGameStateTo(room, socket.id, joinedId);
  });

  socket.on("room:leave", ({ roomCode, playerId }) => {
    socket.leave(roomCode);
    const room = rooms.leaveRoom(roomCode, playerId);
    if (room) io.to(room.code).emit("room:state", rooms.toPublicState(room));
  });

  socket.on("game:start", ({ roomCode, playerId }, ack) => {
    const room = rooms.getRoom(roomCode);
    if (!room) return ack({ ok: false, error: "Room not found." });
    if (room.hostId !== playerId) return ack({ ok: false, error: "Only the host can start the game." });
    if (room.game) return ack({ ok: false, error: "The game has already started." });

    const seatOrder = rooms.getSeatOrder(room);
    if (seatOrder.length < MIN_GAME_PLAYERS) {
      return ack({ ok: false, error: `Need at least ${MIN_GAME_PLAYERS} players to start.` });
    }
    if (seatOrder.length > MAX_GAME_PLAYERS) {
      return ack({ ok: false, error: `At most ${MAX_GAME_PLAYERS} players are supported right now.` });
    }

    room.game = startRound1(seatOrder, room.hostId);
    ack({ ok: true });
    io.to(room.code).emit("room:state", rooms.toPublicState(room));
    broadcastGameState(room);
  });

  socket.on("game:discardDecision", ({ roomCode, playerId, wantsToTake }, ack) => {
    const room = rooms.getRoom(roomCode);
    if (!room?.game) return ack({ ok: false, error: "No game in progress." });
    const result = handleDiscardDecision(room.game, playerId, wantsToTake);
    ack(result);
    if (result.ok) broadcastGameState(room);
  });

  socket.on("game:layMeld", ({ roomCode, playerId, cardIds, targetMeldId }, ack) => {
    const room = rooms.getRoom(roomCode);
    if (!room?.game) return ack({ ok: false, error: "No game in progress." });
    const result = handleLayMeld(room.game, playerId, cardIds, targetMeldId);
    ack(result);
    if (result.ok) broadcastGameState(room);
  });

  socket.on("game:endTurn", ({ roomCode, playerId, cardId }, ack) => {
    const room = rooms.getRoom(roomCode);
    if (!room?.game) return ack({ ok: false, error: "No game in progress." });
    const result = handleEndTurn(room.game, playerId, cardId);
    ack(result);
    if (result.ok) broadcastGameState(room);
  });

  socket.on("disconnect", () => {
    const room = rooms.handleSocketDisconnect(socket.id);
    if (room) io.to(room.code).emit("room:state", rooms.toPublicState(room));
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
