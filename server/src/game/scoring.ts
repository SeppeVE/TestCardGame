import type { Card } from "./types.js";

/** Penalty points a single held card is worth at round-end scoring. */
export function cardPoints(card: Card): number {
  if (card.isJoker) return 50;
  if (card.rank === "A") return 1;
  if (card.rank === "10" || card.rank === "J" || card.rank === "Q" || card.rank === "K") return 10;
  return Number(card.rank); // "2".."9"
}

/** Total penalty points for a hand — lower is better, 0 for an empty (winning) hand. */
export function scoreHand(hand: Card[]): number {
  return hand.reduce((sum, card) => sum + cardPoints(card), 0);
}
