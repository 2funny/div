import { SAVE_KEY } from "./data";

export const SAVE_INDEX_KEY = `${SAVE_KEY}-index-v2`;
export const SAVE_SLOT_LIMIT = 4;

export function saveSlotKey(slotId: string): string {
  return `${SAVE_KEY}-${slotId}`;
}

export function saveSlotLabel(slotId: string): string {
  const number = slotId.replace("slot-", "");
  return `存档 ${Number(number) || 1}`;
}

export function readSaveIndex(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(SAVE_INDEX_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

export function writeSaveIndex(index: Record<string, unknown>): void {
  localStorage.setItem(SAVE_INDEX_KEY, JSON.stringify(index));
}

export function formatSaveTime(value: string | null | undefined): string {
  if (!value) return "未保存";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export {
  continueSavedGame,
  deleteSaveSlot,
  loadGame,
  openSaveSlotPicker,
  renderContinueSlots,
  saveGame,
  saveGameToSlot,
  saveSlots
} from "./runtime";
