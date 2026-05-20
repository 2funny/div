import type { SlotKey, Stats } from "./core";

export interface Item {
  id: string;
  kind: string;
  name: string;
  type?: string;
  slot?: SlotKey;
  quality?: string;
  weaponType?: string;
  element?: string;
  elementResistances?: string[];
  stats?: Stats;
  runeSlots?: number;
  runes?: string[];
  level?: number;
  amount?: number;
  effect?: string;
  skillId?: string;
  classId?: string;
}

export type EquipmentSet = Record<SlotKey, Item | null>;
