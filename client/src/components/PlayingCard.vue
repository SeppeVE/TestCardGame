<script setup lang="ts">
import { computed } from "vue";
import type { Card } from "../types";

const props = withDefaults(
  defineProps<{
    card?: Card | null; // omit/null for a face-down card
    selected?: boolean;
    disabled?: boolean;
  }>(),
  { card: null, selected: false, disabled: false }
);

defineEmits<{ click: [] }>();

const SUIT_SYMBOL: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

const isRed = computed(() => props.card?.suit === "H" || props.card?.suit === "D");
const suitSymbol = computed(() => (props.card?.suit ? SUIT_SYMBOL[props.card.suit] : ""));
</script>

<template>
  <button
    class="playing-card"
    :class="{ selected, disabled, 'face-down': !card, joker: card?.isJoker, red: isRed }"
    :disabled="disabled"
    type="button"
    @click="$emit('click')"
  >
    <template v-if="card?.isJoker">
      <span class="joker-label">JOKER</span>
    </template>
    <template v-else-if="card">
      <span class="corner top">{{ card.rank }}{{ suitSymbol }}</span>
      <span class="pip">{{ suitSymbol }}</span>
      <span class="corner bottom">{{ card.rank }}{{ suitSymbol }}</span>
    </template>
    <template v-else>
      <span class="back-pattern" />
    </template>
  </button>
</template>

<style scoped>
.playing-card {
  width: 56px;
  height: 78px;
  border-radius: 7px;
  border: 1px solid rgba(0, 0, 0, 0.25);
  background: #fdfdf9;
  color: #1a1a1a;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 4px;
  cursor: pointer;
  font-weight: 700;
  position: relative;
  transition: transform 0.1s, box-shadow 0.1s;
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.playing-card.red {
  color: #c0272d;
}

.playing-card.selected {
  transform: translateY(-10px);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.45);
  border-color: var(--accent);
}

.playing-card.disabled {
  cursor: default;
  opacity: 0.85;
}

.playing-card:not(.disabled):hover {
  transform: translateY(-4px);
}

.corner {
  align-self: flex-start;
  font-size: 0.75rem;
  line-height: 1;
}

.corner.bottom {
  align-self: flex-end;
  transform: rotate(180deg);
}

.pip {
  font-size: 1.3rem;
}

.playing-card.joker {
  background: linear-gradient(160deg, #2a1f4d, #4b2f7a);
  color: #f4d35e;
  justify-content: center;
  align-items: center;
}

.joker-label {
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  writing-mode: vertical-rl;
}

.playing-card.face-down {
  background: repeating-linear-gradient(45deg, #234a37, #234a37 4px, #1a3a2a 4px, #1a3a2a 8px);
  cursor: default;
}

.back-pattern {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 4px;
  border: 2px solid rgba(255, 255, 255, 0.15);
}
</style>
