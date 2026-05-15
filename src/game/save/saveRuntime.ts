// @ts-nocheck
import { CLASSES, SAVE_KEY, isValidMapSize } from "../constants";
import {
  SAVE_SLOT_LIMIT,
  formatSaveTime,
  readSaveIndex,
  saveSlotKey,
  saveSlotLabel,
  writeSaveIndex
} from "./save";
import { ensureLoreState, unlockLoreChaptersForFloor } from "../quest/lore";

// 存档运行时封装多槽 localStorage 读写、旧存档迁移和存档元信息维护。
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
  const emptyEquipment = (...args) => api.emptyEquipment(...args);
  const generateFloor = (...args) => api.generateFloor(...args);
  const render = (...args) => api.render(...args);
  const renderLog = (...args) => api.renderLog(...args);
  const renderStartScreen = (...args) => api.renderStartScreen(...args);
  const showConfirm = (...args) => api.showConfirm(...args);
  const showModal = (...args) => api.showModal(...args);
  const showToast = (...args) => api.showToast(...args);
  const updateVisibility = (...args) => api.updateVisibility(...args);

  // 读取所有存档槽及摘要信息，渲染层只消费这个稳定列表。
  function saveSlots() {
    migrateLegacySave();
    const index = readSaveIndex();
    return Array.from({ length: SAVE_SLOT_LIMIT }, (_, i) => {
      const id = `slot-${i + 1}`;
      return { id, label: saveSlotLabel(id), meta: index[id] || null };
    });
  }

  // 将早期单存档 key 迁移到 slot-1，避免升级后丢失旧角色。
  function migrateLegacySave() {
    const raw = localStorage.getItem(SAVE_KEY);
    const index = readSaveIndex();
    if (!raw || index["slot-1"] || localStorage.getItem(saveSlotKey("slot-1"))) return;
    try {
      const legacy = JSON.parse(raw);
      localStorage.setItem(saveSlotKey("slot-1"), raw);
      index["slot-1"] = saveMetaFromState(legacy);
      writeSaveIndex(index);
      slots.current = "slot-1";
      localStorage.setItem(`${SAVE_KEY}-current`, slots.current);
      localStorage.removeItem(SAVE_KEY);
    } catch {
      localStorage.removeItem(SAVE_KEY);
    }
  }

  function saveMetaFromState(snapshot) {
    const cls = CLASSES[snapshot?.classId] || {};
    return {
      classId: snapshot?.classId || "",
      className: cls.name || "冒险者",
      floor: snapshot?.floor || 1,
      level: snapshot?.level || 1,
      hp: Math.max(0, Math.ceil(snapshot?.hp || 0)),
      maxHp: Math.max(0, Math.ceil(snapshot?.maxHp || cls.hp || 0)),
      gold: snapshot?.gold || 0,
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
    const targetText = slot?.meta
      ? `<p>${slot.label} 已有 ${slot.meta.className || "冒险者"} Lv.${slot.meta.level || 1}。</p><p>确定把当前冒险保存到这里吗？</p>`
      : `<p>确定把当前冒险保存到 ${saveSlotLabel(slotId)} 吗？</p>`;
    showConfirm("确认保存", targetText, "确定", () => saveGame(true, slotId));
  }

  // 将完整游戏状态保存到 localStorage。
  function saveGame(show = true, slotId = slots.current || "slot-1") {
    if (!state) return;
    slots.current = slotId;
    slots.pending = slotId;
    if (show) log(`${saveSlotLabel(slotId)}已保存。`);
    localStorage.setItem(saveSlotKey(slotId), JSON.stringify(state));
    localStorage.setItem(`${SAVE_KEY}-current`, slotId);
    updateSaveSlotMeta(slotId, state);
    if (show) {
      if (state.currentEnemy) renderLog();
      else render();
    }
  }

  // 从 localStorage 恢复存档，并补齐新版字段的默认值。
  function loadGame(slotId = slots.current || "slot-1") {
    migrateLegacySave();
    const raw = localStorage.getItem(saveSlotKey(slotId));
    if (!raw) return false;
    setRuntimeState(JSON.parse(raw));
    slots.current = slotId;
    slots.pending = slotId;
    localStorage.setItem(`${SAVE_KEY}-current`, slots.current);
    state.facing = state.facing || "down";
    state.skillPoints = state.skillPoints || 0;
    state.skillDust = state.skillDust || 0;
    state.keys = state.keys || 0;
    state.universalKeys = state.universalKeys || 0;
    state.doorKeys = state.doorKeys || {};
    state.doorKeyNames = state.doorKeyNames || {};
    state.quest = state.quest || null;
    state.quests = Array.isArray(state.quests) ? state.quests : [];
    ensureLoreState(state);
    unlockLoreChaptersForFloor(state);
    state.floorStates = state.floorStates || {};
    state.skillLevels = state.skillLevels || {};
    state.skillBranches = state.skillBranches || {};
    for (const skill of CLASSES[state.classId].skills) {
      state.skillLevels[skill.id] = state.skillLevels[skill.id] || 0;
    }
    if (
      !state.map?.cells?.length ||
      !isValidMapSize(state.map.size) ||
      state.map.cells.length !== state.map.size
    ) {
      generateFloor();
    }
    if (state.map && state.map.explorationVersion !== 2) resetExploration();
    updateVisibility();
    updateSaveSlotMeta(slotId, state);
    return true;
  }

  // 重置探索可见性，用于老存档升级到新版视野逻辑。
  function resetExploration() {
    for (const row of state.map.cells) {
      for (const cell of row) {
        cell.seen = false;
        cell.visible = false;
      }
    }
    state.map.explorationVersion = 2;
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
    migrateLegacySave,
    newGamePrompt: withState(newGamePrompt),
    openSaveSlotPicker: withState(openSaveSlotPicker),
    resetExploration: withState(resetExploration),
    returnHome: withState(returnHome),
    saveGame: withState(saveGame),
    saveGameToSlot: withState(saveGameToSlot),
    saveMetaFromState,
    savePickerSlotCard: withState(savePickerSlotCard),
    saveSlots,
    updateSaveSlotMeta
  };
}
