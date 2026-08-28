import "dotenv/config";
import { createServer } from "node:http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { RoomManager } from "./rooms.js";
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

function sanitizeName(name: string): string {
  return name.trim().slice(0, MAX_NAME_LENGTH);
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
  });

  socket.on("room:leave", ({ roomCode, playerId }) => {
    socket.leave(roomCode);
    const room = rooms.leaveRoom(roomCode, playerId);
    if (room) io.to(room.code).emit("room:state", rooms.toPublicState(room));
  });

  socket.on("disconnect", () => {
    const room = rooms.handleSocketDisconnect(socket.id);
    if (room) io.to(room.code).emit("room:state", rooms.toPublicState(room));
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
