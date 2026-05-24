import { CLASSES, SAVE_KEY } from "../constants";
import {
  SAVE_SLOT_LIMIT,
  formatSaveTime,
  readSaveIndex,
  saveSlotKey,
  saveSlotLabel,
  writeSaveIndex
} from "./save";
import { escapeHtml } from "../render/html";
import { endingTitle } from "../quest/narrative";
import type { GameState } from "../types";

const MAX_SAVED_FLOOR_STATES = 12;
type SaveSlotMeta = {
  classId?: string;
  className?: string;
  floor?: number;
  level?: number;
  hp?: number;
  maxHp?: number;
  gold?: number;
  endingId?: string;
  endingTitle?: string;
  updatedAt?: string;
};

// 存档运行时封装多槽 localStorage 读写和存档元信息维护。
export function createSaveRuntime(ctx) {
  const { api, slots } = ctx;
  let state = ctx.getState();
  const syncState = () => {
    state = ctx.getState();
    return state;
  };
  const setRuntimeState = (nextState) => {
    ctx.setState(nextState);
    state = nextState;
  };

  const closeModal = (...args) => api.closeModal(...args);
  const render = (...args) => api.render(...args);
  const renderLog = (...args) => api.renderLog(...args);
  const renderStartScreen = (...args) => api.renderStartScreen(...args);
  const repairDoorAccessBlockers = (...args) => api.repairDoorAccessBlockers?.(...args);
  const showConfirm = (...args) => api.showConfirm(...args);
  const showModal = (...args) => api.showModal(...args);
  const showToast = (...args) => api.showToast(...args);
  const updateVisibility = (...args) => api.updateVisibility(...args);

  // 读取所有存档槽及摘要信息，渲染层只消费这个稳定列表。
  function saveSlots() {
    const index = readSaveIndex();
    return Array.from({ length: SAVE_SLOT_LIMIT }, (_, i) => {
      const id = `slot-${i + 1}`;
      return { id, label: saveSlotLabel(id), meta: index[id] || null };
    });
  }

  function saveMetaFromState(snapshot: Partial<GameState> = {}): SaveSlotMeta {
    const cls = CLASSES[snapshot?.classId || ""] || CLASSES.warrior;
    return {
      classId: snapshot?.classId || "",
      className: cls.name || "冒险者",
      floor: snapshot?.floor || 1,
      level: snapshot?.level || 1,
      hp: Math.max(0, Math.ceil(snapshot?.hp || 0)),
      maxHp: Math.max(0, Math.ceil(snapshot?.maxHp || cls.hp || 0)),
      gold: snapshot?.gold || 0,
      endingId: snapshot?.narrative?.endingId || "",
      endingTitle: endingTitle(snapshot?.narrative?.endingId || ""),
      updatedAt: new Date().toISOString()
    };
  }

  function updateSaveSlotMeta(slotId, snapshot) {
    const index = readSaveIndex();
    index[slotId] = saveMetaFromState(snapshot);
    writeSaveIndex(index);
  }

  function deleteSaveSlot(slotId) {
    localStorage.removeItem(saveSlotKey(slotId));
    const index = readSaveIndex();
    delete index[slotId];
    writeSaveIndex(index);
    if (slots.current === slotId) {
      slots.current = saveSlots().find((slot) => slot.meta)?.id || "slot-1";
      slots.pending = slots.current;
      localStorage.setItem(`${SAVE_KEY}-current`, slots.current);
    }
  }

  function log(text) {
    state.log.unshift(text);
    state.log = state.log.slice(0, 80);
  }

  function openSaveSlotPicker() {
    if (!state) return;
    const body = `
      <div class="save-slot-grid modal-save-grid">
        ${saveSlots().map(savePickerSlotCard).join("")}
      </div>
    `;
    showModal("保存到存档", body, [{ text: "取消", action: closeModal }]);
  }

  function savePickerSlotCard(slot) {
    const meta = slot.meta;
    const active = slot.id === slots.current;
    return `
      <article class="save-slot ${active ? "active" : ""} ${meta ? "" : "empty"}">
        <div class="save-slot-main">
          <span>${slot.label}${active ? " · 当前" : ""}</span>
          ${
            meta
              ? `<b>${meta.className || "冒险者"} Lv.${meta.level || 1}</b><small>第 ${meta.floor || 1} 层 · ${formatSaveTime(meta.updatedAt)}</small>`
              : `<b>空存档</b><small>保存当前冒险到这里。</small>`
          }
        </div>
        <button type="button" onclick="saveGameToSlot('${slot.id}')">保存</button>
      </article>
    `;
  }

  function saveGameToSlot(slotId) {
    if (!state) return;
    const slot = saveSlots().find((entry) => entry.id === slotId);
    const meta = slot?.meta as SaveSlotMeta | undefined;
    const targetText = slot?.meta
      ? `<p>${slot.label} 已有 ${meta?.className || "冒险者"} Lv.${meta?.level || 1}。</p><p>确定把当前冒险保存到这里吗？</p>`
      : `<p>确定把当前冒险保存到 ${saveSlotLabel(slotId)} 吗？</p>`;
    showConfirm("确认保存", targetText, "确定", () => saveGame(true, slotId));
  }

  // 将完整游戏状态保存到 localStorage。
  function saveGame(show = true, slotId = slots.current || "slot-1") {
    if (!state) return;
    slots.current = slotId;
    slots.pending = slotId;
    if (show) log(`${saveSlotLabel(slotId)}已保存。`);
    compactFloorStates(state, MAX_SAVED_FLOOR_STATES);
    const snapshot = cloneSaveSnapshot(state);
    let payload = JSON.stringify(snapshot);
    try {
      localStorage.setItem(saveSlotKey(slotId), payload);
    } catch {
      compactFloorStates(snapshot, Math.floor(MAX_SAVED_FLOOR_STATES / 2));
      payload = JSON.stringify(snapshot);
      try {
        localStorage.setItem(saveSlotKey(slotId), payload);
      } catch {
        snapshot.floorStates = {};
        localStorage.setItem(saveSlotKey(slotId), JSON.stringify(snapshot));
      }
    }
    localStorage.setItem(`${SAVE_KEY}-current`, slotId);
    updateSaveSlotMeta(slotId, snapshot);
    if (show) {
      if (state.currentEnemy) renderLog();
      else render();
    }
  }

  // 从当前多槽 localStorage 恢复存档。
  function cloneSaveSnapshot(snapshot) {
    return JSON.parse(JSON.stringify(snapshot));
  }

  function compactFloorStates(snapshot, limit = MAX_SAVED_FLOOR_STATES) {
    const floorStates = snapshot?.floorStates || {};
    const entries = Object.entries(floorStates);
    if (entries.length <= limit) return snapshot;
    const currentFloor = Number(snapshot.floor || 1);
    const keep = new Set(
      entries
        .sort(([floorA], [floorB]) => {
          const distanceA = Math.abs(Number(floorA) - currentFloor);
          const distanceB = Math.abs(Number(floorB) - currentFloor);
          if (distanceA !== distanceB) return distanceA - distanceB;
          return Number(floorB) - Number(floorA);
        })
        .slice(0, limit)
        .map(([floor]) => floor)
    );
    for (const floor of Object.keys(floorStates)) {
      if (!keep.has(floor)) delete floorStates[floor];
    }
    return snapshot;
  }

  function loadGame(slotId = slots.current || "slot-1") {
    const raw = localStorage.getItem(saveSlotKey(slotId));
    if (!raw) return false;
    setRuntimeState(JSON.parse(raw));
    repairDoorAccessBlockers();
    for (const floorState of Object.values(state.floorStates || {}) as any[]) {
      if (floorState?.map?.cells) repairDoorAccessBlockers(floorState.map.cells);
    }
    slots.current = slotId;
    slots.pending = slotId;
    localStorage.setItem(`${SAVE_KEY}-current`, slots.current);
    updateVisibility();
    updateSaveSlotMeta(slotId, state);
    return true;
  }

  // 显示弹窗，并使用调用方传入的按钮动作。
  function returnHome(confirm = true) {
    if (confirm && state) {
      showModal("返回首页", "<p>返回首页前会自动保存当前冒险。</p><p>确定要回到首页吗？</p>", [
        { text: "继续冒险", action: closeModal },
        { text: "保存并返回", action: () => returnHome(false) }
      ]);
      return;
    }
    if (state) saveGame(false);
    setRuntimeState(null);
    closeModal();
    renderStartScreen();
    render();
  }

  // 返回存档列表，玩家可以继续其他槽位或创建新游戏。
  function newGamePrompt() {
    showModal(
      "存档",
      `<p>当前冒险位于${saveSlotLabel(slots.current)}。你可以返回存档列表继续其他槽，或在任意槽创建新游戏。</p>`,
      [
        { text: "继续当前", action: closeModal },
        { text: "存档列表", action: returnHome }
      ]
    );
  }

  const withState =
    (fn) =>
    (...args) => {
      syncState();
      return fn(...args);
    };

  return {
    deleteSaveSlot: withState(deleteSaveSlot),
    loadGame: withState(loadGame),
    log: withState(log),
    newGamePrompt: withState(newGamePrompt),
    openSaveSlotPicker: withState(openSaveSlotPicker),
    returnHome: withState(returnHome),
    saveGame: withState(saveGame),
    saveGameToSlot: withState(saveGameToSlot),
    saveMetaFromState,
    savePickerSlotCard: withState(savePickerSlotCard),
    saveSlots,
    updateSaveSlotMeta
  };
}
