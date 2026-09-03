<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { socket } from "../socket";
import { getDisplayName, getPlayerId, setDisplayName, setPlayerId } from "../identity";
import type { GameStateView, RoomState } from "../types";
import GameBoard from "../components/GameBoard.vue";

const props = defineProps<{ code: string }>();
const router = useRouter();

const roomCode = props.code.toUpperCase();
const MIN_PLAYERS = 4; // must match MIN_GAME_PLAYERS in server/src/index.ts

type Phase = "need-name" | "joining" | "joined" | "error";
const phase = ref<Phase>("joining");
const nameInput = ref(getDisplayName());
const errorMsg = ref("");
const room = ref<RoomState | null>(null);
const gameView = ref<GameStateView | null>(null);
const myPlayerId = ref<string | undefined>(getPlayerId(roomCode));
const copied = ref(false);
const startError = ref("");
const starting = ref(false);

const shareUrl = computed(() => `${location.origin}/room/${roomCode}`);
const players = computed(() => room.value?.players ?? []);
const isHost = computed(() => !!room.value && room.value.hostId === myPlayerId.value);
const canStart = computed(() => players.value.length >= MIN_PLAYERS);

function join(playerName: string) {
  phase.value = "joining";
  errorMsg.value = "";
  socket.emit(
    "room:join",
    { roomCode, playerName, playerId: getPlayerId(roomCode) },
    (res) => {
      if (!res.ok) {
        phase.value = "error";
        errorMsg.value = res.error;
        return;
      }
      setDisplayName(playerName);
      setPlayerId(roomCode, res.playerId);
      myPlayerId.value = res.playerId;
      room.value = res.room;
      phase.value = "joined";
    }
  );
}

function submitName() {
  const name = nameInput.value.trim();
  if (!name) {
    errorMsg.value = "Enter a display name.";
    return;
  }
  join(name);
}

function onRoomState(state: RoomState) {
  if (state.code === roomCode) room.value = state;
}

function onGameState(state: GameStateView) {
  gameView.value = state;
}

function onReconnect() {
  // The socket got a new id after a network blip / server restart —
  // rejoin under our existing playerId so we reappear as ourselves.
  const existingName = getDisplayName();
  if (phase.value === "joined" && existingName) join(existingName);
}

function leaveRoom() {
  if (myPlayerId.value) {
    socket.emit("room:leave", { roomCode, playerId: myPlayerId.value });
  }
  router.push({ name: "home" });
}

function startGame() {
  if (!myPlayerId.value) return;
  starting.value = true;
  startError.value = "";
  socket.emit("game:start", { roomCode, playerId: myPlayerId.value }, (res) => {
    starting.value = false;
    if (!res.ok) startError.value = res.error;
  });
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    // Clipboard API unavailable — the link is still shown for manual copy.
  }
}

onMounted(() => {
  socket.on("room:state", onRoomState);
  socket.on("game:state", onGameState);
  socket.on("connect", onReconnect);

  const existingName = getDisplayName();
  if (existingName) {
    join(existingName);
  } else {
    phase.value = "need-name";
  }
});

onBeforeUnmount(() => {
  socket.off("room:state", onRoomState);
  socket.off("game:state", onGameState);
  socket.off("connect", onReconnect);
});
</script>

<template>
  <div class="card" v-if="phase === 'need-name'">
    <h1>Join room {{ roomCode }}</h1>
    <div class="field">
      <label for="name">Display name</label>
      <input id="name" v-model="nameInput" placeholder="e.g. Seppe" maxlength="24" @keyup.enter="submitName" />
    </div>
    <button @click="submitName">Join</button>
    <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
  </div>

  <div class="card" v-else-if="phase === 'joining'">
    <p>Joining room {{ roomCode }}…</p>
  </div>

  <div class="card" v-else-if="phase === 'error'">
    <h1>Couldn't join</h1>
    <p class="error">{{ errorMsg }}</p>
    <router-link to="/"><button class="secondary">Back home</button></router-link>
  </div>

  <div class="game-wrap" v-else-if="room?.phase === 'playing' && gameView && myPlayerId">
    <div class="game-topbar">
      <span>Room {{ room.code }}</span>
      <button class="secondary" @click="leaveRoom">Leave room</button>
    </div>
    <GameBoard :view="gameView" :room-code="roomCode" :my-player-id="myPlayerId" />
  </div>

  <div class="card" v-else-if="room">
    <h1>Room {{ room.code }}</h1>

    <div class="field">
      <label>Invite link</label>
      <div style="display: flex; gap: 0.5rem">
        <input :value="shareUrl" readonly />
        <button class="secondary" @click="copyLink">{{ copied ? "Copied!" : "Copy" }}</button>
      </div>
    </div>

    <div class="field">
      <label>Players ({{ players.length }})</label>
      <ul class="player-list">
        <li v-for="p in players" :key="p.id" :class="{ dim: !p.connected }">
          <span class="dot" :class="{ on: p.connected }"></span>
          {{ p.name }}
          <span v-if="p.isHost" class="badge">host</span>
          <span v-if="p.id === myPlayerId" class="badge you">you</span>
        </li>
      </ul>
    </div>

    <template v-if="isHost">
      <button :disabled="!canStart || starting" @click="startGame">Start game (round 1)</button>
      <p v-if="!canStart" class="hint">Need at least {{ MIN_PLAYERS }} players to start.</p>
      <p v-if="startError" class="error">{{ startError }}</p>
    </template>
    <p v-else class="hint">Waiting for the host to start the game.</p>

    <button class="secondary" @click="leaveRoom" style="margin-top: 1rem">Leave room</button>
  </div>
</template>

<style scoped>
.player-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.player-list li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--bg);
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
}

.player-list li.dim {
  opacity: 0.5;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #666;
}

.dot.on {
  background: var(--accent);
}

.badge {
  margin-left: auto;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--surface-hi);
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  color: var(--text-dim);
}

.badge.you {
  margin-left: 0.35rem;
}

.hint {
  color: var(--text-dim);
  font-size: 0.9rem;
}

.game-wrap {
  width: 100%;
  max-width: 960px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.game-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 700;
}
</style>
