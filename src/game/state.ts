import type { GameState } from "./types";
import * as runtime from "./runtime";

export function getGameState(): GameState | null {
  return runtime.getState() as GameState | null;
}

export function hasActiveGame(): boolean {
  return getGameState() !== null;
}

export function setActivePanelTab(tab: string): void {
  runtime.setActiveTab(tab);
}
