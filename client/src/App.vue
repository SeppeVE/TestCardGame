<template>
  <div class="app-shell">
    <header class="app-header">
      <router-link to="/" class="brand">🃏 Card Table</router-link>
    </header>
    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<style>
:root {
  color-scheme: light;
  /* Warm "card catalog" paper theme — see the Card Decks design kit. */
  --bg: #ece7dc;
  --surface: #f6efdc;
  --surface-hi: #f0e3c6;
  --accent: #1f4432;
  --accent-ink: #f6efdc;
  --text: #2a2620;
  --text-dim: #8a8172;
  --rule: #d5cdbc;
  --red: #8f2020;
  --font-display: "Bodoni Moda", Georgia, serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  font-family: var(--font-mono);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
}

h1 {
  font-family: var(--font-display);
  font-weight: 600;
  margin: 0 0 1.25rem;
}

.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--rule);
}

.brand {
  color: var(--text);
  text-decoration: none;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1.25rem;
}

.app-main {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 2rem 1rem;
}

.card {
  background: var(--surface);
  border-radius: 14px;
  padding: 2rem;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 3px 14px rgba(60, 50, 30, 0.18), inset 0 0 0 1px rgba(0, 0, 0, 0.06);
}

input {
  width: 100%;
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--rule);
  background: #fffaee;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 1rem;
}

button {
  cursor: pointer;
  border: none;
  border-radius: 6px;
  padding: 0.7rem 1.3rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  background: var(--accent);
  color: var(--accent-ink);
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.22);
  transition: filter 0.15s, transform 0.1s, box-shadow 0.1s;
}

button:hover {
  filter: brightness(1.08);
}

button:active {
  transform: translateY(2px);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.22);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: none;
}

button.secondary {
  background: transparent;
  color: var(--accent);
  border: 1px solid var(--accent);
  box-shadow: none;
}

button.secondary:active {
  box-shadow: none;
}

label {
  display: block;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 0.4rem;
}

.field {
  margin-bottom: 1rem;
}

.error {
  color: var(--red);
  font-size: 0.9rem;
  margin-top: 0.5rem;
}
</style>
