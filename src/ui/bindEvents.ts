import {
  closeModal,
  initAudio,
  move,
  openSaveSlotPicker,
  renderTab,
  returnHome,
  setActiveTab,
  toggleAudio
} from "../game";
import { hasActiveGame } from "../game/state";
import { byId } from "./dom";

export function bindEvents(): void {
  document.addEventListener("keydown", (event) => {
    initAudio();
    const modal = byId("modal");
    const modalOpen = modal ? !modal.classList.contains("hidden") : false;
    if (modalOpen && event.key === " ") {
      event.preventDefault();
      closeModal();
      return;
    }
    const state = window.__runeDungeon?.getState?.();
    if (!state) return;
    const key = event.key.toLowerCase();
    if (state.currentEnemy && [" ", "enter", "arrowup", "w", "arrowdown", "s", "arrowleft", "a", "arrowright", "d"].includes(key)) {
      event.preventDefault();
      return;
    }
    const movement = {
      arrowup: [0, -1],
      w: [0, -1],
      arrowdown: [0, 1],
      s: [0, 1],
      arrowleft: [-1, 0],
      a: [-1, 0],
      arrowright: [1, 0],
      d: [1, 0]
    }[key] as [number, number] | undefined;
    if (movement) {
      event.preventDefault();
      move(movement[0], movement[1]);
    }
  });

  byId("modal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeModal();
  });

  document.addEventListener("pointerup", (event) => {
    initAudio();
    const target = event.target instanceof Element ? event.target.closest("button") : null;
    if (target instanceof HTMLButtonElement) target.blur();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-move]").forEach((button) => {
    button.addEventListener("click", () => {
      const dir = button.dataset.move;
      if (dir === "up") move(0, -1);
      if (dir === "down") move(0, 1);
      if (dir === "left") move(-1, 0);
      if (dir === "right") move(1, 0);
      button.blur();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!hasActiveGame()) return;
      setActiveTab(button.dataset.tab || "inventory");
      renderTab();
      button.blur();
    });
  });

  byId<HTMLButtonElement>("soundBtn")?.addEventListener("click", (event) => {
    toggleAudio();
    (event.currentTarget as HTMLButtonElement).blur();
  });
  byId<HTMLButtonElement>("saveBtn")?.addEventListener("click", (event) => {
    openSaveSlotPicker();
    (event.currentTarget as HTMLButtonElement).blur();
  });
  byId<HTMLButtonElement>("homeBtn")?.addEventListener("click", (event) => {
    returnHome();
    (event.currentTarget as HTMLButtonElement).blur();
  });
}
