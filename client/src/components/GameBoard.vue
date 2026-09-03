<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { socket } from "../socket";
import type { ActionAck, Card, GameStateView, Meld } from "../types";
import PlayingCard from "./PlayingCard.vue";

const props = defineProps<{
  view: GameStateView;
  roomCode: string;
  myPlayerId: string;
}>();

const selectedCardIds = ref<Set<string>>(new Set());
const selectedMeldId = ref<string | null>(null);
const actionError = ref("");
const busy = ref(false);

// Selection doesn't carry meaning across turns/phases — clear it whenever
// either changes so a stale pick can't be replayed into a new context.
watch(
  () => [props.view.turnPhase, props.view.currentPlayerId],
  () => {
    selectedCardIds.value = new Set();
    selectedMeldId.value = null;
  }
);

const me = computed(() => props.view.players.find((p) => p.id === props.myPlayerId));
const isMyTurn = computed(() => props.view.currentPlayerId === props.myPlayerId);
const otherPlayers = computed(() => props.view.players.filter((p) => p.id !== props.myPlayerId));

const myAction = computed<"draw-choice" | "buy-decision" | "meld-discard" | "waiting">(() => {
  if (props.view.roundResult) return "waiting";
  if (props.view.turnPhase === "draw-choice" && isMyTurn.value) return "draw-choice";
  if (props.view.turnPhase === "buy-window" && props.view.pendingBuyPlayerId === props.myPlayerId) {
    return "buy-decision";
  }
  if (props.view.turnPhase === "meld-discard" && isMyTurn.value) return "meld-discard";
  return "waiting";
});

const waitingLabel = computed(() => {
  const v = props.view;
  if (v.roundResult) return "";
  if (v.turnPhase === "buy-window" && v.pendingBuyPlayerId) {
    const name = v.players.find((p) => p.id === v.pendingBuyPlayerId)?.name ?? "someone";
    return `Waiting for ${name} to decide whether to buy the discard…`;
  }
  const currentName = v.players.find((p) => p.id === v.currentPlayerId)?.name ?? "someone";
  return v.turnPhase === "draw-choice"
    ? `Waiting for ${currentName} to take the discard or draw blind…`
    : `Waiting for ${currentName}…`;
});

function toggleCard(card: Card) {
  if (myAction.value !== "meld-discard") return;
  const next = new Set(selectedCardIds.value);
  if (next.has(card.id)) next.delete(card.id);
  else next.add(card.id);
  selectedCardIds.value = next;
}

function toggleMeldTarget(meld: Meld) {
  if (myAction.value !== "meld-discard") return;
  selectedMeldId.value = selectedMeldId.value === meld.id ? null : meld.id;
}

function ownerName(ownerId: string): string {
  return props.view.players.find((p) => p.id === ownerId)?.name ?? "Unknown";
}

function runAction(promiseLike: (ack: (res: ActionAck) => void) => void) {
  busy.value = true;
  actionError.value = "";
  promiseLike((res) => {
    busy.value = false;
    if (!res.ok) {
      actionError.value = res.error;
      return;
    }
    selectedCardIds.value = new Set();
    selectedMeldId.value = null;
  });
}

function chooseDraw(source: "discard" | "stock") {
  runAction((ack) => socket.emit("game:drawChoice", { roomCode: props.roomCode, playerId: props.myPlayerId, source }, ack));
}

function decideBuy(wantsToBuy: boolean) {
  runAction((ack) =>
    socket.emit("game:buyDecision", { roomCode: props.roomCode, playerId: props.myPlayerId, wantsToBuy }, ack)
  );
}

function layAsNewMeld() {
  if (selectedCardIds.value.size === 0) return;
  runAction((ack) =>
    socket.emit(
      "game:layMeld",
      { roomCode: props.roomCode, playerId: props.myPlayerId, cardIds: [...selectedCardIds.value] },
      ack
    )
  );
}

function addToSelectedMeld() {
  if (!selectedMeldId.value || selectedCardIds.value.size === 0) return;
  runAction((ack) =>
    socket.emit(
      "game:layMeld",
      {
        roomCode: props.roomCode,
        playerId: props.myPlayerId,
        cardIds: [...selectedCardIds.value],
        targetMeldId: selectedMeldId.value!,
      },
      ack
    )
  );
}

function discardAndEndTurn() {
  const [cardId] = selectedCardIds.value;
  if (!cardId || selectedCardIds.value.size !== 1) return;
  runAction((ack) => socket.emit("game:endTurn", { roomCode: props.roomCode, playerId: props.myPlayerId, cardId }, ack));
}
</script>

<template>
  <div class="board">
    <div v-if="view.roundResult" class="round-result">
      <div class="eyebrow">Round {{ view.roundNumber }} complete</div>
      <h2>{{ ownerName(view.roundResult.winnerId) }} wins!</h2>
      <ul>
        <li v-for="p in view.players" :key="p.id">
          <span>{{ p.name }}</span>
          <span class="delta" :class="{ pos: view.roundResult.coinDeltas[p.id] > 0 }"
            >{{ view.roundResult.coinDeltas[p.id] >= 0 ? "+" : "" }}{{ view.roundResult.coinDeltas[p.id] }}</span
          >
          <span class="dim">({{ p.coins }} total)</span>
        </li>
      </ul>
      <p class="dim small">Rounds 2-7 aren't built yet — this is as far as the game goes for now.</p>
    </div>

    <div class="felt">
      <div class="felt-top-row">
        <div class="panel-block">
          <div class="eyebrow felt-eyebrow">Stock &amp; discard</div>
          <div class="piles">
            <div class="pile">
              <div class="deck-stack">
                <span class="deck-shadow s2" />
                <span class="deck-shadow s1" />
                <PlayingCard size="lg" :card="null" :disabled="myAction !== 'draw-choice'" @click="chooseDraw('stock')" />
                <span class="pile-count">{{ view.stockCount }}</span>
              </div>
              <div class="pile-label">Stock</div>
            </div>
            <div class="pile">
              <PlayingCard
                v-if="view.discardTop"
                size="lg"
                :card="view.discardTop"
                :disabled="myAction !== 'draw-choice'"
                @click="chooseDraw('discard')"
              />
              <div v-else class="empty-pile">empty</div>
              <div class="pile-label">Discard</div>
            </div>
          </div>
        </div>

        <div class="panel-block">
          <div class="eyebrow felt-eyebrow">You</div>
          <div class="score-plate">
            <div class="score-row">
              <span class="score-label">Coins</span>
              <span class="score-value">{{ me?.coins ?? 0 }}</span>
            </div>
            <div class="rule" />
            <div class="score-row">
              <span class="score-label">Round</span>
              <span class="score-value small-score">{{ view.roundNumber }}</span>
            </div>
          </div>
        </div>

        <div class="panel-block seats-block">
          <div class="eyebrow felt-eyebrow">Seats · turn</div>
          <div class="seats">
            <div v-for="p in otherPlayers" :key="p.id" class="seat" :class="{ current: p.isCurrent, disconnected: !p.connected }">
              <span class="avatar">{{ p.name.charAt(0).toUpperCase() }}</span>
              <span class="seat-name">{{ p.name }}</span>
              <span class="seat-status">
                <template v-if="p.isCurrent">to play</template>
                <template v-else>🪙{{ p.coins }} · 🂠{{ p.handCount }}</template>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="melds">
        <div
          v-for="meld in view.melds"
          :key="meld.id"
          class="meld"
          :class="{ targetable: myAction === 'meld-discard', targeted: selectedMeldId === meld.id }"
          @click="toggleMeldTarget(meld)"
        >
          <div class="meld-owner">{{ ownerName(meld.ownerId) }}'s {{ meld.type }}</div>
          <div class="meld-cards">
            <PlayingCard v-for="c in meld.cards" :key="c.id" :card="c" disabled />
          </div>
        </div>
        <p v-if="view.melds.length === 0" class="dim felt-dim">No melds on the table yet.</p>
      </div>

      <div class="hand-section">
        <div class="hand-header">
          <span class="eyebrow felt-eyebrow">Your hand — click to select</span>
          <span class="eyebrow felt-eyebrow dim-more">{{ selectedCardIds.size }} selected</span>
        </div>
        <div class="hand-cards">
          <PlayingCard
            v-for="c in view.you.hand"
            :key="c.id"
            :card="c"
            :selected="selectedCardIds.has(c.id)"
            :disabled="myAction !== 'meld-discard'"
            @click="toggleCard(c)"
          />
        </div>
      </div>

      <div class="action-bar">
        <div v-if="myAction === 'draw-choice'" class="prompt buy-prompt">
          <span>Your turn: take the visible discard, or draw blind from the stock.</span>
          <div class="action-buttons">
            <button :disabled="busy || !view.discardTop" @click="chooseDraw('discard')">
              Take discard{{
                view.discardTop ? ` (${view.discardTop.isJoker ? "Joker" : `${view.discardTop.rank}${view.discardTop.suit}`})` : ""
              }}
            </button>
            <button class="secondary" :disabled="busy" @click="chooseDraw('stock')">Draw blind instead</button>
          </div>
        </div>
        <div v-else-if="myAction === 'buy-decision'" class="prompt buy-prompt">
          <span
            >Buy the discard ({{ view.discardTop?.isJoker ? "Joker" : `${view.discardTop?.rank}${view.discardTop?.suit}` }}) for 1
            coin? You'll also draw a random penalty card.</span
          >
          <div class="action-buttons">
            <button @click="decideBuy(true)" :disabled="busy || !me || me.coins < 1">Buy it</button>
            <button class="text-btn" @click="decideBuy(false)" :disabled="busy">Pass</button>
          </div>
        </div>
        <template v-else-if="myAction === 'meld-discard'">
          <p class="prompt">
            {{
              me?.hasOpened
                ? "Lay a set/run, add to any meld, or discard to end your turn."
                : "Lay your opening set of 3 (same rank, different suits) to start, or just discard."
            }}
          </p>
          <div class="action-buttons">
            <button :disabled="busy || selectedCardIds.size < 3 || !!selectedMeldId" @click="layAsNewMeld">
              Lay as new meld ({{ selectedCardIds.size }})
            </button>
            <button v-if="selectedMeldId" class="secondary" :disabled="busy || selectedCardIds.size < 1" @click="addToSelectedMeld">
              Add {{ selectedCardIds.size }} to meld
            </button>
            <button class="text-btn" :disabled="busy || selectedCardIds.size !== 1" @click="discardAndEndTurn">
              Discard &amp; end turn
            </button>
          </div>
        </template>
        <p v-else class="prompt dim felt-dim">{{ waitingLabel }}</p>

        <p v-if="actionError" class="error felt-error">{{ actionError }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.board {
  width: 100%;
  max-width: 980px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.eyebrow {
  font-size: 0.65rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.felt-eyebrow {
  color: rgba(246, 239, 220, 0.6);
}

.dim-more {
  color: rgba(246, 239, 220, 0.4);
}

/* --- round result (sits on the paper page, above the felt) --- */
.round-result {
  background: var(--surface);
  border-radius: 14px;
  padding: 1.25rem 1.5rem;
  box-shadow: 0 3px 14px rgba(60, 50, 30, 0.18), inset 0 0 0 1px rgba(0, 0, 0, 0.06);
}

.round-result h2 {
  font-family: var(--font-display);
  font-weight: 600;
  margin: 0.1rem 0 0.9rem;
  font-size: 1.6rem;
}

.round-result ul {
  list-style: none;
  padding: 0;
  margin: 0 0 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.round-result li {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
}

.delta {
  font-weight: 600;
  color: var(--red);
}

.delta.pos {
  color: var(--accent);
}

.small {
  font-size: 0.8rem;
}

/* --- felt table --- */
.felt {
  border-radius: 16px;
  padding: 1.75rem;
  background: #1f4432;
  background-image: radial-gradient(120% 100% at 50% 0%, rgba(255, 255, 255, 0.07), rgba(0, 0, 0, 0.25));
  box-shadow: inset 0 0 0 1px rgba(246, 239, 220, 0.14), 0 8px 24px rgba(20, 30, 10, 0.35);
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.felt-top-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.75rem;
  align-items: start;
}

.panel-block {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

/* --- piles --- */
.piles {
  display: flex;
  gap: 1.5rem;
  align-items: flex-end;
}

.pile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
}

.pile-label {
  font-size: 0.65rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(246, 239, 220, 0.5);
}

.deck-stack {
  position: relative;
}

.deck-shadow {
  position: absolute;
  inset: 0;
  border-radius: 10px;
  background: #f6efdc;
}

.deck-shadow.s1 {
  transform: translate(3px, 3px);
  opacity: 0.75;
}

.deck-shadow.s2 {
  transform: translate(6px, 6px);
  opacity: 0.5;
}

.pile-count {
  position: absolute;
  right: -10px;
  bottom: -10px;
  min-width: 28px;
  height: 28px;
  border-radius: 14px;
  background: #f6efdc;
  color: #1f4432;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0 7px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
}

.empty-pile {
  width: 100px;
  height: 142px;
  border-radius: 10px;
  border: 1px dashed rgba(246, 239, 220, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(246, 239, 220, 0.5);
}

/* --- score plate --- */
.score-plate {
  background: rgba(10, 25, 18, 0.4);
  border: 1px solid rgba(246, 239, 220, 0.18);
  border-radius: 10px;
  padding: 0.9rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.score-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
}

.score-label {
  font-size: 0.65rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(246, 239, 220, 0.75);
}

.score-value {
  font-family: var(--font-display);
  font-size: 1.8rem;
  line-height: 1;
  color: #f6efdc;
}

.score-value.small-score {
  font-size: 1.3rem;
  color: rgba(246, 239, 220, 0.7);
}

.rule {
  height: 1px;
  background: rgba(246, 239, 220, 0.16);
}

/* --- seats --- */
.seats {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.seat {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.55rem 0.8rem;
  border-radius: 8px;
  background: rgba(10, 25, 18, 0.35);
  border: 1px solid rgba(246, 239, 220, 0.14);
  color: rgba(246, 239, 220, 0.8);
}

.seat.disconnected {
  opacity: 0.5;
}

.seat.current {
  background: rgba(246, 239, 220, 0.94);
  color: #1f4432;
  border-color: transparent;
}

.avatar {
  width: 26px;
  height: 26px;
  min-width: 26px;
  border-radius: 50%;
  background: rgba(246, 239, 220, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 0.7rem;
}

.seat.current .avatar {
  background: #1f4432;
  color: #f6efdc;
}

.seat-name {
  font-size: 0.8rem;
  flex: 1;
}

.seat-status {
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

/* --- melds --- */
.melds {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
  align-content: flex-start;
}

.meld {
  background: rgba(10, 25, 18, 0.35);
  border: 1px solid rgba(246, 239, 220, 0.14);
  border-radius: 10px;
  padding: 0.6rem;
  cursor: pointer;
  transition: border-color 0.15s;
}

.meld.targetable:hover {
  border-color: rgba(246, 239, 220, 0.4);
}

.meld.targeted {
  border-color: #f6efdc;
}

.meld-owner {
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(246, 239, 220, 0.6);
  margin-bottom: 0.4rem;
}

.meld-cards {
  display: flex;
}

.meld-cards > * {
  margin-right: -30px;
}

.meld-cards > *:last-child {
  margin-right: 0;
}

.felt-dim {
  color: rgba(246, 239, 220, 0.45);
  font-size: 0.85rem;
}

/* --- hand --- */
.hand-section {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.hand-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.hand-cards {
  display: flex;
  gap: 0.4rem;
  overflow-x: auto;
  padding: 0.9rem 0.25rem 1.1rem;
  justify-content: center;
}

/* --- action bar --- */
.action-bar {
  border-top: 1px solid rgba(246, 239, 220, 0.14);
  padding-top: 1.1rem;
}

.prompt {
  margin: 0 0 0.7rem;
  color: #f6efdc;
  font-size: 0.9rem;
}

.buy-prompt {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.action-buttons {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  align-items: center;
}

.action-bar button.secondary {
  color: #f6efdc;
  border-color: rgba(246, 239, 220, 0.5);
}

.action-bar button.secondary:hover {
  border-color: #f6efdc;
  background: rgba(246, 239, 220, 0.1);
}

.text-btn {
  background: transparent;
  color: rgba(246, 239, 220, 0.6);
  box-shadow: none;
  padding: 0.7rem 0.9rem;
}

.text-btn:hover {
  color: #f6efdc;
  filter: none;
}

.text-btn:active {
  transform: none;
  box-shadow: none;
}

.felt-error {
  margin-top: 0.6rem;
  color: #ffb4a8;
}

.dim {
  color: var(--text-dim);
}
</style>
