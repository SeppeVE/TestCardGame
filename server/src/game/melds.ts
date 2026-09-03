import type { Card, MeldType, Rank } from "./types.js";

// Ace can anchor either end of a run (A-2-3 or Q-K-A) but runs never wrap
// past the Ace (K-A-2 is invalid) — so it's assigned a value of 1 or 14
// depending on which fits the rest of the run.
const RANK_VALUE: Record<Rank, number> = {
  A: 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
};

const SUIT_COUNT = 4;
const MAX_RUN_LENGTH = 13;

/**
 * A set: 3 or 4 cards of the same rank, each a different suit (so with 3
 * decks in play you can hold three "ace of spades", but only one of them
 * may go into any single set). Jokers stand in for any missing suit.
 */
export function isValidSet(cards: Card[]): boolean {
  if (cards.length < 3 || cards.length > SUIT_COUNT) return false;

  const real = cards.filter((c) => !c.isJoker);
  if (real.length === 0) return false; // need at least one real card to anchor the rank

  const rank = real[0].rank;
  if (!real.every((c) => c.rank === rank)) return false;

  const suits = real.map((c) => c.suit);
  if (new Set(suits).size !== suits.length) return false; // duplicate suit among real cards

  return true;
}

/**
 * A run: 3+ consecutive ranks, same suit, no repeated rank. Jokers fill
 * gaps (or extend either end). Different decks may supply the real cards,
 * but each rank can only appear once in the sequence.
 */
export function isValidRun(cards: Card[]): boolean {
  if (cards.length < 3 || cards.length > MAX_RUN_LENGTH) return false;

  const real = cards.filter((c) => !c.isJoker);
  if (real.length === 0) return false; // need at least one real card to anchor the suit

  const suit = real[0].suit;
  if (!real.every((c) => c.suit === suit)) return false;

  const ranks = real.map((c) => c.rank as Rank);
  if (new Set(ranks).size !== ranks.length) return false; // duplicate rank

  const jokerCount = cards.length - real.length;
  const hasAce = ranks.includes("A");
  const aceInterpretations = hasAce ? [1, 14] : [null];

  for (const aceValue of aceInterpretations) {
    const values = real.map((c) => (c.rank === "A" ? (aceValue as number) : RANK_VALUE[c.rank as Rank]));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min + 1;
    if (span === cards.length && span - real.length === jokerCount) {
      return true;
    }
  }

  return false;
}

export function isValidMeld(cards: Card[]): boolean {
  return isValidSet(cards) || isValidRun(cards);
}

/** Would appending `additions` to an existing meld's cards still be legal? */
export function isValidExtension(type: MeldType, existingCards: Card[], additions: Card[]): boolean {
  const combined = [...existingCards, ...additions];
  return type === "set" ? isValidSet(combined) : isValidRun(combined);
}
