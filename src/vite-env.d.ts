/// <reference types="vite/client" />

import type { GameState, ModalAction } from "./game/types";

declare global {
  interface Window {
    __runeDungeon?: {
      getState: () => GameState | null;
      setState?: (state: GameState | null) => void;
    };
    _modalActions?: ModalAction[];
    _teleportTargets?: unknown[];
    _toastTimer?: number;
    webkitAudioContext?: typeof AudioContext;
    [key: string]: unknown;
  }
}

export {};
