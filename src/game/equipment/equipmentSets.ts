import type { Item, Stats } from "../types";

export const EQUIPMENT_SET_THEMES = {
  warden: {
    id: "warden",
    name: "巡夜誓印",
    classes: ["warrior"],
    stats: { def: 2, hp: 10 },
    threePieceStats: { atk: 1 },
    dropStats: ["def", "hp", "atk"],
    prefix: "誓印"
  },
  runebound: {
    id: "runebound",
    name: "符文回声",
    classes: ["mage"],
    stats: { mag: 2, mp: 8 },
    threePieceStats: { res: 1 },
    dropStats: ["mag", "mp", "res"],
    prefix: "回声"
  },
  wayfarer: {
    id: "wayfarer",
    name: "幸存者路标",
    classes: ["ranger"],
    stats: { spd: 2, luk: 1 },
    threePieceStats: { atk: 1 },
    dropStats: ["spd", "luk", "atk"],
    prefix: "路标"
  },
  caravan: {
    id: "caravan",
    name: "商队余烬",
    classes: ["warrior", "mage", "ranger"],
    stats: { luk: 2, res: 1 },
    threePieceStats: { mp: 6 },
    dropStats: ["luk", "res", "mp"],
    prefix: "余烬"
  }
} as const;

export type EquipmentSetId = keyof typeof EQUIPMENT_SET_THEMES;

export function chooseEquipmentSetTheme(
  classId = "warrior",
  floor = 1,
  quality = "",
  chanceRoll = Math.random(),
  pickRoll = Math.random()
) {
  if (floor < 5) return null;
  const chance = quality === "传说" ? 0.55 : quality === "史诗" ? 0.42 : quality === "稀有" ? 0.3 : 0.18;
  if (chanceRoll >= chance) return null;
  const preferred = Object.values(EQUIPMENT_SET_THEMES).filter((theme) =>
    (theme.classes as readonly string[]).includes(classId)
  );
  const pool = preferred.length ? preferred : Object.values(EQUIPMENT_SET_THEMES);
  return pool[Math.floor(pickRoll * pool.length)] || null;
}

export function applyEquipmentSetTheme(item: Item, theme: any, floor = 1, statRoll = Math.random()) {
  if (!item || !theme || item.kind !== "equip") return item;
  item.setId = theme.id;
  item.setName = theme.name;
  item.name = `${theme.prefix}${item.name}`;
  const stat = theme.dropStats[Math.floor(statRoll * theme.dropStats.length)];
  const amount = stat === "hp" || stat === "mp" ? 3 + Math.ceil(floor / 5) : 1;
  item.stats = item.stats || {};
  item.stats[stat] = (item.stats[stat] || 0) + amount;
  return item;
}

export function equipmentSetBonuses(equipment: Record<string, Item | null | undefined> = {}) {
  const counts: Record<string, number> = {};
  for (const item of Object.values(equipment)) {
    if (!item?.setId) continue;
    counts[item.setId] = (counts[item.setId] || 0) + 1;
  }
  const total: Stats = {};
  for (const [setId, count] of Object.entries(counts)) {
    const theme = EQUIPMENT_SET_THEMES[setId as EquipmentSetId];
    if (!theme || count < 2) continue;
    addStats(total, theme.stats);
    if (count >= 3) addStats(total, theme.threePieceStats);
  }
  return total;
}

export function equipmentSetBonusText(item: Item | null | undefined) {
  if (!item?.setId) return "";
  const theme = EQUIPMENT_SET_THEMES[item.setId as EquipmentSetId];
  if (!theme) return item.setName || "";
  return `${theme.name}套装：2件 ${statText(theme.stats)}；3件 ${statText(theme.threePieceStats)}`;
}

function addStats(target: Stats, stats: Stats) {
  for (const [key, value] of Object.entries(stats || {})) {
    target[key as keyof Stats] = (target[key as keyof Stats] || 0) + Number(value || 0);
  }
}

function statText(stats: Stats) {
  const names: Record<string, string> = {
    atk: "攻击",
    mag: "法强",
    def: "防御",
    res: "抗性",
    spd: "速度",
    luk: "幸运",
    hp: "生命",
    mp: "法力"
  };
  return Object.entries(stats || {})
    .map(([key, value]) => `${names[key] || key}+${value}`)
    .join("、");
}
