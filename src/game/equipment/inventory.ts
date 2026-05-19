import { RUNES, SLOT_NAMES, SLOTS, STAT_NAMES } from "../constants";
import { uid } from "../random";
import type { EquipmentSet, Item, SlotKey, StatKey, Stats } from "../types";

export function emptyEquipment(): EquipmentSet {
  return Object.fromEntries(SLOTS.map((slot) => [slot, null])) as EquipmentSet;
}

export function potion(name: string, kind: "hp" | "mp", amount: number): Item {
  return { id: uid(), kind: "potion", name, effect: kind, amount };
}

export function teleportBeacon(): Item {
  return { id: uid(), kind: "teleport", name: "商路信标" };
}

export function item(
  name: string,
  slot: SlotKey,
  quality: string,
  stats: Partial<Stats>,
  runeSlots = 0,
  runes: string[] = []
): Item {
  return { id: uid(), kind: "equip", name, slot, quality, stats, runeSlots, runes, level: 0 };
}

export function starterEquipment(classId: string): EquipmentSet {
  const weapon =
    classId === "mage"
      ? item("学徒法杖", "weapon", "普通", { mag: 2 })
      : classId === "ranger"
        ? item("短弓", "weapon", "普通", { atk: 2, spd: 1 })
        : item("铁剑", "weapon", "普通", { atk: 2 });
  weapon.weaponType = classId === "mage" ? "staff" : classId === "ranger" ? "bow" : "sword";
  return {
    weapon,
    armor: item("旧皮甲", "armor", "普通", { def: 1, hp: 4 }),
    boots: null,
    ring: null,
    amulet: null
  };
}

export function starterInventory(classId: string): Item[] {
  void classId;
  return [potion("小型生命药水", "hp", 18), potion("小型法力药水", "mp", 12)];
}

export {
  confirmEquipItem,
  confirmUseItem,
  craftRune,
  disassembleEquipment,
  enhance,
  equipItem,
  renderInventory,
  sellEquipment,
  unequipItem,
  useItem
} from "../runtime";

export { RUNES, SLOT_NAMES, SLOTS, STAT_NAMES };
export type { Item, SlotKey, StatKey, Stats };
