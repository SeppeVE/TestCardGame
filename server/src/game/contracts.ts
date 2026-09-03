// What a player must lay to "open" (start laying anything at all) in a
// given round. Once opened, every round shares the same freedom: lay
// another set, another run, or add cards to any meld on the table — see
// handleLayMeld in engine.ts.

export type Contract = { kind: "set" } | { kind: "run"; length: number };

const ROUND_CONTRACTS: Record<number, Contract> = {
  1: { kind: "set" }, // one set of 3 (or 4), same rank, different suits
  2: { kind: "run", length: 3 }, // a run of at least 3 consecutive same-suit cards
  3: { kind: "run", length: 4 }, // a run of at least 4 consecutive same-suit cards
};

/** Rounds beyond this haven't been designed/implemented yet. */
export const MAX_IMPLEMENTED_ROUND = Math.max(...Object.keys(ROUND_CONTRACTS).map(Number));

export function getContract(roundNumber: number): Contract {
  return ROUND_CONTRACTS[roundNumber] ?? ROUND_CONTRACTS[1];
}

export function describeContract(contract: Contract): string {
  return contract.kind === "set"
    ? "lay one set of 3 (or 4) matching cards of different suits"
    : `lay a run of at least ${contract.length} consecutive cards of the same suit`;
}
