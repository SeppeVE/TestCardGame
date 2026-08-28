// Mirrors server/src/types.ts. Kept in sync by hand — the surface is
// small enough that a shared package isn't worth the build complexity yet.

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
}

export interface ClientToServerEvents {
  "room:create": (
    payload: { playerName: string },
    ack: (res: { ok: true; room: RoomState; playerId: string } | { ok: false; error: string }) => void
  ) => void;
  "room:join": (
    payload: { roomCode: string; playerName: string; playerId?: string },
    ack: (res: { ok: true; room: RoomState; playerId: string } | { ok: false; error: string }) => void
  ) => void;
  "room:leave": (payload: { roomCode: string; playerId: string }) => void;
}

export interface ServerToClientEvents {
  "room:state": (room: RoomState) => void;
  "room:gone": (payload: { reason: string }) => void;
}
