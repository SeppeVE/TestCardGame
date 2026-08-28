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
  color-scheme: dark;
  --bg: #10241c;
  --surface: #16352a;
  --surface-hi: #1d4534;
  --accent: #4ade80;
  --text: #eafff2;
  --text-dim: #9db8ab;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
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

.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.brand {
  color: var(--text);
  text-decoration: none;
  font-weight: 700;
  font-size: 1.1rem;
}

.app-main {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 2rem 1rem;
}

.card {
  background: var(--surface);
  border-radius: 12px;
  padding: 2rem;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
}

input {
  width: 100%;
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: var(--bg);
  color: var(--text);
  font-size: 1rem;
}

button {
  cursor: pointer;
  border: none;
  border-radius: 8px;
  padding: 0.6rem 1rem;
  font-size: 1rem;
  font-weight: 600;
  background: var(--accent);
  color: #06301d;
  transition: filter 0.15s;
}

button:hover {
  filter: brightness(1.08);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

button.secondary {
  background: var(--surface-hi);
  color: var(--text);
}

label {
  display: block;
  font-size: 0.85rem;
  color: var(--text-dim);
  margin-bottom: 0.3rem;
}

.field {
  margin-bottom: 1rem;
}

.error {
  color: #f87171;
  font-size: 0.9rem;
  margin-top: 0.5rem;
}
</style>
