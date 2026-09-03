import { buildShoe, shuffle } from "./cards.js";
import { isValidExtension, isValidRun, isValidSet } from "./melds.js";
import type { Card, DiscardDecisionState, Meld, RoundResult, TurnPhase } from "./types.js";

export interface GamePlayerState {
  id: string;
  hand: Card[];
  coins: number;
  /** Has this player laid their round-1 opening set of three yet? */
  hasOpened: boolean;
}

export interface GameState {
  roundNumber: number;
  dealerId: string;
  /** Fixed seating order for the round. */
  order: string[];
  currentPlayerIndex: number;
  stock: Card[];
  /** Last element is the visible top of the pile. */
  discard: Card[];
  melds: Meld[];
  players: Record<string, GamePlayerState>;
  turnPhase: TurnPhase;
  discardDecision: DiscardDecisionState | null;
  roundResult: RoundResult | null;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

const HAND_SIZE = 13;
const STARTING_COINS = 20;
const BUY_COST = 1;
const BUY_PENALTY_DRAW = 1;
const WIN_PAYOUT = 2;

let meldIdCounter = 0;
function nextMeldId(): string {
  meldIdCounter += 1;
  return `meld-${Date.now()}-${meldIdCounter}`;
}

export function startRound1(playerIds: string[], dealerId: string, existingCoins?: Record<string, number>): GameState {
  const shoe = shuffle(buildShoe());
  const players: Record<string, GamePlayerState> = {};
  for (const id of playerIds) {
    players[id] = {
      id,
      hand: shoe.splice(0, HAND_SIZE),
      coins: existingCoins?.[id] ?? STARTING_COINS,
      hasOpened: false,
    };
  }

  const discardTop = shoe.splice(0, 1);
  const dealerIndex = Math.max(0, playerIds.indexOf(dealerId));
  const startIndex = (dealerIndex + 1) % playerIds.length;

  const game: GameState = {
    roundNumber: 1,
    dealerId,
    order: playerIds,
    currentPlayerIndex: startIndex,
    stock: shoe,
    discard: discardTop,
    melds: [],
    players,
    turnPhase: "meld-discard", // placeholder, immediately replaced below
    discardDecision: null,
    roundResult: null,
  };
  beginDiscardDecision(game);
  return game;
}

function currentPlayerId(game: GameState): string {
  return game.order[game.currentPlayerIndex];
}

/** If the stock runs dry, reshuffle everything but the visible top discard back into it. */
function ensureStock(game: GameState): void {
  if (game.stock.length > 0 || game.discard.length <= 1) return;
  const top = game.discard[game.discard.length - 1];
  const rest = game.discard.slice(0, -1);
  game.stock = shuffle(rest);
  game.discard = [top];
}

function drawFromStock(game: GameState): Card | null {
  ensureStock(game);
  return game.stock.shift() ?? null;
}

/**
 * Opens the discard to everyone at once instead of asking one at a time:
 * the current player can take it for free, and everyone else (in seat
 * order after them) can offer to buy it. Every eligible player sees their
 * option immediately and can answer whenever they like — see
 * tryResolveDiscardDecision for how answers get resolved as they come in.
 */
function beginDiscardDecision(game: GameState): void {
  if (game.discard.length === 0) {
    // Nothing to offer (shouldn't normally happen) — just draw and continue.
    const drawer = game.players[currentPlayerId(game)];
    const drawn = drawFromStock(game);
    if (drawn) drawer.hand.push(drawn);
    game.discardDecision = null;
    game.turnPhase = "meld-discard";
    return;
  }

  const n = game.order.length;
  const order = [currentPlayerId(game)];
  for (let offset = 1; offset < n; offset++) {
    const id = game.order[(game.currentPlayerIndex + offset) % n];
    if (game.players[id].coins >= BUY_COST) order.push(id);
  }

  const decisions: Record<string, "pending" | "take" | "pass"> = {};
  for (const id of order) decisions[id] = "pending";

  game.discardDecision = { order, decisions };
  game.turnPhase = "discard-decision";
}

/** Give the discard (and, if bought, a penalty card) to whoever won it, then continue the turn. */
function settleDiscardDecision(game: GameState, winnerId: string | null): void {
  if (winnerId) {
    const winner = game.players[winnerId];
    const card = game.discard.pop()!;
    winner.hand.push(card);

    const isFreeTake = winnerId === currentPlayerId(game);
    if (!isFreeTake) {
      winner.coins -= BUY_COST;
      for (let i = 0; i < BUY_PENALTY_DRAW; i++) {
        const penalty = drawFromStock(game);
        if (penalty) winner.hand.push(penalty);
      }
      const drawer = game.players[currentPlayerId(game)];
      const drawn = drawFromStock(game);
      if (drawn) drawer.hand.push(drawn);
    }
  } else {
    // Nobody wanted it — the current player draws blind as normal.
    const drawer = game.players[currentPlayerId(game)];
    const drawn = drawFromStock(game);
    if (drawn) drawer.hand.push(drawn);
  }

  game.discardDecision = null;
  game.turnPhase = "meld-discard";
}

/**
 * Walks the priority order (current player first, free; then buyers in
 * seat order) looking for the first settled slot. A "take" there wins
 * outright — lower-priority players who haven't answered yet simply
 * don't matter anymore. Stops (does nothing) at the first still-pending
 * slot, since a higher-priority answer could still come in and preempt
 * it. Only resolves "nobody wanted it" once every slot has answered.
 */
function tryResolveDiscardDecision(game: GameState): void {
  const dd = game.discardDecision;
  if (!dd) return;

  for (const id of dd.order) {
    const status = dd.decisions[id];
    if (status === "pending") return;
    if (status === "take") {
      settleDiscardDecision(game, id);
      return;
    }
  }
  settleDiscardDecision(game, null);
}

export function handleDiscardDecision(game: GameState, playerId: string, wantsToTake: boolean): ActionResult {
  if (game.roundResult) return { ok: false, error: "The round is over." };
  if (game.turnPhase !== "discard-decision" || !game.discardDecision) {
    return { ok: false, error: "There's no discard decision to make right now." };
  }

  const dd = game.discardDecision;
  if (!(playerId in dd.decisions)) return { ok: false, error: "You're not part of this decision." };
  if (dd.decisions[playerId] !== "pending") return { ok: false, error: "You've already decided." };

  const isFreeTake = playerId === currentPlayerId(game);
  if (wantsToTake && !isFreeTake && game.players[playerId].coins < BUY_COST) {
    return { ok: false, error: "Not enough coins." };
  }

  dd.decisions[playerId] = wantsToTake ? "take" : "pass";
  tryResolveDiscardDecision(game);
  return { ok: true };
}

function pickFromHand(hand: Card[], cardIds: string[]): Card[] | null {
  const idSet = new Set(cardIds);
  if (idSet.size !== cardIds.length) return null; // duplicate ids requested
  const picked = hand.filter((c) => idSet.has(c.id));
  return picked.length === cardIds.length ? picked : null;
}

function removeFromHand(hand: Card[], cardIds: string[]): void {
  const idSet = new Set(cardIds);
  const remaining = hand.filter((c) => !idSet.has(c.id));
  hand.length = 0;
  hand.push(...remaining);
}

export function handleLayMeld(
  game: GameState,
  playerId: string,
  cardIds: string[],
  targetMeldId?: string
): ActionResult {
  if (game.roundResult) return { ok: false, error: "The round is over." };
  if (game.turnPhase !== "meld-discard") return { ok: false, error: "You can't lay cards right now." };
  if (currentPlayerId(game) !== playerId) return { ok: false, error: "It's not your turn." };
  if (cardIds.length === 0) return { ok: false, error: "Select at least one card." };

  const player = game.players[playerId];
  const picked = pickFromHand(player.hand, cardIds);
  if (!picked) return { ok: false, error: "One of those cards isn't in your hand." };
  if (player.hand.length - picked.length < 1) {
    return { ok: false, error: "You must keep at least one card to discard at the end of your turn." };
  }

  if (targetMeldId) {
    if (!player.hasOpened) {
      return { ok: false, error: "Lay your opening set of three before adding to any meld." };
    }
    const meld = game.melds.find((m) => m.id === targetMeldId);
    if (!meld) return { ok: false, error: "That meld no longer exists." };
    if (!isValidExtension(meld.type, meld.cards, picked)) {
      return { ok: false, error: "Those cards don't extend that meld." };
    }
    removeFromHand(player.hand, cardIds);
    meld.cards.push(...picked);
    return { ok: true };
  }

  if (!player.hasOpened) {
    if (!isValidSet(picked)) {
      return { ok: false, error: "To start, lay exactly one set of 3 (or 4) matching cards of different suits." };
    }
    removeFromHand(player.hand, cardIds);
    game.melds.push({ id: nextMeldId(), type: "set", ownerId: playerId, cards: picked });
    player.hasOpened = true;
    return { ok: true };
  }

  if (isValidSet(picked)) {
    removeFromHand(player.hand, cardIds);
    game.melds.push({ id: nextMeldId(), type: "set", ownerId: playerId, cards: picked });
    return { ok: true };
  }
  if (isValidRun(picked)) {
    removeFromHand(player.hand, cardIds);
    game.melds.push({ id: nextMeldId(), type: "run", ownerId: playerId, cards: picked });
    return { ok: true };
  }
  return { ok: false, error: "That's not a valid set or run." };
}

export function handleEndTurn(game: GameState, playerId: string, discardCardId: string): ActionResult {
  if (game.roundResult) return { ok: false, error: "The round is over." };
  if (game.turnPhase !== "meld-discard") return { ok: false, error: "You can't discard right now." };
  if (currentPlayerId(game) !== playerId) return { ok: false, error: "It's not your turn." };

  const player = game.players[playerId];
  const idx = player.hand.findIndex((c) => c.id === discardCardId);
  if (idx === -1) return { ok: false, error: "That card isn't in your hand." };

  const [card] = player.hand.splice(idx, 1);
  game.discard.push(card);

  if (player.hand.length === 0) {
    // Round won: every other player pays 2 coins (or whatever they have left).
    const coinDeltas: Record<string, number> = {};
    let collected = 0;
    for (const id of game.order) {
      if (id === playerId) continue;
      const other = game.players[id];
      const paid = Math.min(WIN_PAYOUT, other.coins);
      other.coins -= paid;
      coinDeltas[id] = -paid;
      collected += paid;
    }
    player.coins += collected;
    coinDeltas[playerId] = collected;
    game.roundResult = { winnerId: playerId, coinDeltas };
    return { ok: true };
  }

  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.order.length;
  beginDiscardDecision(game);
  return { ok: true };
}
