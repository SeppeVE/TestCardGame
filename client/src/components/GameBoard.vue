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
      <h2>🎉 {{ ownerName(view.roundResult.winnerId) }} wins round {{ view.roundNumber }}!</h2>
      <ul>
        <li v-for="p in view.players" :key="p.id">
          {{ p.name }}: {{ view.roundResult.coinDeltas[p.id] >= 0 ? "+" : "" }}{{ view.roundResult.coinDeltas[p.id] }} coins
          <span class="dim">({{ p.coins }} total)</span>
        </li>
      </ul>
      <p class="dim">Rounds 2-7 aren't built yet — this is as far as the game goes for now.</p>
    </div>

    <div class="opponents">
      <div v-for="p in otherPlayers" :key="p.id" class="opponent" :class="{ current: p.isCurrent, disconnected: !p.connected }">
        <div class="opponent-name">
          {{ p.name }}
          <span v-if="p.isDealer" class="tag">dealer</span>
          <span v-if="p.isCurrent" class="tag current-tag">turn</span>
        </div>
        <div class="opponent-meta">🪙 {{ p.coins }} · 🂠 {{ p.handCount }} <span v-if="p.hasOpened">· opened</span></div>
      </div>
    </div>

    <div class="table-area">
      <div class="piles">
        <div class="pile">
          <PlayingCard :card="null" :disabled="myAction !== 'draw-choice'" @click="chooseDraw('stock')" />
          <div class="pile-label">Stock ({{ view.stockCount }})</div>
        </div>
        <div class="pile">
          <PlayingCard
            v-if="view.discardTop"
            :card="view.discardTop"
            :disabled="myAction !== 'draw-choice'"
            @click="chooseDraw('discard')"
          />
          <div v-else class="pile empty-pile">empty</div>
          <div class="pile-label">Discard</div>
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
        <p v-if="view.melds.length === 0" class="dim">No melds on the table yet.</p>
      </div>
    </div>

    <div class="action-bar">
      <p v-if="myAction === 'draw-choice'" class="prompt">Your turn: take the visible discard, or draw blind from the stock.</p>
      <div v-else-if="myAction === 'buy-decision'" class="prompt buy-prompt">
        <span>Buy the discard ({{ view.discardTop?.isJoker ? "Joker" : `${view.discardTop?.rank}${view.discardTop?.suit}` }}) for 1 coin? You'll also draw a random penalty card.</span>
        <div class="buy-buttons">
          <button @click="decideBuy(true)" :disabled="busy || !me || me.coins < 1">Buy it</button>
          <button class="secondary" @click="decideBuy(false)" :disabled="busy">Pass</button>
        </div>
      </div>
      <template v-else-if="myAction === 'meld-discard'">
        <p class="prompt">
          {{ me?.hasOpened ? "Lay a set/run, add to any meld, or discard to end your turn." : "Lay your opening set of 3 (same rank, different suits) to start, or just discard." }}
        </p>
        <div class="meld-actions">
          <button :disabled="busy || selectedCardIds.size < 3 || !!selectedMeldId" @click="layAsNewMeld">
            Lay selected as new meld ({{ selectedCardIds.size }})
          </button>
          <button v-if="selectedMeldId" :disabled="busy || selectedCardIds.size < 1" @click="addToSelectedMeld">
            Add {{ selectedCardIds.size }} card(s) to selected meld
          </button>
          <button class="secondary" :disabled="busy || selectedCardIds.size !== 1" @click="discardAndEndTurn">
            Discard selected card &amp; end turn
          </button>
        </div>
      </template>
      <p v-else class="prompt dim">{{ waitingLabel }}</p>

      <p v-if="actionError" class="error">{{ actionError }}</p>
    </div>

    <div class="hand">
      <div class="hand-label">Your hand ({{ view.you.hand.length }}) · 🪙 {{ me?.coins ?? 0 }}</div>
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
  </div>
</template>

<style scoped>
.board {
  width: 100%;
  max-width: 960px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.round-result {
  background: var(--surface-hi);
  border-radius: 10px;
  padding: 1rem 1.25rem;
}

.round-result ul {
  padding-left: 1.2rem;
}

.opponents {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.opponent {
  background: var(--surface);
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  min-width: 140px;
  border: 1px solid transparent;
}

.opponent.current {
  border-color: var(--accent);
}

.opponent.disconnected {
  opacity: 0.5;
}

.opponent-name {
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.tag {
  font-size: 0.65rem;
  text-transform: uppercase;
  background: var(--surface-hi);
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  color: var(--text-dim);
}

.tag.current-tag {
  background: var(--accent);
  color: #06301d;
}

.opponent-meta {
  font-size: 0.8rem;
  color: var(--text-dim);
  margin-top: 0.2rem;
}

.table-area {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
  background: #0c1c15;
  border-radius: 12px;
  padding: 1rem;
  min-height: 160px;
}

.piles {
  display: flex;
  gap: 1rem;
}

.pile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
}

.pile-label {
  font-size: 0.75rem;
  color: var(--text-dim);
}

.empty-pile {
  width: 56px;
  height: 78px;
  border: 1px dashed rgba(255, 255, 255, 0.2);
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  color: var(--text-dim);
}

.melds {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-content: flex-start;
}

.meld {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  padding: 0.5rem;
  border: 2px solid transparent;
  cursor: pointer;
}

.meld.targetable:hover {
  border-color: rgba(74, 222, 128, 0.4);
}

.meld.targeted {
  border-color: var(--accent);
}

.meld-owner {
  font-size: 0.7rem;
  color: var(--text-dim);
  margin-bottom: 0.3rem;
  text-transform: capitalize;
}

.meld-cards {
  display: flex;
  gap: -8px;
}

.meld-cards > * {
  margin-right: -22px;
}

.meld-cards > *:last-child {
  margin-right: 0;
}

.action-bar {
  background: var(--surface);
  border-radius: 10px;
  padding: 0.75rem 1rem;
  min-height: 3rem;
}

.prompt {
  margin: 0 0 0.5rem;
}

.buy-prompt {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.buy-buttons,
.meld-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.hand {
  position: sticky;
  bottom: 0;
}

.hand-label {
  font-size: 0.8rem;
  color: var(--text-dim);
  margin-bottom: 0.4rem;
}

.hand-cards {
  display: flex;
  gap: 0.4rem;
  overflow-x: auto;
  padding: 0.5rem 0 1rem;
}

.dim {
  color: var(--text-dim);
}
</style>
