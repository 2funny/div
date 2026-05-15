import type { SlotKey, StatKey } from "../types";

export const RUNES = ["火焰", "寒冰", "雷霆", "吸血", "守护", "迅捷"];
export const SLOTS: SlotKey[] = ["weapon", "armor", "boots", "ring", "amulet"];
export const SLOT_NAMES: Record<SlotKey, string> = {
  weapon: "武器",
  armor: "护甲",
  boots: "鞋子",
  ring: "戒指",
  amulet: "护符"
};
export const STAT_NAMES: Record<StatKey, string> = {
  atk: "攻击",
  mag: "法强",
  def: "防御",
  res: "抗性",
  spd: "速度",
  luk: "幸运"
};
