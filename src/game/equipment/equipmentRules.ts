import type { Item, StatKey, Stats } from "../types";
import { random } from "../random";

export const WEAPON_TYPES = {
  sword: { name: "剑", stat: "atk", stats: ["atk", "def"], classes: ["warrior"] },
  axe: { name: "斧", stat: "atk", stats: ["atk", "hp"], classes: ["warrior"] },
  greatsword: { name: "重剑", stat: "atk", stats: ["atk", "def"], classes: ["warrior"] },
  staff: { name: "法杖", stat: "mag", stats: ["mag", "mp"], classes: ["mage"] },
  tome: { name: "魔书", stat: "mag", stats: ["mag", "mp"], classes: ["mage"] },
  orb: { name: "法珠", stat: "mag", stats: ["mag", "res"], classes: ["mage"] },
  bow: { name: "弓", stat: "atk", stats: ["atk", "spd"], classes: ["ranger"] },
  crossbow: { name: "弩", stat: "atk", stats: ["atk", "luk"], classes: ["ranger"] },
  dagger: { name: "短刃", stat: "spd", stats: ["atk", "spd"], classes: ["ranger"] }
} as const;

export type WeaponType = keyof typeof WEAPON_TYPES;

export const CLASS_WEAPON_TYPES: Record<string, WeaponType[]> = {
  warrior: ["sword", "axe", "greatsword"],
  mage: ["staff", "tome", "orb"],
  ranger: ["bow", "crossbow", "dagger"]
};

export function weaponTypeName(type?: string | null) {
  return type && WEAPON_TYPES[type as WeaponType]?.name
    ? WEAPON_TYPES[type as WeaponType].name
    : "";
}

export function weaponPrimaryStat(type?: string | null): StatKey {
  return (
    type && WEAPON_TYPES[type as WeaponType]?.stat ? WEAPON_TYPES[type as WeaponType].stat : "atk"
  ) as StatKey;
}

export function weaponPrimaryStats(type?: string | null): Array<keyof Stats> {
  const def = type ? WEAPON_TYPES[type as WeaponType] : null;
  return ((def?.stats || [def?.stat || "atk"]) as ReadonlyArray<keyof Stats>).filter(Boolean);
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

export function randomWeaponTypeForClass(classId: string, roll = random()) {
  const preferred = CLASS_WEAPON_TYPES[classId] || CLASS_WEAPON_TYPES.warrior;
  const all = Object.keys(WEAPON_TYPES) as WeaponType[];
  const offClass = all.filter((type) => !preferred.includes(type));
  const pool = roll < 0.7 ? preferred : offClass.length ? offClass : all;
  return pool[Math.floor(random() * pool.length)] || preferred[0];
}
