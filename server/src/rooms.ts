import type { GameState } from "./game/engine.js";
import type { PublicPlayerInfo } from "./game/view.js";
import type { Player, RoomState } from "./types.js";

interface InternalPlayer {
  id: string;
  name: string;
  connected: boolean;
  socketId: string | null;
  joinedAt: number;
  disconnectedAt: number | null;
}

export interface InternalRoom {
  code: string;
  hostId: string;
  players: Map<string, InternalPlayer>;
  /** Set once the host starts a game; undefined while the room is just a lobby. */
  game?: GameState;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — easy to misread
const CODE_LENGTH = 4;

// A disconnected player's slot is freed once nobody's come back for this long.
const STALE_PLAYER_MS = 10 * 60 * 1000; // 10 minutes
const SWEEP_INTERVAL_MS = 60 * 1000;

export class RoomManager {
  private rooms = new Map<string, InternalRoom>();

  private generateCode(): string {
    let code: string;
    do {
      code = Array.from(
        { length: CODE_LENGTH },
        () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
      ).join("");
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(playerName: string): { room: InternalRoom; playerId: string } {
    const code = this.generateCode();
    const playerId = crypto.randomUUID();
    const player: InternalPlayer = {
      id: playerId,
      name: playerName,
      connected: true,
      socketId: null,
      joinedAt: Date.now(),
      disconnectedAt: null,
    };
    const room: InternalRoom = {
      code,
      hostId: playerId,
      players: new Map([[playerId, player]]),
    };
    this.rooms.set(code, room);
    return { room, playerId };
  }

  getRoom(code: string): InternalRoom | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  /**
   * Join a room. If `requestedPlayerId` matches an existing (even
   * disconnected) player in the room, that player reconnects under the
   * same identity instead of a new one being created — this is what lets a
   * page refresh rejoin the lobby without looking like a new person.
   */
  joinRoom(
    code: string,
    playerName: string,
    requestedPlayerId?: string
  ): { room: InternalRoom; playerId: string } | { error: string } {
    const room = this.getRoom(code);
    if (!room) return { error: "Room not found." };

    if (requestedPlayerId && room.players.has(requestedPlayerId)) {
      const existing = room.players.get(requestedPlayerId)!;
      existing.connected = true;
      existing.disconnectedAt = null;
      existing.name = playerName || existing.name;
      return { room, playerId: existing.id };
    }

    const playerId = crypto.randomUUID();
    room.players.set(playerId, {
      id: playerId,
      name: playerName,
      connected: true,
      socketId: null,
      joinedAt: Date.now(),
      disconnectedAt: null,
    });
    return { room, playerId };
  }

  attachSocket(roomCode: string, playerId: string, socketId: string): void {
    const room = this.getRoom(roomCode);
    const player = room?.players.get(playerId);
    if (player) player.socketId = socketId;
  }

  /** Called on socket disconnect. Returns the affected room, if any. */
  handleSocketDisconnect(socketId: string): InternalRoom | undefined {
    for (const room of this.rooms.values()) {
      for (const player of room.players.values()) {
        if (player.socketId === socketId) {
          player.connected = false;
          player.socketId = null;
          player.disconnectedAt = Date.now();
          this.reassignHostIfNeeded(room);
          return room;
        }
      }
    }
    return undefined;
  }

  leaveRoom(roomCode: string, playerId: string): InternalRoom | undefined {
    const room = this.getRoom(roomCode);
    if (!room) return undefined;
    room.players.delete(playerId);
    if (room.players.size === 0) {
      this.rooms.delete(room.code);
      return undefined;
    }
    this.reassignHostIfNeeded(room);
    return room;
  }

  private reassignHostIfNeeded(room: InternalRoom): void {
    const host = room.players.get(room.hostId);
    if (host && host.connected) return;
    const nextHost = [...room.players.values()]
      .filter((p) => p.connected)
      .sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (nextHost) room.hostId = nextHost.id;
  }

  toPublicState(room: InternalRoom): RoomState {
    const players: Player[] = [...room.players.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        isHost: p.id === room.hostId,
      }));
    return { code: room.code, hostId: room.hostId, players, phase: room.game ? "playing" : "lobby" };
  }

  /** Seat order (join order) as plain player ids — used to start a game. */
  getSeatOrder(room: InternalRoom): string[] {
    return [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt).map((p) => p.id);
  }

  getPlayerInfos(room: InternalRoom): PublicPlayerInfo[] {
    return [...room.players.values()].map((p) => ({ id: p.id, name: p.name, connected: p.connected }));
  }

  /** Drop rooms/players that have been abandoned for a long time. */
  sweep(): void {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      for (const player of [...room.players.values()]) {
        if (
          !player.connected &&
          player.disconnectedAt !== null &&
          now - player.disconnectedAt > STALE_PLAYER_MS
        ) {
          room.players.delete(player.id);
        }
      }
      if (room.players.size === 0) {
        this.rooms.delete(room.code);
      } else {
        this.reassignHostIfNeeded(room);
      }
    }
  }

  startSweeping(): NodeJS.Timeout {
    return setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
  }
}
