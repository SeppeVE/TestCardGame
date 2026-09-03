// Wire-format types shared with the client (mirrored by hand in
// client/src/types.ts — see the note there).

export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export type Rank = (typeof RANKS)[number];

export const SUITS = ["S", "H", "D", "C"] as const;
export type Suit = (typeof SUITS)[number];

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

/**
 * Everyone eligible answers "take/buy or pass" on the discard at once
 * instead of being asked one at a time. `order` is priority order: the
 * current player first (free take), then everyone else who can afford to
 * buy, in seat order. The first "take" found walking that order wins,
 * regardless of whether people after them have answered yet.
 */
export interface DiscardDecisionState {
  order: string[];
  decisions: Record<string, DiscardDecisionStatus>;
}

export interface RoundResult {
  winnerId: string;
  /** Net coin change per player id for this round's payout. */
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

/** What one specific player is allowed to see of the game right now. */
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
