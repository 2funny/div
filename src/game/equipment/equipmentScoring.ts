import type { Item } from "../types";
import { equipmentQualityConfig } from "../constants/balance";

const STAT_SCORE_WEIGHTS: Record<string, number> = {
  atk: 11,
  mag: 11,
  def: 9,
  res: 8,
  spd: 8,
  luk: 7,
  hp: 1.2,
  mp: 1.1
};

export function effectiveItemStat(item: Item | null | undefined, key: string): number {
  if (!item) return 0;
  return (item.stats?.[key] || 0) + (item.stats?.[key] ? item.level || 0 : 0);
}

// 根据属性权重、品质、符文槽和强化等级估算物品评分。
export function itemScore(item: Item | null | undefined): number {
  if (!item) return 0;
  if (item.kind === "potion") return item.amount || 0;
  if (item.kind === "teleport") return 35;
  if (item.kind !== "equip") return 0;
  const statScore = Object.entries(item.stats || {}).reduce((sum, [key, value]) => {
    return sum + (STAT_SCORE_WEIGHTS[key] || 5) * (value + (item.level || 0));
  }, 0);
  const qualityScore = equipmentQualityConfig(item.quality).score;
  const slotScore =
    (item.runeSlots || 0) * 6 +
    (item.runes?.length || 0) * 4 +
    (item.element ? 10 : 0) +
    (item.elementResistances?.length || 0) * 8 +
    (item.setId ? 12 : 0);
  return Math.round(statScore + qualityScore + slotScore);
}
