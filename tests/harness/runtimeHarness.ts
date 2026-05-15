import * as data from "../../src/game/constants";
import * as runtime from "../../src/game/runtime";
import { saveSlotKey } from "../../src/game/save/save";

const target = globalThis as typeof globalThis & Record<string, unknown>;

Object.assign(target, data, runtime, { saveSlotKey });

function normalizeState(nextState: unknown) {
  if (!nextState || typeof nextState !== "object") return nextState;
  const state = nextState as Record<string, any>;
  const classId = state.classId || "warrior";
  const classDef = data.CLASSES[classId] || data.CLASSES.warrior;
  state.classId = classId;
  state.level ??= 1;
  state.xp ??= 0;
  state.xpNext ??= 20;
  state.floor ??= 1;
  state.player ??= { x: 1, y: 1 };
  state.facing ??= "down";
  state.maxHp ??= classDef.hp;
  state.hp ??= state.maxHp;
  state.maxMp ??= classDef.mp;
  state.mp ??= state.maxMp;
  state.stats = { ...classDef.stats, ...(state.stats || {}) };
  state.equipment ??= runtime.emptyEquipment();
  state.inventory ??= [];
  state.materials ??= {};
  state.runes ??= {};
  state.gold ??= 0;
  state.keys ??= 0;
  state.log ??= [];
  state.quests ??= [];
  state.lore ??= { chapters: [], pages: [] };
  state.floorStates ??= {};
  state.skillLevels ??= {};
  state.skillBranches ??= {};
  state.statPoints ??= 0;
  state.skillPoints ??= 0;
  state.skillDust ??= 0;
  if (state.map?.cells && !state.map.size) {
    state.map.size = state.map.cells.length;
  }
  return state;
}

Object.defineProperty(target, "state", {
  configurable: true,
  get: runtime.getState,
  set: (nextState) => runtime.setState(normalizeState(nextState) as any)
});

Object.defineProperty(target, "audioEnabled", {
  configurable: true,
  get: runtime.getAudioEnabled,
  set: runtime.setAudioEnabledForRuntime
});

Object.defineProperty(target, "currentSaveSlot", {
  configurable: true,
  get: runtime.getCurrentSaveSlot,
  set: runtime.setCurrentSaveSlot
});

Object.defineProperty(target, "activeInventoryTab", {
  configurable: true,
  get: runtime.getActiveInventoryTab,
  set: runtime.setActiveInventoryTab
});

Object.defineProperty(target, "activeEquipmentFilter", {
  configurable: true,
  get: runtime.getActiveEquipmentFilter,
  set: runtime.setActiveEquipmentFilter
});
