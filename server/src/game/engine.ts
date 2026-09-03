import { buildShoe, shuffle } from "./cards.js";
import { isValidExtension, isValidRun, isValidSet } from "./melds.js";
import type { Card, Meld, RoundResult, TurnPhase } from "./types.js";

export interface GamePlayerState {
  id: string;
  hand: Card[];
  coins: number;
  /** Has this player laid their round-1 opening set of three yet? */
  hasOpened: boolean;
}

interface PendingBuy {
  /** Player ids still to be asked, in seating order, starting after the decliner. */
  order: string[];
  cursor: number;
  card: Card;
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
  pendingBuy: PendingBuy | null;
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

  return {
    roundNumber: 1,
    dealerId,
    order: playerIds,
    currentPlayerIndex: startIndex,
    stock: shoe,
    discard: discardTop,
    melds: [],
    players,
    turnPhase: "draw-choice",
    pendingBuy: null,
    roundResult: null,
  };
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

export function handleDrawChoice(game: GameState, playerId: string, source: "discard" | "stock"): ActionResult {
  if (game.roundResult) return { ok: false, error: "The round is over." };
  if (game.turnPhase !== "draw-choice") return { ok: false, error: "It's not the draw stage." };
  if (currentPlayerId(game) !== playerId) return { ok: false, error: "It's not your turn." };

  const player = game.players[playerId];

  if (source === "discard") {
    if (game.discard.length === 0) return { ok: false, error: "The discard pile is empty." };
    player.hand.push(game.discard.pop()!);
    game.turnPhase = "meld-discard";
    return { ok: true };
  }

  // Declining the discard opens a buy window for everyone else, in seat
  // order starting right after this player and wrapping around, before
  // this player draws blind from the stock.
  if (game.discard.length > 0) {
    const n = game.order.length;
    const candidates: string[] = [];
    for (let offset = 1; offset < n; offset++) {
      const id = game.order[(game.currentPlayerIndex + offset) % n];
      if (game.players[id].coins >= BUY_COST) candidates.push(id);
    }
    if (candidates.length > 0) {
      game.pendingBuy = { order: candidates, cursor: 0, card: game.discard[game.discard.length - 1] };
      game.turnPhase = "buy-window";
      return { ok: true };
    }
  }

  const drawn = drawFromStock(game);
  if (drawn) player.hand.push(drawn);
  game.turnPhase = "meld-discard";
  return { ok: true };
}

function resolveBuyWindowAndDraw(game: GameState): void {
  game.pendingBuy = null;
  const drawer = game.players[currentPlayerId(game)];
  const drawn = drawFromStock(game);
  if (drawn) drawer.hand.push(drawn);
  game.turnPhase = "meld-discard";
}

export function handleBuyDecision(game: GameState, playerId: string, wantsToBuy: boolean): ActionResult {
  if (game.roundResult) return { ok: false, error: "The round is over." };
  if (game.turnPhase !== "buy-window" || !game.pendingBuy) return { ok: false, error: "No buy offer is pending." };

  const buy = game.pendingBuy;
  if (buy.order[buy.cursor] !== playerId) return { ok: false, error: "It's not your turn to decide." };

  if (!wantsToBuy) {
    buy.cursor += 1;
    if (buy.cursor >= buy.order.length) resolveBuyWindowAndDraw(game);
    return { ok: true };
  }

  const buyer = game.players[playerId];
  if (buyer.coins < BUY_COST) return { ok: false, error: "Not enough coins." };

  buyer.coins -= BUY_COST;
  game.discard.pop(); // the offered card, now bought
  buyer.hand.push(buy.card);
  for (let i = 0; i < BUY_PENALTY_DRAW; i++) {
    const penalty = drawFromStock(game);
    if (penalty) buyer.hand.push(penalty);
  }
  resolveBuyWindowAndDraw(game);
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
  game.turnPhase = "draw-choice";
  return { ok: true };
}
