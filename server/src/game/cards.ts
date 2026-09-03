import { RANKS, SUITS, type Card } from "./types.js";

const DECK_COUNT = 3;
const JOKERS_PER_DECK = 2;

/** Builds the 3-deck-plus-jokers shoe (3 * (52 + 2) = 162 cards). */
export function buildShoe(): Card[] {
  const cards: Card[] = [];
  for (let deck = 0; deck < DECK_COUNT; deck++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ id: `d${deck}-${suit}${rank}`, isJoker: false, rank, suit });
      }
    }
    for (let j = 0; j < JOKERS_PER_DECK; j++) {
      cards.push({ id: `d${deck}-joker${j}`, isJoker: true });
    }
  }
  return cards;
}

/** Fisher-Yates shuffle. Returns a new array; does not mutate the input. */
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
