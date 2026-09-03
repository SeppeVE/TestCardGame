<script setup lang="ts">
import { computed } from "vue";
import type { Card } from "../types";

const props = withDefaults(
  defineProps<{
    card?: Card | null; // omit/null for a face-down card
    selected?: boolean;
    disabled?: boolean;
    size?: "sm" | "lg";
  }>(),
  { card: null, selected: false, disabled: false, size: "sm" }
);

defineEmits<{ click: [] }>();

const SUIT_SYMBOL: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

const isRed = computed(() => props.card?.suit === "H" || props.card?.suit === "D");
const suitSymbol = computed(() => (props.card?.suit ? SUIT_SYMBOL[props.card.suit] : ""));
</script>

<template>
  <button
    class="playing-card"
    :class="[size, { selected, disabled, 'face-down': !card, joker: card?.isJoker, red: isRed }]"
    type="button"
    @click="!disabled && $emit('click')"
  >
    <template v-if="card?.isJoker">
      <span class="corner top joker-corner">JOKER</span>
      <span class="joker-glyph">✦</span>
      <span class="corner bottom joker-corner">JOKER</span>
    </template>
    <template v-else-if="card">
      <span class="corner top"
        ><span class="rank">{{ card.rank }}</span><span class="suit-sm">{{ suitSymbol }}</span></span
      >
      <span class="pip">{{ suitSymbol }}</span>
      <span class="corner bottom"
        ><span class="rank">{{ card.rank }}</span><span class="suit-sm">{{ suitSymbol }}</span></span
      >
    </template>
    <template v-else>
      <span class="card-back">
        <span class="lattice" />
        <span class="frame frame-outer" />
        <span class="frame frame-inner" />
        <span class="back-ornament">
          <span class="orn-v" />
          <span class="orn-h" />
          <span class="orn-dot" />
        </span>
        <span class="vignette" />
      </span>
    </template>
  </button>
</template>

<style scoped>
.playing-card {
  appearance: none;
  -webkit-appearance: none;
  border-radius: 10px;
  border: none;
  background: #f6efdc;
  color: #1d1b18;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  cursor: pointer;
  font-family: var(--font-display);
  position: relative;
  transition: transform 0.1s, box-shadow 0.1s;
  flex-shrink: 0;
  box-shadow: 0 3px 10px rgba(60, 50, 30, 0.28), inset 0 0 0 1px rgba(0, 0, 0, 0.07), inset 0 0 14px rgba(120, 95, 50, 0.14);
}

.playing-card.sm {
  width: 62px;
  height: 88px;
}

.playing-card.lg {
  width: 100px;
  height: 142px;
  padding: 11px;
}

.playing-card.red {
  color: #8f2020;
}

.playing-card.selected {
  transform: translateY(-12px);
  box-shadow: 0 8px 16px rgba(30, 20, 5, 0.4), inset 0 0 0 2px #1f4432;
}

.playing-card.disabled {
  cursor: default;
}

.playing-card:not(.disabled):not(.face-down):hover {
  transform: translateY(-5px);
}

.corner {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
  align-self: flex-start;
}

.corner.bottom {
  align-self: flex-end;
  transform: rotate(180deg);
}

.rank {
  font-size: 0.85rem;
  font-weight: 600;
}

.sm .rank {
  font-size: 0.7rem;
}

.suit-sm {
  font-size: 0.6rem;
}

.sm .suit-sm {
  font-size: 0.52rem;
}

.pip {
  font-size: 1.9rem;
  line-height: 1;
}

.sm .pip {
  font-size: 1.3rem;
}

/* --- joker --- */
.joker-corner {
  font-family: var(--font-mono);
  font-size: 0.45rem;
  letter-spacing: 0.08em;
  color: #a9752b;
}

.joker-glyph {
  font-size: 1.9rem;
  color: #a9752b;
}

.sm .joker-glyph {
  font-size: 1.3rem;
}

/* --- back --- */
.playing-card.face-down {
  cursor: default;
  padding: 5px;
  background: #f6efdc;
}

.card-back {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 5px;
  background: #2c5c42;
  overflow: hidden;
}

.lattice {
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(45deg, rgba(246, 239, 220, 0) 0 4px, rgba(246, 239, 220, 0.5) 4px 5px),
    repeating-linear-gradient(-45deg, rgba(246, 239, 220, 0) 0 4px, rgba(246, 239, 220, 0.5) 4px 5px);
}

.frame {
  position: absolute;
  border: 1px solid rgba(246, 239, 220, 0.85);
}

.frame-outer {
  inset: 4px;
}

.frame-inner {
  inset: 7px;
  border-width: 2px;
}

.back-ornament {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 30%;
  height: 62%;
  transform: translate(-50%, -50%);
}

.orn-v {
  position: absolute;
  left: 50%;
  top: 0;
  transform: translateX(-50%);
  width: 55%;
  height: 100%;
  border: 1.5px solid rgba(246, 239, 220, 0.9);
  border-radius: 40%;
  background: #2c5c42;
}

.orn-h {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 100%;
  height: 24%;
  border: 1.5px solid rgba(246, 239, 220, 0.9);
  border-radius: 30%;
  background: #2c5c42;
}

.orn-dot {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 26%;
  height: 12%;
  border: 1.5px solid rgba(246, 239, 220, 0.9);
  border-radius: 50%;
}

.vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(120% 90% at 50% 45%, rgba(0, 0, 0, 0) 40%, rgba(30, 20, 5, 0.3) 100%);
}
</style>
