import { SLOT_NAMES, SLOTS, STAT_NAMES } from "../constants";
import { elementName, elementResistText } from "../combat/elements";
import { weaponTypeName } from "../equipment/equipmentRules";
import { equipmentSetBonusText } from "../equipment/equipmentSets";

export function statsText(eq: any) {
  const stats = Object.entries(eq.stats || {})
    .map(([key, value]) => {
      const enhance = eq.level ? `(+${eq.level})` : "";
      return `${STAT_NAMES[key as keyof typeof STAT_NAMES] || key}+${value}${enhance}`;
    })
    .join(" ");
  const elementText = elementName(eq.element);
  return [elementText ? `${elementText}属性` : "", elementResistText(eq.elementResistances), stats]
    .filter(Boolean)
    .join(" ");
}

export function equipmentSummary(eq: any, score: number, stateLabel = "") {
  return `
    <span class="equipment-meta">
      <span>评分 ${score}</span>
      <span>${SLOT_NAMES[eq.slot as keyof typeof SLOT_NAMES]}</span>
      ${eq.weaponType ? `<span>${weaponTypeName(eq.weaponType)}</span>` : ""}
      ${eq.setName ? `<span>${eq.setName}</span>` : ""}
      <span class="quality-${eq.quality}">${eq.quality}</span>
      <span>强化 +${eq.level}</span>
      ${stateLabel ? `<span class="state-muted">${stateLabel}</span>` : ""}
    </span>
    <small class="equipment-stats">${statsText(eq) || "无属性"}</small>
  `;
}

export function equippedStateBadge() {
  return `<span class="equipped-badge">已装备</span>`;
}

export function equipmentScoreBadgeMarkup(
  direction: string,
  arrow: string,
  scoreSign: string,
  scoreDelta: number
) {
  return `
    <span class="compare-badge compare-badge-${direction}" aria-label="${scoreDelta >= 0 ? "更好" : "更差"}">
      <span class="compare-arrow">${arrow}</span>
      <span>${scoreSign}${scoreDelta}</span>
    </span>
  `;
}

export function enhanceText(eq: any) {
  return Object.keys(eq.stats)
    .map((key) => `${STAT_NAMES[key as keyof typeof STAT_NAMES] || key}+${eq.level}`)
    .join(" ");
}

export function equipmentDetailMarkup(
  eq: any,
  slotName: string,
  runeText: string,
  score: number,
  extraRows = ""
) {
  return `
    <div class="equipment-detail">
      <div class="equipment-meta">
        <span>评分 ${score}</span>
        <span>${slotName}</span>
        ${eq.weaponType ? `<span>${weaponTypeName(eq.weaponType)}</span>` : ""}
        <span class="quality-${eq.quality}">${eq.quality}</span>
        <span>强化 +${eq.level}</span>
      </div>
      <div class="detail-row"><b>属性</b><span>${statsText(eq) || "无属性"}</span></div>
      ${eq.setId ? `<div class="detail-row"><b>套装</b><span>${equipmentSetBonusText(eq)}</span></div>` : ""}
      ${eq.level ? `<div class="detail-row"><b>强化提升</b><span>${enhanceText(eq)}</span></div>` : ""}
      <div class="detail-row"><b>符文槽</b><span>${runeText}</span></div>
      ${extraRows}
    </div>
  `;
}

export function renderEquipmentPanelMarkup(ctx: any) {
  return SLOTS.map((slot) => {
    const eq = ctx.state.equipment[slot];
    const disabledReason = ctx.enhanceDisabledReason(slot);
    const actions = eq
      ? `<button type="button" ${disabledReason ? "disabled" : ""} title="${disabledReason || "强化"}" onclick="confirmEnhance('${slot}')">强化</button><button type="button" onclick="confirmUnequip('${slot}')">拆下</button>`
      : `<button type="button" disabled>空位</button>`;
    return `<div class="item-row equipment-card equipped-row inventory-card"><div class="item-main"><span class="item-kicker">${SLOT_NAMES[slot]}${eq ? ctx.equippedStateBadge() : ""}</span>${eq ? `<b class="equipment-name">${eq.name}</b>${ctx.equipmentSummary(eq, disabledReason ? "不可强化" : "")}` : `<b>空位</b><small>未装备</small>`}</div><div class="item-side equipment-actions">${actions}</div></div>`;
  }).join("");
}

export function renderCraftPanelMarkup(ctx: any) {
  const runes = ctx.runeEntries().filter(([, count]: [string, number]) => count > 0);
  return `
    <div class="item-row"><div>材料<small>强化石 ${ctx.state.materials["强化石"] || 0}，魔尘 ${ctx.state.materials["魔尘"] || 0}</small></div></div>
    ${runes.length ? runes.map(([name, count]: [string, number]) => `<div class="item-row"><div>${name}符文<small>${ctx.runeEffectText(name)}</small></div><button type="button" ${count >= 3 ? "" : "disabled"} onclick="confirmCraftRune('${name}')">合成</button><span class="item-quantity">x${count}</span></div>`).join("") : "<p>暂无符文。</p>"}
  `;
}

export function inventoryEquipmentCompareMarkup(
  entry: any,
  current: any,
  score: (item: any) => number,
  compareText: (item: any) => string
) {
  return `
    <div class="equipment-detail">
      <div class="detail-row"><b>候选装备</b><span>${entry.name} · 评分 ${score(entry)}</span></div>
      <div class="detail-row"><b>当前装备</b><span>${current.name} · 评分 ${score(current)}</span></div>
      <div class="detail-row"><b>差值</b><span>${compareText(entry)}</span></div>
    </div>
  `;
}

export function equipmentCompareTextMarkup(ctx: any, item: any, extraClass = "") {
  if (!item || item.kind !== "equip") return "";
  const current = ctx.state.equipment[item.slot];
  const restriction = ctx.equipmentRestrictionText(item, ctx.state.classId);
  const scoreDelta = ctx.itemScore(item) - ctx.itemScore(current);
  const direction = scoreDelta >= 0 ? "up" : "down";
  const arrow = scoreDelta >= 0 ? "↑" : "↓";
  const statKeys = Array.from(
    new Set([...Object.keys(current?.stats || {}), ...Object.keys(item.stats || {})])
  );
  const statDeltas = statKeys
    .map((key: string) => {
      const delta = ctx.effectiveItemStat(item, key) - ctx.effectiveItemStat(current, key);
      if (!delta) return "";
      const sign = delta > 0 ? "+" : "";
      return `<span class="${delta > 0 ? "compare-up" : "compare-down"}">${STAT_NAMES[key as keyof typeof STAT_NAMES] || key}差 ${sign}${delta}</span>`;
    })
    .filter(Boolean);
  const scoreClass = scoreDelta >= 0 ? "compare-up" : "compare-down";
  const scoreSign = scoreDelta > 0 ? "+" : "";
  return `
    <small class="equipment-compare ${extraClass}">
      ${equipmentScoreBadgeMarkup(direction, arrow, scoreSign, scoreDelta)}
      <span class="compare-title">装备对比</span>
      <span class="${scoreClass}">评分差 ${scoreSign}${scoreDelta}</span>
      ${restriction ? `<span class="compare-down">${restriction}</span>` : ""}
      ${statDeltas.join("")}
    </small>
  `;
}
