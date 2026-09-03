// What a player must lay to "open" (start laying anything at all) in a
// given round. Once opened, sets/runs/other-round contracts all share
// the same post-open freedom: lay another set, another run, or add
// cards to any meld on the table — see handleLayMeld in engine.ts.
// The final round ("lay-out") is the one exception: nothing can be laid
// until the player's *entire* hand goes down at once — see
// handleLayOutHand in engine.ts.

export type Contract = { kind: "set" } | { kind: "run"; length: number } | { kind: "lay-out" };

const ROUND_CONTRACTS: Record<number, Contract> = {
  1: { kind: "set" }, // one set of 3 (or 4), same rank, different suits
  2: { kind: "run", length: 3 }, // a run of at least 3 consecutive same-suit cards
  3: { kind: "run", length: 4 }, // a run of at least 4 consecutive same-suit cards
  4: { kind: "run", length: 5 }, // a run of at least 5 consecutive same-suit cards
  5: { kind: "run", length: 6 }, // a run of at least 6 consecutive same-suit cards
  6: { kind: "lay-out" }, // the whole hand, as sets/runs of 3+, in one turn
};

/** Rounds beyond this haven't been designed/implemented yet. */
export const MAX_IMPLEMENTED_ROUND = Math.max(...Object.keys(ROUND_CONTRACTS).map(Number));

export function getContract(roundNumber: number): Contract {
  return ROUND_CONTRACTS[roundNumber] ?? ROUND_CONTRACTS[1];
}

export function describeContract(contract: Contract): string {
  switch (contract.kind) {
    case "set":
      return "lay one set of 3 (or 4) matching cards of different suits";
    case "run":
      return `lay a run of at least ${contract.length} consecutive cards of the same suit`;
    case "lay-out":
      return "lay your entire hand at once, as sets/runs of 3+, keeping exactly one card back to discard — nothing can be laid otherwise";
  }
}
