// Small localStorage helpers so a page refresh (or opening a shared room
// link a second time) reconnects as the same player instead of a new one.

const DISPLAY_NAME_KEY = "cardtable:displayName";
const playerIdKey = (roomCode: string) => `cardtable:playerId:${roomCode.toUpperCase()}`;

export function getDisplayName(): string {
  return localStorage.getItem(DISPLAY_NAME_KEY) ?? "";
}

export function setDisplayName(name: string): void {
  localStorage.setItem(DISPLAY_NAME_KEY, name);
}

export function getPlayerId(roomCode: string): string | undefined {
  return localStorage.getItem(playerIdKey(roomCode)) ?? undefined;
}

export function setPlayerId(roomCode: string, playerId: string): void {
  localStorage.setItem(playerIdKey(roomCode), playerId);
}
