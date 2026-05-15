import type { Item, StatKey } from "./types";

export const WEAPON_TYPES = {
  sword: { name: "剑", stat: "atk", classes: ["warrior"] },
  axe: { name: "斧", stat: "atk", classes: ["warrior"] },
  greatsword: { name: "重剑", stat: "atk", classes: ["warrior"] },
  staff: { name: "法杖", stat: "mag", classes: ["mage"] },
  tome: { name: "魔书", stat: "mag", classes: ["mage"] },
  orb: { name: "法珠", stat: "mag", classes: ["mage"] },
  bow: { name: "弓", stat: "atk", classes: ["ranger"] },
  crossbow: { name: "弩", stat: "atk", classes: ["ranger"] },
  dagger: { name: "短刃", stat: "spd", classes: ["ranger"] }
} as const;

export type WeaponType = keyof typeof WEAPON_TYPES;

export const CLASS_WEAPON_TYPES: Record<string, WeaponType[]> = {
  warrior: ["sword", "axe", "greatsword"],
  mage: ["staff", "tome", "orb"],
  ranger: ["bow", "crossbow", "dagger"]
};

export function weaponTypeName(type?: string | null) {
  return type && WEAPON_TYPES[type as WeaponType]?.name ? WEAPON_TYPES[type as WeaponType].name : "";
}

export function weaponPrimaryStat(type?: string | null): StatKey {
  return (type && WEAPON_TYPES[type as WeaponType]?.stat ? WEAPON_TYPES[type as WeaponType].stat : "atk") as StatKey;
}

export function isWeaponUsableByClass(item?: Item | null, classId?: string | null) {
  if (!item || item.kind !== "equip" || item.slot !== "weapon") return true;
  if (!item.weaponType) return true;
  return (CLASS_WEAPON_TYPES[classId || ""] || []).includes(item.weaponType as WeaponType);
}

export function equipmentRestrictionText(item?: Item | null, classId?: string | null) {
  if (isWeaponUsableByClass(item, classId)) return "";
  return `职业不可用：${weaponTypeName(item?.weaponType)}系武器`;
}

export function randomWeaponTypeForClass(classId: string, roll = Math.random()) {
  const preferred = CLASS_WEAPON_TYPES[classId] || CLASS_WEAPON_TYPES.warrior;
  const all = Object.keys(WEAPON_TYPES) as WeaponType[];
  const pool = roll < 0.65 ? preferred : all;
  return pool[Math.floor(Math.random() * pool.length)] || preferred[0];
}
