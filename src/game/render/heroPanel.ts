import { CLASSES, SLOT_NAMES, STAT_NAMES } from "../constants";
import { escapeHtml } from "./html";

export function heroStatsGridMarkup(state: any, totals: any) {
  return Object.entries(STAT_NAMES)
    .map(
      ([key, name]) => `
    <div class="stat">
      <span>${name} ${totals[key]}</span>
      <button type="button" ${state.statPoints ? "" : "disabled"} onclick="confirmAddStat('${key}')">+</button>
    </div>
  `
    )
    .join("");
}

export function renderPaperdollMarkup(state: any, imageTag: (src: string, alt: string) => string, assetForClass: (classId?: string) => string) {
  const slots = [
    ["weapon", "weapon"],
    ["armor", "armor"],
    ["boots", "boots"],
    ["ring", "ring"],
    ["amulet", "amulet"]
  ];
  return `
    <div class="paperdoll-figure">${imageTag(assetForClass(state.classId), CLASSES[state.classId].name)}</div>
    ${slots
      .map(([slot, cls]) => {
        const eq = state.equipment[slot];
        return `<button class="gear-slot gear-${cls} ${eq ? "equipped" : ""}" type="button" onclick="showEquipmentSlot('${slot}')" title="${eq ? escapeHtml(eq.name) : SLOT_NAMES[slot as keyof typeof SLOT_NAMES]}">
        <span>${SLOT_NAMES[slot as keyof typeof SLOT_NAMES]}</span>
        <b>${eq ? escapeHtml(eq.name) : "未装备"}</b>
        <small>${eq ? `+${eq.level}` : "空"}</small>
      </button>`;
      })
      .join("")}
  `;
}
