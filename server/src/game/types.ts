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

/**
 * The final round's extra payout: the pot of every coin ever spent
 * buying a discard, across the whole game, split evenly between the
 * round's winner and anyone whose total points are still <= the
 * winner's (rewarding consistently efficient play even if they didn't
 * win the very last hand). A split that doesn't divide evenly hands the
 * remainder to the round winner.
 */
export interface FinalPayout {
  potTotal: number;
  recipients: string[];
  share: number;
  remainderToWinner: number;
}

export interface RoundResult {
  winnerId: string;
  /** Net coin change per player id for this round's payout. */
  coinDeltas: Record<string, number>;
  /** Penalty points each player's remaining hand was worth this round (0 for the winner). */
  handScores: Record<string, number>;
  /** Set only when this was the final (lay-out) round. */
  finalPayout: FinalPayout | null;
}

export interface GamePlayerView {
  id: string;
  name: string;
  connected: boolean;
  coins: number;
  /** Cumulative penalty points from every round scored so far — lower is better. */
  points: number;
  handCount: number;
  hasOpened: boolean;
  isDealer: boolean;
  isCurrent: boolean;
}

/** What one specific player is allowed to see of the game right now. */
export interface GameStateView {
  roundNumber: number;
  /** Human-readable description of what this round's opening lay requires. */
  contractDescription: string;
  /** Whether a round after this one has been implemented yet. */
  hasNextRound: boolean;
  /** The final round: nothing can be laid until the whole hand goes down at once (see game:layOutHand). */
  isLayOutRound: boolean;
  /** Running total of every coin ever spent buying a discard this game — paid out at the end of the final round. */
  buyPot: number;
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
