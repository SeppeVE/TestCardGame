<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { socket } from "../socket";
import { getDisplayName, setDisplayName, setPlayerId } from "../identity";

const router = useRouter();

const name = ref(getDisplayName());
const joinCode = ref("");
const error = ref("");
const busy = ref(false);

function createRoom() {
  const playerName = name.value.trim();
  if (!playerName) {
    error.value = "Enter a display name first.";
    return;
  }
  error.value = "";
  busy.value = true;
  setDisplayName(playerName);

  socket.emit("room:create", { playerName }, (res) => {
    busy.value = false;
    if (!res.ok) {
      error.value = res.error;
      return;
    }
    setPlayerId(res.room.code, res.playerId);
    router.push({ name: "room", params: { code: res.room.code } });
  });
}

function joinRoom() {
  const playerName = name.value.trim();
  const code = joinCode.value.trim().toUpperCase();
  if (!playerName) {
    error.value = "Enter a display name first.";
    return;
  }
  if (!code) {
    error.value = "Enter a room code.";
    return;
  }
  error.value = "";
  setDisplayName(playerName);
  router.push({ name: "room", params: { code } });
}
</script>

<template>
  <div class="card">
    <h1>Join or create a game</h1>

    <div class="field">
      <label for="name">Display name</label>
      <input id="name" v-model="name" placeholder="e.g. Seppe" maxlength="24" />
    </div>

    <div class="field">
      <label for="code">Room code</label>
      <input
        id="code"
        v-model="joinCode"
        placeholder="e.g. K7QX"
        maxlength="4"
        style="text-transform: uppercase"
        @keyup.enter="joinRoom"
      />
    </div>

    <div style="display: flex; gap: 0.75rem">
      <button @click="joinRoom" :disabled="busy">Join room</button>
      <button class="secondary" @click="createRoom" :disabled="busy">Create new room</button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>
