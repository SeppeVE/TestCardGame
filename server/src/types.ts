// Shared shape of the data sent to clients. Keep this in sync with
// client/src/types.ts — the two aren't wired together by a build step,
// they're just kept identical by hand since the surface is small.

import type { GameStateView } from "./game/types.js";

export interface Player {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
}

export interface RoomState {
  code: string;
  hostId: string;
  players: Player[];
  phase: "lobby" | "playing";
}

export type ActionAck = { ok: true } | { ok: false; error: string };

// Client -> server events
export interface ClientToServerEvents {
  "room:create": (
    payload: { playerName: string; playerId?: string },
    ack: (res: { ok: true; room: RoomState; playerId: string } | { ok: false; error: string }) => void
  ) => void;
  "room:join": (
    payload: { roomCode: string; playerName: string; playerId?: string },
    ack: (res: { ok: true; room: RoomState; playerId: string } | { ok: false; error: string }) => void
  ) => void;
  "room:leave": (payload: { roomCode: string; playerId: string }) => void;

  "game:start": (payload: { roomCode: string; playerId: string }, ack: (res: ActionAck) => void) => void;
  "game:nextRound": (payload: { roomCode: string; playerId: string }, ack: (res: ActionAck) => void) => void;
  "game:discardDecision": (
    payload: { roomCode: string; playerId: string; wantsToTake: boolean },
    ack: (res: ActionAck) => void
  ) => void;
  "game:layMeld": (
    payload: { roomCode: string; playerId: string; cardIds: string[]; targetMeldId?: string },
    ack: (res: ActionAck) => void
  ) => void;
  "game:layOutHand": (
    payload: { roomCode: string; playerId: string; groups: string[][] },
    ack: (res: ActionAck) => void
  ) => void;
  "game:endTurn": (
    payload: { roomCode: string; playerId: string; cardId: string },
    ack: (res: ActionAck) => void
  ) => void;
}

// Server -> client events
export interface ServerToClientEvents {
  "room:state": (room: RoomState) => void;
  "room:gone": (payload: { reason: string }) => void;
  "game:state": (view: GameStateView) => void;
}
