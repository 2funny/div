import {
  closeModal,
  initAudio,
  modalAction,
  move,
  openSaveSlotPicker,
  renderTab,
  returnHome,
  setActiveTab,
  toggleAudio
} from "../game";
import { hasActiveGame } from "../game/state";
import { byId } from "./dom";

const ADMIN_CODE = String.fromCharCode(114, 117, 110, 101, 97, 100, 109, 105, 110);
let adminCodeBuffer = "";
let adminButtonUnlocked = false;

export function bindEvents(): void {
  document.addEventListener("keydown", (event) => {
    initAudio();
    if (trackAdminCode(event)) return;
    const modal = byId("modal");
    const modalOpen = modal ? !modal.classList.contains("hidden") : false;
    if (modalOpen && event.key === " ") {
      event.preventDefault();
      const actions = (
        window as typeof window & { _modalActions?: Array<{ text?: string }> }
      )._modalActions;
      const continueActionIndex = Array.isArray(actions)
        ? actions.findIndex((action) => action.text === "继续")
        : -1;
      const questPromptActionIndex = Array.isArray(actions)
        ? actions.findIndex(
            (action) =>
              typeof action.text === "string" &&
              (action.text.includes("查看委托") || action.text.includes("查看报酬"))
          )
        : -1;
      const actionIndex = continueActionIndex >= 0 ? continueActionIndex : questPromptActionIndex;
      if (actionIndex >= 0) modalAction(actionIndex);
      else closeModal();
      return;
    }
    const state = window.__runeDungeon?.getState?.();
    if (!state) return;
    const key = event.key.toLowerCase();
    const activeEnemy = state.currentEnemy && Number(state.currentEnemy.hp) > 0;
    if (
      activeEnemy &&
      [
        " ",
        "enter",
        "arrowup",
        "w",
        "arrowdown",
        "s",
        "arrowleft",
        "a",
        "arrowright",
        "d"
      ].includes(key)
    ) {
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

function trackAdminCode(event: KeyboardEvent): boolean {
  if (!import.meta.env.DEV) return false;
  const target = event.target;
  const editable =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable);
  if (editable || event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1)
    return false;
  adminCodeBuffer = `${adminCodeBuffer}${event.key.toLowerCase()}`.slice(-ADMIN_CODE.length);
  if (adminCodeBuffer !== ADMIN_CODE) return false;
  adminCodeBuffer = "";
  event.preventDefault();
  unlockAdminButton();
  return true;
}

function unlockAdminButton(): void {
  if (adminButtonUnlocked || document.getElementById("adminFloatingButton")) return;
  adminButtonUnlocked = true;
  const button = document.createElement("button");
  button.id = "adminFloatingButton";
  button.className = "admin-floating-button";
  button.type = "button";
  button.textContent = "调试";
  button.addEventListener("click", () => {
    (window as typeof window & { openAdminPanel?: () => void }).openAdminPanel?.();
    button.blur();
  });
  document.body.appendChild(button);
}
