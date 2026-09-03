// Mirrors server/src/types.ts and server/src/game/types.ts. Kept in sync
// by hand — the surface is small enough that a shared package isn't worth
// the build complexity yet.

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

export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export type Suit = "S" | "H" | "D" | "C";

export interface Card {
  id: string;
  isJoker: boolean;
  rank?: Rank;
  suit?: Suit;
  /** Which of the 3 physical decks this card came from (0-2) — purely cosmetic, each deck has its own house look. */
  deckIndex: number;
}

export type MeldType = "set" | "run";

export interface Meld {
  id: string;
  type: MeldType;
  ownerId: string;
  cards: Card[];
}

export type TurnPhase = "discard-decision" | "meld-discard";

export type DiscardDecisionStatus = "pending" | "take" | "pass";

export interface DiscardDecisionState {
  order: string[];
  decisions: Record<string, DiscardDecisionStatus>;
}

export interface RoundResult {
  winnerId: string;
  coinDeltas: Record<string, number>;
}

export interface GamePlayerView {
  id: string;
  name: string;
  connected: boolean;
  coins: number;
  handCount: number;
  hasOpened: boolean;
  isDealer: boolean;
  isCurrent: boolean;
}

export interface GameStateView {
  roundNumber: number;
  turnPhase: TurnPhase;
  currentPlayerId: string;
  discardTop: Card | null;
  discardCount: number;
  stockCount: number;
  melds: Meld[];
  players: GamePlayerView[];
  discardDecision: DiscardDecisionState | null;
  you: { id: string; hand: Card[] };
  roundResult: RoundResult | null;
}

export type ActionAck = { ok: true } | { ok: false; error: string };

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

  "game:start": (payload: { roomCode: string; playerId: string }, ack: (res: ActionAck) => void) => void;
  "game:discardDecision": (
    payload: { roomCode: string; playerId: string; wantsToTake: boolean },
    ack: (res: ActionAck) => void
  ) => void;
  "game:layMeld": (
    payload: { roomCode: string; playerId: string; cardIds: string[]; targetMeldId?: string },
    ack: (res: ActionAck) => void
  ) => void;
  "game:endTurn": (
    payload: { roomCode: string; playerId: string; cardId: string },
    ack: (res: ActionAck) => void
  ) => void;
}

export interface ServerToClientEvents {
  "room:state": (room: RoomState) => void;
  "room:gone": (payload: { reason: string }) => void;
  "game:state": (view: GameStateView) => void;
}
