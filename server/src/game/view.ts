import { describeContract, getContract, MAX_IMPLEMENTED_ROUND } from "./contracts.js";
import type { GameState } from "./engine.js";
import type { Card, GameStateView } from "./types.js";

export interface PublicPlayerInfo {
  id: string;
  name: string;
  connected: boolean;
}

const SUIT_ORDER: Record<string, number> = { S: 0, H: 1, D: 2, C: 3 };
const RANK_ORDER: Record<string, number> = Object.fromEntries(
  ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].map((r, i) => [r, i])
);

function sortForDisplay(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.isJoker !== b.isJoker) return a.isJoker ? 1 : -1;
    if (a.isJoker) return 0;
    const suitDiff = SUIT_ORDER[a.suit!] - SUIT_ORDER[b.suit!];
    if (suitDiff !== 0) return suitDiff;
    return RANK_ORDER[a.rank!] - RANK_ORDER[b.rank!];
  });
}

export function buildGameView(game: GameState, playerInfos: PublicPlayerInfo[], viewerId: string): GameStateView {
  const infoById = new Map(playerInfos.map((p) => [p.id, p]));
  const currentPlayerId = game.order[game.currentPlayerIndex];
  const viewerHand = game.players[viewerId]?.hand ?? [];
  const contract = getContract(game.roundNumber);

  return {
    roundNumber: game.roundNumber,
    contractDescription: describeContract(contract),
    hasNextRound: game.roundNumber < MAX_IMPLEMENTED_ROUND,
    isLayOutRound: contract.kind === "lay-out",
    buyPot: game.buyPot,
    turnPhase: game.turnPhase,
    currentPlayerId,
    discardTop: game.discard[game.discard.length - 1] ?? null,
    discardCount: game.discard.length,
    stockCount: game.stock.length,
    melds: game.melds,
    players: game.order.map((id) => {
      const info = infoById.get(id);
      const player = game.players[id];
      return {
        id,
        name: info?.name ?? "Unknown",
        connected: info?.connected ?? false,
        coins: player.coins,
        points: player.points,
        handCount: player.hand.length,
        hasOpened: player.hasOpened,
        isDealer: id === game.dealerId,
        isCurrent: id === currentPlayerId,
      };
    }),
    discardDecision: game.discardDecision,
    you: { id: viewerId, hand: sortForDisplay(viewerHand) },
    roundResult: game.roundResult,
  };
}
