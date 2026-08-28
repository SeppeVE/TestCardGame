// Shared shape of the data sent to clients. Keep this in sync with
// client/src/types.ts — the two aren't wired together by a build step,
// they're just kept identical by hand since the surface is tiny.

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
}

// Server -> client events
export interface ServerToClientEvents {
  "room:state": (room: RoomState) => void;
  "room:gone": (payload: { reason: string }) => void;
}
