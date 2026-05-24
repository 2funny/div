import { ELEMENT_IDS, elementName } from "../combat/elements";
import { SLOTS } from "../constants";
import { equipmentQualityConfig, equipmentRuneSlotsForQuality } from "../constants/balance";
import { choice, random } from "../random";
import type { GameState, SlotKey } from "../types";
import { equipmentName } from "./equipmentNames";
import { randomWeaponTypeForClass, weaponPrimaryStats } from "./equipmentRules";
import { applyEquipmentSetTheme, chooseEquipmentSetTheme } from "./equipmentSets";
import { item } from "./inventory";

// Equipment drop generation owns quality, stat budgets, and elemental/resistance extras.
export function randomEquipmentForState(state: GameState) {
  const slot = choice(SLOTS);
  const quality = qualityRoll(state.floor);
  const weaponType = slot === "weapon" ? randomWeaponTypeForClass(state.classId || "warrior") : "";
  const bonus = qualityBonus(quality) + Math.floor((state.floor || 1) / 4);
  const stats = equipmentStatsForDrop(slot, bonus, weaponType, state.floor || 1);
  const equipment = item(
    equipmentName(slot, quality, weaponType),
    slot,
    quality,
    stats,
    equipmentRuneSlotsForQuality(quality)
  );
  if (weaponType) equipment.weaponType = weaponType;
  if (
    slot === "weapon" &&
    ((state.floor || 1) >= 4 || quality !== "普通") &&
    random() < weaponElementChance(quality)
  ) {
    equipment.element = choice([...ELEMENT_IDS]);
    equipment.name = `${elementName(equipment.element)}纹${equipment.name}`;
  }
  if (slot !== "weapon" && (state.floor || 1) >= 4 && random() < elementResistanceChance(quality)) {
    const resistance = choice([...ELEMENT_IDS]);
    equipment.elementResistances = [resistance];
    equipment.name = `${elementName(resistance)}抗${equipment.name}`;
  }
  applyEquipmentSetTheme(
    equipment,
    chooseEquipmentSetTheme(state.classId || "warrior", state.floor || 1, quality, random(), random()),
    state.floor || 1,
    random()
  );
  return equipment;
}

export function qualityRoll(floor = 1) {
  const r = random() + Math.min(0.04, floor * 0.004);
  if (r > 0.99) return "传说";
  if (r > 0.86) return "史诗";
  if (r > 0.68) return "稀有";
  if (r > 0.38) return "优秀";
  return "普通";
}

function equipmentStatsForDrop(slot: SlotKey, bonus: number, weaponType = "", floor = 1) {
  if (slot === "weapon") {
    const stats: Record<string, number> = {};
    const primaryStats = weaponPrimaryStats(weaponType);
    primaryStats.forEach((stat, index) => {
      const value =
        stat === "hp"
          ? 4 + floor + bonus * 2
          : stat === "mp"
            ? 2 + Math.ceil(floor * 0.5) + bonus
            : index === 0
              ? bonus
              : Math.max(1, Math.ceil(bonus * 0.65));
      stats[stat] = (stats[stat] || 0) + value;
    });
    return stats;
  }
  const main =
    slot === "armor" ? "def" : slot === "boots" ? "spd" : slot === "ring" ? "luk" : "res";
  const stats: Record<string, number> = { [main]: bonus };
  if (slot === "armor") stats.hp = 4 + floor;
  return stats;
}

function weaponElementChance(quality: string) {
  return equipmentQualityConfig(quality).weaponElementChance;
}

function elementResistanceChance(quality: string) {
  return equipmentQualityConfig(quality).elementResistanceChance;
}

function qualityBonus(quality: string) {
  return equipmentQualityConfig(quality).dropBonus;
}
