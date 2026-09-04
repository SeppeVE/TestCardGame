<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { socket } from "../socket";
import type { ActionAck, Card, GameStateView, Meld } from "../types";
import PlayingCard from "./PlayingCard.vue";

const props = defineProps<{
  view: GameStateView;
  roomCode: string;
  myPlayerId: string;
  isHost: boolean;
}>();

const selectedCardIds = ref<Set<string>>(new Set());
const selectedMeldId = ref<string | null>(null);
const actionError = ref("");
const busy = ref(false);

// --- custom hand order: the player can drag cards around, and the order
// sticks (per card id) across re-renders. New cards (drawn/bought) are
// appended in the server's default sorted order; cards that leave the
// hand (melded/discarded) just drop out of the list. ---
const handOrder = ref<string[]>([]);
const draggedCardId = ref<string | null>(null);

watch(
  () => props.view.you.hand.map((c) => c.id),
  (ids) => {
    const idSet = new Set(ids);
    const kept = handOrder.value.filter((id) => idSet.has(id));
    const keptSet = new Set(kept);
    const added = ids.filter((id) => !keptSet.has(id));
    handOrder.value = [...kept, ...added];
  },
  { immediate: true }
);

const orderedHand = computed<Card[]>(() => {
  const byId = new Map(props.view.you.hand.map((c) => [c.id, c]));
  return handOrder.value.map((id) => byId.get(id)).filter((c): c is Card => !!c);
});

function onCardDragStart(cardId: string, event: DragEvent) {
  draggedCardId.value = cardId;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", cardId);
  }
}

function onCardDragOver(cardId: string) {
  const draggedId = draggedCardId.value;
  if (!draggedId || draggedId === cardId) return;
  const order = [...handOrder.value];
  const from = order.indexOf(draggedId);
  const to = order.indexOf(cardId);
  if (from === -1 || to === -1 || from === to) return;
  order.splice(from, 1);
  order.splice(to, 0, draggedId);
  handOrder.value = order;
}

function onCardDragEnd() {
  draggedCardId.value = null;
}

const SUIT_SORT_ORDER: Record<string, number> = { S: 0, H: 1, D: 2, C: 3 };
const RANK_SORT_ORDER: Record<string, number> = Object.fromEntries(
  ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].map((r, i) => [r, i])
);

function sortHand(by: "value" | "suit") {
  const sorted = [...props.view.you.hand].sort((a, b) => {
    if (a.isJoker !== b.isJoker) return a.isJoker ? 1 : -1;
    if (a.isJoker) return 0;
    const rankDiff = RANK_SORT_ORDER[a.rank!] - RANK_SORT_ORDER[b.rank!];
    const suitDiff = SUIT_SORT_ORDER[a.suit!] - SUIT_SORT_ORDER[b.suit!];
    return by === "value" ? rankDiff || suitDiff : suitDiff || rankDiff;
  });
  handOrder.value = sorted.map((c) => c.id);
}

// Cards fan out like a hand of cards held in real life: overlapping, each
// one rotated a little more than its neighbor around a pivot below the
// hand, with cards further from center sitting a touch lower. The spread
// narrows automatically for bigger hands so it never gets absurd.
function fanStyle(index: number, total: number): Record<string, string> {
  if (total <= 1) return { "--fan-z": String(index) };
  const mid = (total - 1) / 2;
  const offset = index - mid;
  const step = Math.min(4, 30 / (total - 1));
  const rotate = offset * step;
  const rise = Math.abs(offset) * step * 0.7;
  return {
    "--fan-z": String(index),
    transform: `rotate(${rotate}deg) translateY(${rise}px)`,
    transformOrigin: "bottom center",
  };
}

// --- final round: lay out the whole hand at once, grouped into sets/runs ---
interface LayoutGroup {
  id: string;
  cardIds: string[];
}
const layoutGroups = ref<LayoutGroup[]>([]);
const activeGroupId = ref<string | null>(null);
let layoutGroupCounter = 0;

// Selection doesn't carry meaning across turns/phases — clear it whenever
// either changes so a stale pick can't be replayed into a new context.
watch(
  () => [props.view.turnPhase, props.view.currentPlayerId],
  () => {
    selectedCardIds.value = new Set();
    selectedMeldId.value = null;
    layoutGroups.value = [];
    activeGroupId.value = null;
  }
);

const me = computed(() => props.view.players.find((p) => p.id === props.myPlayerId));
const isMyTurn = computed(() => props.view.currentPlayerId === props.myPlayerId);
const otherPlayers = computed(() => props.view.players.filter((p) => p.id !== props.myPlayerId));

function ownerName(ownerId: string): string {
  return props.view.players.find((p) => p.id === ownerId)?.name ?? "Unknown";
}

// Everyone eligible answers "take/buy or pass" at once — no need to wait
// your turn in a queue just to see the option.
const myDiscardStatus = computed(() => props.view.discardDecision?.decisions[props.myPlayerId] ?? null);
const isFreeTake = computed(() => props.view.discardDecision?.order[0] === props.myPlayerId);
const stillPendingNames = computed(() => {
  const dd = props.view.discardDecision;
  if (!dd) return [];
  return dd.order.filter((id) => dd.decisions[id] === "pending" && id !== props.myPlayerId).map(ownerName);
});

const myAction = computed<"discard-decision" | "meld-discard" | "waiting">(() => {
  if (props.view.roundResult) return "waiting";
  if (props.view.turnPhase === "discard-decision" && myDiscardStatus.value === "pending") return "discard-decision";
  if (props.view.turnPhase === "meld-discard" && isMyTurn.value) return "meld-discard";
  return "waiting";
});

function cardLabel(card: Card | null): string {
  if (!card) return "";
  return card.isJoker ? "Joker" : `${card.rank}${card.suit}`;
}

const waitingLabel = computed(() => {
  const v = props.view;
  if (v.roundResult) return "";
  if (v.turnPhase === "discard-decision") {
    const dd = v.discardDecision;
    const pending = dd?.order.filter((id) => dd.decisions[id] === "pending").map(ownerName) ?? [];
    return pending.length ? `Waiting on ${pending.join(", ")} to decide on the discard…` : "Resolving the discard…";
  }
  const currentName = v.players.find((p) => p.id === v.currentPlayerId)?.name ?? "someone";
  return `Waiting for ${currentName}…`;
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

// The final round: nothing can be laid until the whole hand goes down at
// once, grouped into sets/runs of 3+, with exactly one card left to
// discard. Cards not yet assigned to a group behave like the normal
// discard-only selection (toggleCard/selectedCardIds) whenever no group
// is currently active.
const isLayingOut = computed(() => myAction.value === "meld-discard" && props.view.isLayOutRound && !me.value?.hasOpened);
const layoutAssignedIds = computed(() => new Set(layoutGroups.value.flatMap((g) => g.cardIds)));
const layoutUnassignedHand = computed(() => props.view.you.hand.filter((c) => !layoutAssignedIds.value.has(c.id)));
const layoutNeeded = computed(() => props.view.you.hand.length - 1);
const canSubmitLayout = computed(
  () =>
    layoutGroups.value.length > 0 &&
    layoutGroups.value.every((g) => g.cardIds.length >= 3) &&
    layoutAssignedIds.value.size === layoutNeeded.value
);

function cardById(id: string): Card | undefined {
  return props.view.you.hand.find((c) => c.id === id);
}

function startLayoutGroup() {
  const id = `g${++layoutGroupCounter}`;
  layoutGroups.value = [...layoutGroups.value, { id, cardIds: [] }];
  activeGroupId.value = id;
  selectedCardIds.value = new Set();
}

function finishLayoutGroup() {
  activeGroupId.value = null;
}

function removeLayoutGroup(groupId: string) {
  layoutGroups.value = layoutGroups.value.filter((g) => g.id !== groupId);
  if (activeGroupId.value === groupId) activeGroupId.value = null;
}

function layoutCardClick(card: Card) {
  if (activeGroupId.value) {
    const groupId = activeGroupId.value;
    layoutGroups.value = layoutGroups.value.map((g) =>
      g.id === groupId ? { ...g, cardIds: [...g.cardIds, card.id] } : g
    );
    return;
  }
  toggleCard(card);
}

function removeCardFromGroup(groupId: string, cardId: string) {
  layoutGroups.value = layoutGroups.value.map((g) =>
    g.id === groupId ? { ...g, cardIds: g.cardIds.filter((id) => id !== cardId) } : g
  );
}

function submitLayout() {
  if (!canSubmitLayout.value) return;
  runAction((ack) =>
    socket.emit(
      "game:layOutHand",
      { roomCode: props.roomCode, playerId: props.myPlayerId, groups: layoutGroups.value.map((g) => g.cardIds) },
      ack
    )
  );
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
    layoutGroups.value = [];
    activeGroupId.value = null;
  });
}

function submitDecision(wantsToTake: boolean) {
  runAction((ack) =>
    socket.emit("game:discardDecision", { roomCode: props.roomCode, playerId: props.myPlayerId, wantsToTake }, ack)
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

function startNextRound() {
  runAction((ack) => socket.emit("game:nextRound", { roomCode: props.roomCode, playerId: props.myPlayerId }, ack));
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
          <span class="dim">({{ p.coins }} coins)</span>
          <span class="dim">· scored {{ view.roundResult.handScores[p.id] }} pt this round ({{ p.points }} total)</span>
        </li>
      </ul>

      <div v-if="view.roundResult.finalPayout" class="final-payout">
        <div class="eyebrow">Final round bonus</div>
        <p>
          The buy-pot of {{ view.roundResult.finalPayout.potTotal }} coins — every coin ever spent buying a discard this
          game — is split between {{ view.roundResult.finalPayout.recipients.map(ownerName).join(", ") }} ({{
            view.roundResult.finalPayout.share
          }}
          coins each<template v-if="view.roundResult.finalPayout.remainderToWinner"
            >, plus {{ view.roundResult.finalPayout.remainderToWinner }} extra to
            {{ ownerName(view.roundResult.winnerId) }} for the odd remainder</template
          >).
        </p>
      </div>

      <template v-if="view.hasNextRound">
        <button v-if="isHost" :disabled="busy" @click="startNextRound">Start round {{ view.roundNumber + 1 }}</button>
        <p v-else class="dim small">Waiting for the host to start round {{ view.roundNumber + 1 }}.</p>
      </template>
      <p v-else class="dim small">🏆 That was the final round — game over!</p>
      <p v-if="actionError" class="error" style="margin-top: 0.75rem">{{ actionError }}</p>
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
                <PlayingCard
                  size="lg"
                  :card="null"
                  :disabled="!(myAction === 'discard-decision' && isFreeTake)"
                  @click="submitDecision(false)"
                />
                <span class="pile-count">{{ view.stockCount }}</span>
              </div>
              <div class="pile-label">Stock</div>
            </div>
            <div class="pile">
              <PlayingCard
                v-if="view.discardTop"
                size="lg"
                :card="view.discardTop"
                :disabled="!(myAction === 'discard-decision' && isFreeTake)"
                @click="submitDecision(true)"
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
              <span class="score-label">Points</span>
              <span class="score-value small-score">{{ me?.points ?? 0 }}</span>
            </div>
            <div class="rule" />
            <div class="score-row">
              <span class="score-label">Round</span>
              <span class="score-value small-score">{{ view.roundNumber }}</span>
            </div>
            <div class="rule" />
            <div class="score-row">
              <span class="score-label">Buy pot</span>
              <span class="score-value small-score">{{ view.buyPot }}</span>
            </div>
            <p class="contract-note">To open: {{ view.contractDescription }}.</p>
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
                <template v-else>🪙{{ p.coins }} · {{ p.points }}pt · 🂠{{ p.handCount }}</template>
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
        <template v-if="isLayingOut">
          <div class="hand-header">
            <span class="eyebrow felt-eyebrow">Final round — group your whole hand into sets/runs</span>
            <span class="eyebrow felt-eyebrow dim-more">{{ layoutAssignedIds.size }} / {{ layoutNeeded }} assigned</span>
          </div>

          <div class="layout-groups" v-if="layoutGroups.length">
            <div
              v-for="g in layoutGroups"
              :key="g.id"
              class="layout-group"
              :class="{ active: activeGroupId === g.id, invalid: g.cardIds.length > 0 && g.cardIds.length < 3 }"
            >
              <div class="layout-group-header">
                <span>Group ({{ g.cardIds.length }})</span>
                <div class="action-buttons">
                  <button v-if="activeGroupId === g.id" class="text-btn small" @click="finishLayoutGroup">Done</button>
                  <button v-else class="text-btn small" @click="activeGroupId = g.id">Edit</button>
                  <button class="text-btn small" @click="removeLayoutGroup(g.id)">Remove</button>
                </div>
              </div>
              <div class="layout-group-cards">
                <PlayingCard v-for="id in g.cardIds" :key="id" :card="cardById(id)" @click="removeCardFromGroup(g.id, id)" />
              </div>
            </div>
          </div>

          <div class="hand-cards">
            <div v-for="(c, i) in layoutUnassignedHand" :key="c.id" class="hand-card-slot" :style="fanStyle(i, layoutUnassignedHand.length)">
              <PlayingCard :card="c" :selected="!activeGroupId && selectedCardIds.has(c.id)" @click="layoutCardClick(c)" />
            </div>
          </div>
        </template>
        <template v-else>
          <div class="hand-header">
            <span class="eyebrow felt-eyebrow">Your hand — click to select, drag to reorder</span>
            <div class="hand-header-right">
              <div class="sort-buttons">
                <button type="button" class="text-btn small" :disabled="orderedHand.length < 2" @click="sortHand('value')">
                  Sort by value
                </button>
                <button type="button" class="text-btn small" :disabled="orderedHand.length < 2" @click="sortHand('suit')">
                  Sort by suit
                </button>
              </div>
              <span class="eyebrow felt-eyebrow dim-more">{{ selectedCardIds.size }} selected</span>
            </div>
          </div>
          <div class="hand-cards">
            <div
              v-for="(c, i) in orderedHand"
              :key="c.id"
              class="hand-card-slot"
              :class="{ dragging: draggedCardId === c.id }"
              :style="fanStyle(i, orderedHand.length)"
              draggable="true"
              @dragstart="onCardDragStart(c.id, $event)"
              @dragover.prevent="onCardDragOver(c.id)"
              @drop.prevent
              @dragend="onCardDragEnd"
            >
              <PlayingCard
                :card="c"
                :selected="selectedCardIds.has(c.id)"
                :disabled="myAction !== 'meld-discard'"
                @click="toggleCard(c)"
              />
            </div>
          </div>
        </template>
      </div>

      <div class="action-bar">
        <div v-if="myAction === 'discard-decision'" class="prompt buy-prompt">
          <span v-if="isFreeTake">Take the discard ({{ cardLabel(view.discardTop) }}), or pass and draw blind from the stock?</span>
          <span v-else>Buy the discard ({{ cardLabel(view.discardTop) }}) for 1 coin? You'll also draw a random penalty card.</span>
          <div class="action-buttons">
            <button v-if="isFreeTake" :disabled="busy || !view.discardTop" @click="submitDecision(true)">
              Take discard ({{ cardLabel(view.discardTop) }})
            </button>
            <button v-else :disabled="busy || !me || me.coins < 1" @click="submitDecision(true)">Buy it</button>
            <button class="text-btn" :disabled="busy" @click="submitDecision(false)">Pass</button>
          </div>
          <p v-if="stillPendingNames.length" class="felt-dim small-note">Also deciding: {{ stillPendingNames.join(", ") }}</p>
        </div>
        <div v-else-if="isLayingOut" class="prompt layout-prompt">
          <p class="prompt">
            Assign {{ layoutNeeded }} of your {{ view.you.hand.length }} cards into groups of 3+ (sets or runs), leaving exactly
            one to discard — or just discard without laying out at all.
          </p>
          <div class="action-buttons">
            <button class="secondary" :disabled="busy || !!activeGroupId" @click="startLayoutGroup">+ New group</button>
            <button v-if="activeGroupId" class="secondary" :disabled="busy" @click="finishLayoutGroup">Done with this group</button>
            <button :disabled="busy || !canSubmitLayout" @click="submitLayout">Lay out hand</button>
            <button class="text-btn" :disabled="busy || !!activeGroupId || selectedCardIds.size !== 1" @click="discardAndEndTurn">
              Discard without laying out
            </button>
          </div>
        </div>
        <template v-else-if="myAction === 'meld-discard'">
          <p class="prompt">
            {{
              me?.hasOpened
                ? "Lay a set/run, add to any meld, or discard to end your turn."
                : `To start this round, ${view.contractDescription}, or just discard.`
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

.final-payout {
  background: var(--surface-hi);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  margin-bottom: 0.75rem;
}

.final-payout p {
  margin: 0.3rem 0 0;
  font-size: 0.85rem;
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

.contract-note {
  margin: 0;
  font-size: 0.7rem;
  line-height: 1.4;
  color: rgba(246, 239, 220, 0.6);
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

.small-note {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
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
  flex-wrap: wrap;
  gap: 0.5rem;
}

.hand-header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.sort-buttons {
  display: flex;
  gap: 0.4rem;
}

.hand-cards {
  display: flex;
  overflow-x: auto;
  overflow-y: visible;
  padding: 1.5rem 1rem 1.2rem;
  justify-content: center;
}

/* Overlap every card after the first — the fan look, and the "take up
   less space" ask. Applies whether the child is a draggable wrapper div
   (main hand) or a PlayingCard directly (final-round layout hand). */
.hand-cards > * + * {
  margin-left: -34px;
}

.hand-cards > * {
  position: relative;
  z-index: var(--fan-z, 0);
}

.hand-card-slot {
  display: inline-flex;
  cursor: grab;
}

.hand-card-slot.dragging {
  opacity: 0.4;
  z-index: 999;
}

.hand-card-slot:active {
  cursor: grabbing;
}

/* --- final-round lay-out groups --- */
.layout-groups {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.layout-group {
  background: rgba(10, 25, 18, 0.35);
  border: 1px solid rgba(246, 239, 220, 0.18);
  border-radius: 8px;
  padding: 0.5rem 0.7rem;
}

.layout-group.active {
  border-color: #f6efdc;
}

.layout-group.invalid {
  border-color: rgba(255, 180, 168, 0.6);
}

.layout-group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: rgba(246, 239, 220, 0.7);
  margin-bottom: 0.4rem;
}

.layout-group-cards {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}

.text-btn.small {
  padding: 0.3rem 0.5rem;
  font-size: 0.65rem;
}

.layout-prompt {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
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
