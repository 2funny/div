import { SLOT_NAMES, SLOTS } from "../constants";
import { equipmentRestrictionText } from "../equipment/equipmentRules";
import { itemScore } from "../equipment/equipmentScoring";

type InventoryPanelContext = {
  activeEquipmentFilter: string;
  activeInventoryTab: string;
  equipmentScoreBadge: (entry: any, extraClass?: string) => string;
  equipmentSummary: (entry: any, stateLabel?: string) => string;
  isBetterThanEquipped: (entry: any) => boolean;
  runeEffectText: (name: string) => string;
  state: any;
};

export function renderInventoryGroupMarkup(ctx: InventoryPanelContext) {
  const state = ctx.state;
  const potions = inventoryConsumableGroups(state);
  const allEquipment = (state.inventory || [])
    .filter((entry: any) => entry.kind === "equip")
    .sort((a: any, b: any) => itemScore(b) - itemScore(a));
  const equipment = equipmentFilterRows(ctx, allEquipment);
  const groups: Record<string, string> = {
    potions: inventoryGroup(
      "potions",
      "药剂",
      potions.length ? potions.map(potionRow).join("") : `<p>暂无药剂。</p>`
    ),
    equipment: inventoryGroup(
      "equipment",
      "装备",
      `${equipmentFilterControl(ctx)}${equipment.length ? equipment.map((entry: any) => equipmentInventoryRow(ctx, entry)).join("") : `<p>暂无符合筛选的装备。</p>`}`
    ),
    materials: inventoryGroup("materials", "材料", materialRows(state)),
    runes: inventoryGroup("runes", "符文", runeRows(ctx))
  };
  return `${inventorySubtabs(ctx)}${groups[ctx.activeInventoryTab] || groups.equipment}`;
}

export function equipmentFilterRows(ctx: InventoryPanelContext, equipment: any[]) {
  if (ctx.activeEquipmentFilter === "all") return equipment;
  return equipment.filter((entry) => entry.slot === ctx.activeEquipmentFilter);
}

export function equipmentFilterControl(ctx: InventoryPanelContext) {
  const options = [["all", "全部"], ...SLOTS.map((slot) => [slot, SLOT_NAMES[slot]])];
  return `
    <label class="inventory-filter">
      <span>类型</span>
      <select onchange="selectEquipmentFilter(this.value)">
        ${options.map(([value, label]) => `<option value="${value}" ${ctx.activeEquipmentFilter === value ? "selected" : ""}>${label}</option>`).join("")}
      </select>
    </label>
  `;
}

export function inventorySubtabs(ctx: InventoryPanelContext) {
  const tabs = [
    ["potions", "药剂"],
    ["equipment", "装备"],
    ["materials", "材料"],
    ["runes", "符文"]
  ];
  return `<div class="inventory-subtabs">${tabs.map(([id, label]) => `<button type="button" data-inventory-tab="${id}" class="${ctx.activeInventoryTab === id ? "active" : ""}" onclick="selectInventoryTab('${id}')">${label}</button>`).join("")}</div>`;
}

function inventoryGroup(type: string, title: string, body: string) {
  return `<section class="inventory-group inventory-group-${type}"><h3>${title}</h3>${body}</section>`;
}

export function inventoryConsumableGroups(state: any) {
  const groups = new Map();
  for (const entry of state.inventory || []) {
    if (!["potion", "teleport"].includes(entry.kind)) continue;
    const key =
      entry.kind === "potion"
        ? `${entry.kind}|${entry.name}|${entry.effect}|${entry.amount}`
        : `${entry.kind}|${entry.name}`;
    const group = groups.get(key) || { ...entry, count: 0 };
    group.count += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => itemScore(b) - itemScore(a));
}

export function potionRow(entry: any) {
  const count = entry.count || 1;
  if (entry.kind === "teleport") {
    return `<div class="item-row consumable-row inventory-card"><div class="item-main"><span class="item-kicker">传送</span><b>${entry.name}</b><small>传送到已探索楼层的商人、委托人或合成台附近</small></div><div class="item-side"><span class="item-quantity">x${count}</span><div class="item-actions"><button type="button" onclick="confirmUseItem('${entry.id}')">使用</button></div></div></div>`;
  }
  return `<div class="item-row consumable-row inventory-card"><div class="item-main"><span class="item-kicker">${entry.effect === "hp" ? "生命药剂" : "法力药剂"}</span><b>${entry.name}</b><span class="item-tags"><i>恢复 ${entry.amount} ${entry.effect === "hp" ? "生命" : "法力"}</i><i>评分 ${itemScore(entry)}</i></span></div><div class="item-side"><span class="item-quantity">x${count}</span><div class="item-actions"><button type="button" onclick="confirmUseItem('${entry.id}')">使用</button></div></div></div>`;
}

export function equipmentInventoryRow(ctx: InventoryPanelContext, entry: any) {
  const better = ctx.isBetterThanEquipped(entry);
  const hasCurrent = !!ctx.state.equipment?.[entry.slot];
  const compare = hasCurrent ? ctx.equipmentScoreBadge(entry, "inline-equipment-compare") : "";
  const restriction = equipmentRestrictionText(entry, ctx.state.classId);
  const equipDisabled = restriction ? `disabled title="${restriction}"` : "";
  return `<div class="item-row equip-row equipment-card inventory-card ${better ? "better-equipment" : ""}">
    <div class="item-main"><span class="item-kicker">${SLOT_NAMES[entry.slot]} · ${entry.quality}${restriction ? " · 职业不可用" : ""}</span><b>${entry.name}</b>${ctx.equipmentSummary(entry, restriction)}</div>
    <div class="item-side">
      ${compare ? `<div class="equipment-compare-corner">${compare}</div>` : ""}
      <div class="equipment-actions inventory-equipment-actions">
        <button type="button" onclick="showInventoryEquipmentDetail('${entry.id}')">详情</button>
        <button type="button" ${equipDisabled} onclick="confirmEquipItem('${entry.id}')">装备</button>
      </div>
    </div>
  </div>`;
}

export function materialRows(state: any) {
  const materials = (Object.entries(state.materials || {}) as Array<[string, number]>).filter(
    ([, count]) => count > 0
  );
  if ((state.keys || 0) > 0) materials.unshift(["符文钥匙", state.keys]);
  if ((state.universalKeys || 0) > 0) materials.unshift(["万能钥匙", state.universalKeys]);
  for (const [keyId, count] of Object.entries(state.doorKeys || {}) as Array<[string, number]>) {
    if (count > 0) materials.unshift([state.doorKeyNames?.[keyId] || "房门钥匙", count]);
  }
  return materials.length
    ? materials
        .map(
          ([name, count]) =>
            `<div class="item-row inventory-card"><div class="item-main"><span class="item-kicker">材料</span><b>${name}</b></div><div class="item-side"><span class="item-quantity">x${count}</span></div></div>`
        )
        .join("")
    : `<p>暂无材料。</p>`;
}

export function runeRows(ctx: InventoryPanelContext) {
  const runes = Object.entries(ctx.state.runes || {}).filter(([, count]) => Number(count) > 0) as Array<[string, number]>;
  return runes.length
    ? runes
        .map(
          ([name, count]) =>
            `<div class="item-row rune-row inventory-card"><div class="item-main"><span class="item-kicker">符文</span><b>${name}符文</b><small>${ctx.runeEffectText(name)}</small></div><div class="item-side"><span class="item-quantity">x${count}</span><div class="item-actions"><button type="button" ${count >= 3 ? "" : "disabled"} onclick="confirmCraftRune('${name}')">合成</button></div></div></div>`
        )
        .join("")
    : `<p>暂无符文。</p>`;
}
