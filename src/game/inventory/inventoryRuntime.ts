import { ASSETS, RUNES, SLOT_NAMES, SLOTS, STAT_NAMES } from "../constants";
import {
  enhanceCostForEquipment,
  equipmentQualityConfig,
  equipmentSalvageValueForEquipment,
  equipmentSellValueFromScore,
  merchantUniversalKeyChance,
  merchantUniversalKeyPrice,
  shopGoodConfig
} from "../constants/balance";
import { equipmentRestrictionText, isWeaponUsableByClass } from "../equipment/equipmentRules";
import { itemScore } from "../equipment/equipmentScoring";
import { cardinalNeighbors, cellsWithin, distance } from "../floor/mapGeometry";
import { merchantPriceFactor, merchantTrust, relationLabel } from "../quest/narrative";
import { random } from "../random";
import { branchEffectTags } from "../render/skillBranchText";
import { advanceTutorial } from "../tutorial/tutorial";
import type { GameMap, GameState, StatKey } from "../types";

type StatDraft = {
  points: number;
  stats: Record<StatKey, number>;
};

// 背包运行时负责装备穿脱、消耗品、属性点、强化、商店和传送道具。
export function createInventoryRuntime(ctx) {
  const { api, draft } = ctx;
  let state = ctx.getState();
  const syncState = () => {
    state = ctx.getState();
    return state;
  };

  const canUpgradeSkill = (...args) => api.canUpgradeSkill(...args);
  const closeModal = (...args) => api.closeModal(...args);
  const effectiveMaxHp = (...args) => api.effectiveMaxHp(...args);
  const effectiveMaxMp = (...args) => api.effectiveMaxMp(...args);
  const equipmentCompareText = (...args) => api.equipmentCompareText(...args);
  const equipmentDetailMarkup = (...args) => api.equipmentDetailMarkup(...args);
  const equipmentSummary = (...args) => api.equipmentSummary(...args);
  const log = (...args) => api.log(...args);
  const cloneFloorMap = (...args) => api.cloneFloorMap(...args);
  const openQuestFromGiver = (...args) => api.openQuestFromGiver(...args);
  const playSound = (...args) => api.playSound(...args);
  const potion = (...args) => api.potion(...args);
  const questDefinitionsForGiver = (...args) => api.questDefinitionsForGiver(...args);
  const randomEquipment = (...args) => api.randomEquipment(...args);
  const render = (...args) => api.render(...args);
  const renderCraft = (...args) => api.renderCraft(...args);
  const renderEquipment = (...args) => api.renderEquipment(...args);
  const renderInventory = (...args) => api.renderInventory(...args);
  const renderSkills = (...args) => api.renderSkills(...args);
  const runeEffectText = (...args) => api.runeEffectText(...args);
  const showConfirm = (...args) => api.showConfirm(...args);
  const showEvent = (...args) => api.showEvent(...args);
  const showModal = (...args) => api.showModal(...args);
  const showToast = (...args) => api.showToast(...args);
  const learnSkill = (...args) => api.learnSkill(...args);
  const skillRequirementText = (...args) => api.skillRequirementText(...args);
  const skillScrollItem = (...args) => api.skillScrollItem?.(...args);
  const saveCurrentFloor = (...args) => api.saveCurrentFloor(...args);
  const skillById = (...args) => api.skillById(...args);
  const skillLevel = (...args) => api.skillLevel(...args);
  const skillUpgradeCost = (...args) => api.skillUpgradeCost(...args);
  const sprite = (...args) => api.sprite(...args);
  const statsText = (...args) => api.statsText(...args);
  const teleportBeacon = (...args) => api.teleportBeacon(...args);
  const upgradedSkill = (...args) => api.upgradedSkill(...args);
  const updateVisibility = (...args) => api.updateVisibility(...args);

  function addStat(key) {
    if (state.statPoints <= 0) return;
    state.stats[key]++;
    state.statPoints--;
    if (key === "def") state.maxHp += 2;
    if (key === "res") state.maxMp += 2;
    render();
  }

  function confirmAddStat(key) {
    if (state.statPoints <= 0) return;
    openStatAllocator(key);
  }

  // 打开属性点分配草稿，玩家确认前不会直接改写角色属性。
  function openStatAllocator(preferredKey = "atk") {
    draft.value = {
      points: state.statPoints,
      stats: Object.fromEntries(Object.keys(STAT_NAMES).map((key) => [key, 0]))
    };
    adjustStatDraft(preferredKey, 1, false);
    renderStatAllocator();
  }

  function adjustStatDraft(key, delta, redraw = true) {
    const current = draft.value as StatDraft | null;
    if (!current) return;
    const statKey = key as StatKey;
    const next = (current.stats[statKey] || 0) + delta;
    if (next < 0) return;
    const used = Object.values(current.stats).reduce((sum, value) => sum + value, 0);
    if (delta > 0 && used >= current.points) return;
    current.stats[statKey] = next;
    if (redraw) renderStatAllocator();
  }

  function renderStatAllocator() {
    const current = draft.value as StatDraft;
    const used = Object.values(current.stats).reduce((sum, value) => sum + value, 0);
    const left = current.points - used;
    showModal(
      "分配属性点",
      `
    <div class="stat-allocator">
      <div class="allocator-summary">剩余 <b>${left}</b> / ${current.points}</div>
      ${Object.entries(STAT_NAMES)
        .map(([key, name]) => {
          const extra = key === "def" ? "生命上限 +4" : key === "res" ? "法力上限 +3" : "";
          const statKey = key as StatKey;
          return `<div class="allocator-row">
          <div><b>${name}</b><small>当前 ${state.stats[statKey] || 0}${extra ? ` · ${extra}` : ""}</small></div>
          <div class="stepper">
            <button type="button" onclick="adjustStatDraft('${key}', -1)">-</button>
            <span>${current.stats[statKey] || 0}</span>
            <button type="button" ${left <= 0 ? "disabled" : ""} onclick="adjustStatDraft('${key}', 1)">+</button>
          </div>
        </div>`;
        })
        .join("")}
    </div>
  `,
      [
        { text: "取消", action: closeModal },
        { text: "保存分配", action: applyStatDraft }
      ]
    );
  }

  function applyStatDraft() {
    const current = draft.value as StatDraft | null;
    if (!current) return;
    const beforeHpMax = effectiveMaxHp();
    const beforeMpMax = effectiveMaxMp();
    for (const [key, value] of Object.entries(current.stats) as Array<[StatKey, number]>) {
      if (!value) continue;
      state.stats[key] = (state.stats[key] || 0) + value;
      if (key === "def") state.maxHp += value * 2;
      if (key === "res") state.maxMp += value * 2;
      state.statPoints -= value;
    }
    adjustVitalsForMaxChange(beforeHpMax, beforeMpMax);
    log("保存属性点分配。");
    closeModal();
    render();
  }

  // 判断当前物件是否会阻挡移动，必须先交互才能继续。
  function isBlockingInteraction(obj) {
    if (!obj) return false;
    if (
      ["shop", "forge", "guideNpc", "questNpc", "rescueNpc", "fenceGate", "lockedDoor"].includes(
        obj.type
      )
    )
      return true;
    if (obj.type === "lockedChest") return (state.keys || 0) <= 0;
    return false;
  }

  // 装备背包中的物品，并把原装备放回背包。
  function equipItem(id) {
    const index = state.inventory.findIndex((entry) => entry.id === id);
    const entry = state.inventory[index];
    if (!entry || entry.kind !== "equip") return;
    if (!isWeaponUsableByClass(entry, state.classId)) {
      showEvent("无法装备", `<p>${equipmentRestrictionText(entry, state.classId)}。</p>`, "知道了");
      return;
    }
    const beforeHpMax = effectiveMaxHp();
    const beforeMpMax = effectiveMaxMp();
    const old = state.equipment[entry.slot];
    state.equipment[entry.slot] = entry;
    state.inventory.splice(index, 1);
    if (old) state.inventory.push(old);
    adjustVitalsForMaxChange(beforeHpMax, beforeMpMax);
    advanceTutorial(state, "equip");
    log(`装备了${entry.name}。`);
    render();
  }

  function confirmEquipItem(id) {
    const entry = state.inventory.find((item) => item.id === id);
    if (!entry) return;
    const restriction = equipmentRestrictionText(entry, state.classId);
    if (restriction) {
      showEvent("无法装备", `<p>${restriction}。</p><p>可以出售或分解这件装备。</p>`, "知道了");
      return;
    }
    showConfirm(
      "装备确认",
      `<p>要装备 ${entry.name} 吗？当前同部位装备会放回背包。</p>${equipmentCompareText(entry)}`,
      "装备",
      () => equipItem(id)
    );
  }

  // 计算装备出售价格，评分和强化等级越高价格越高。
  function equipmentSellValue(entry) {
    return equipmentSellValueFromScore(itemScore(entry), entry?.level || 0);
  }

  // 计算装备分解收益，用于产出魔尘和少量强化石。
  function equipmentSalvageValue(entry) {
    return equipmentSalvageValueForEquipment(entry);
  }

  // 判断玩家是否位于商人身边，出售装备必须满足该条件。
  function canSellEquipmentHere() {
    if (!state?.map?.cells || !state.player) return false;
    const here = state.map.cells[state.player.y]?.[state.player.x];
    if (here?.object?.type === "shop") return true;
    return cardinalNeighbors(state.map.cells, state.player.x, state.player.y).some(
      (cell) => cell.object?.type === "shop"
    );
  }

  // 出售背包装备，只有在商人附近才允许执行。
  function sellEquipment(id) {
    if (!canSellEquipmentHere()) {
      showEvent(
        "需要商人",
        "<p>售出装备需要和商人交谈，在商人对话里的“售出装备”处理。装备分解也在商人交易窗口里。</p>",
        "知道了"
      );
      return;
    }
    const index = state.inventory.findIndex((entry) => entry.id === id && entry.kind === "equip");
    const entry = state.inventory[index];
    if (!entry) return;
    const gold = equipmentSellValue(entry);
    state.inventory.splice(index, 1);
    state.gold = (state.gold || 0) + gold;
    playSound("sell");
    log(`售出${entry.name}，获得 ${gold} 金币。`);
    render();
  }

  // 分解背包装备，随时可执行并产出强化/技能相关材料。
  function disassembleEquipment(id) {
    const index = state.inventory.findIndex((entry) => entry.id === id && entry.kind === "equip");
    const entry = state.inventory[index];
    if (!entry) return;
    const reward = equipmentSalvageValue(entry);
    state.inventory.splice(index, 1);
    state.materials["魔尘"] = (state.materials["魔尘"] || 0) + reward.dust;
    if (reward.stones) state.materials["强化石"] = (state.materials["强化石"] || 0) + reward.stones;
    playSound("sell");
    log(
      `分解${entry.name}，获得魔尘 ${reward.dust}${reward.stones ? `、强化石 ${reward.stones}` : ""}。`
    );
    render();
  }

  function confirmSellEquipment(id) {
    const entry = state.inventory.find((item) => item.id === id && item.kind === "equip");
    if (!entry) return;
    if (!canSellEquipmentHere()) {
      showEvent(
        "需要商人",
        "<p>售出装备需要和商人交谈，在商人对话里的“售出装备”处理。装备分解也在商人交易窗口里。</p>",
        "知道了"
      );
      return;
    }
    showConfirm(
      "售出装备",
      `<p>售出 ${entry.name}，获得 ${equipmentSellValue(entry)} 金币。</p>`,
      "售出",
      () => sellEquipment(id)
    );
  }

  function confirmDisassembleEquipment(id) {
    const entry = state.inventory.find((item) => item.id === id && item.kind === "equip");
    if (!entry) return;
    const reward = equipmentSalvageValue(entry);
    showConfirm(
      "分解装备",
      `<p>分解 ${entry.name}，获得魔尘 ${reward.dust}${reward.stones ? `、强化石 ${reward.stones}` : ""}。</p>`,
      "分解",
      () => disassembleEquipment(id)
    );
  }

  // 拆下指定槽位装备，并同步修正生命法力上限变化。
  function unequipItem(slot) {
    const eq = state.equipment[slot];
    if (!eq) return;
    const beforeHpMax = effectiveMaxHp();
    const beforeMpMax = effectiveMaxMp();
    state.equipment[slot] = null;
    state.inventory.push(eq);
    adjustVitalsForMaxChange(beforeHpMax, beforeMpMax);
    log(`拆下了${eq.name}。`);
    render();
  }

  // 装备变化后按上限差值调整当前生命和法力，避免异常溢出。
  function adjustVitalsForMaxChange(beforeHpMax, beforeMpMax) {
    const hpMax = effectiveMaxHp();
    const mpMax = effectiveMaxMp();
    state.hp = clampVital((state.hp || 0) + hpMax - beforeHpMax, hpMax);
    state.mp = clampVital((state.mp || 0) + mpMax - beforeMpMax, mpMax);
  }

  function clampVital(value, max) {
    return Math.max(1, Math.min(max, value));
  }

  function canUnequipSlot(slot) {
    return !!state.equipment[slot];
  }

  function confirmUnequip(slot) {
    const eq = state.equipment[slot];
    if (!eq) return;
    showConfirm("拆下装备", `<p>要拆下 ${eq.name} 吗？装备会放回背包。</p>`, "拆下", () =>
      unequipItem(slot)
    );
  }

  // 使用背包中的消耗品药水。
  function useItem(id) {
    const index = state.inventory.findIndex((entry) => entry.id === id);
    const entry = state.inventory[index];
    if (!entry) return;
    if (entry.kind === "teleport") {
      openTeleportBeacon(id);
      return;
    }
    if (entry.kind === "skillScroll") {
      if (entry.classId && entry.classId !== state.classId) {
        showEvent("无法学习", `<p>${entry.name}不属于当前职业。</p>`, "知道了");
        return;
      }
      const learned = learnSkill(entry.skillId, "研读卷轴");
      if (learned) state.inventory.splice(index, 1);
      return;
    }
    if (entry.kind !== "potion") return;
    if (entry.effect === "hp") state.hp = Math.min(effectiveMaxHp(), state.hp + entry.amount);
    if (entry.effect === "mp") state.mp = Math.min(effectiveMaxMp(), state.mp + entry.amount);
    state.inventory.splice(index, 1);
    log(`使用${entry.name}。`);
    render();
  }

  function confirmUseItem(id) {
    const entry = state.inventory.find((item) => item.id === id);
    if (!entry) return;
    if (entry.kind === "teleport") {
      openTeleportBeacon(id);
      return;
    }
    if (entry.kind === "skillScroll") {
      showConfirm(
        "研读卷轴",
        `<p>要研读 ${entry.name} 吗？</p><p>${skillRequirementText(api.skillById(entry.skillId))}</p>`,
        "学习",
        () => useItem(id)
      );
      return;
    }
    showConfirm(
      "使用确认",
      `<p>要使用 ${entry.name} 吗？</p><p>效果：恢复 ${entry.amount} 点${entry.effect === "hp" ? "生命" : "法力"}。</p>`,
      "使用",
      () => useItem(id)
    );
  }

  // 打开商路信标传送列表，只显示已探索楼层中的商人、NPC 和合成台。
  // 传送信标只允许跳到当前楼层已发现的重要交互点附近。
  function openTeleportBeacon(id) {
    const targets = knownTeleportTargets();
    if (!targets.length) {
      showEvent(
        "商路信标",
        "<p>暂时没有可传送目标。探索到商人、委托人或合成台后再使用。</p>",
        "知道了"
      );
      return;
    }
    window._teleportTargets = targets;
    showModal(
      "商路信标",
      `
    <div class="quest-list">
      ${targets
        .slice(0, 8)
        .map(
          (target, index) =>
            `<article class="quest-row"><div><b>${target.label}</b><small>第 ${target.floor} 层 · ${target.roomName || "已探索区域"}</small></div><button type="button" onclick="teleportAction('${id}', ${index})">传送</button></article>`
        )
        .join("")}
    </div>
  `,
      [{ text: "取消", action: closeModal }]
    );
  }

  // 收集当前楼层和楼层缓存中可作为传送目标的已探索设施。
  function knownTeleportTargets() {
    const targets = [];
    const addFromMap = (floor, map) => {
      if (!map?.cells) return;
      for (const cell of map.cells.flat()) {
        if (!cell.seen || !["shop", "questNpc", "rescueNpc", "forge"].includes(cell.object?.type))
          continue;
        const landing = landingNear(map, cell.x, cell.y);
        if (!landing) continue;
        targets.push({
          floor: Number(floor),
          x: cell.x,
          y: cell.y,
          landing,
          label: teleportTargetLabel(cell.object),
          roomName: cell.roomId ? roomNameFromMap(map, cell.roomId) : ""
        });
      }
    };
    addFromMap(state.floor, state.map);
    for (const [floor, saved] of Object.entries(state.floorStates || {}) as Array<
      [string, Partial<GameState>]
    >)
      addFromMap(floor, saved.map as GameMap);
    return targets.sort(
      (a, b) => Math.abs(a.floor - state.floor) - Math.abs(b.floor - state.floor)
    );
  }

  // 为传送目标寻找可落脚的相邻格，避免直接站到阻挡型 NPC 或设施上。
  function landingNear(map, x, y) {
    const origin = map.cells[y]?.[x];
    const candidates = [origin, ...cardinalNeighbors(map.cells, x, y)];
    return (
      candidates.find(
        (cell) =>
          cell && ["floor", "door"].includes(cell.terrain) && !isBlockingInteraction(cell.object)
      ) || null
    );
  }

  // 生成传送目标展示名。
  function teleportTargetLabel(obj) {
    if (obj.type === "shop") return "商人";
    if (obj.type === "forge") return "合成台";
    return obj.npcName || (obj.type === "rescueNpc" ? "被困者" : "委托人");
  }

  // 从指定地图对象中查找房间名，避免跨楼层读取当前 state.map。
  function roomNameFromMap(map, roomId) {
    return map?.rooms?.find((room) => room.id === roomId)?.name || "未知房间";
  }

  // 弹窗按钮回调：按下标执行传送。
  function teleportAction(id, index) {
    teleportToTarget(id, window._teleportTargets?.[index]);
  }

  // 消耗商路信标并传送到目标楼层的目标附近。
  function teleportToTarget(id, target) {
    if (!target) return;
    const index = state.inventory.findIndex(
      (entry) => entry.id === id && entry.kind === "teleport"
    );
    if (index < 0) return;
    saveCurrentFloor();
    if (target.floor !== state.floor) {
      const saved = state.floorStates?.[target.floor];
      if (!saved?.map) return;
      state.floor = target.floor;
      state.map = cloneFloorMap(saved.map);
    }
    state.player = { ...target.landing };
    state.inventory.splice(index, 1);
    updateVisibility();
    log(`商路信标将你传送到第 ${state.floor} 层的${target.label}附近。`);
    closeModal();
    render();
  }

  // 将三个同名同级符文合成为下一级符文。
  function craftRune(name) {
    if ((state.runes[name] || 0) < 3) return;
    const level = Number(name.slice(-1));
    const base = name.slice(0, -1);
    state.runes[name] -= 3;
    const next = base + (level + 1);
    state.runes[next] = (state.runes[next] || 0) + 1;
    log(`合成${next}符文。`);
    render();
  }

  function confirmCraftRune(name) {
    if ((state.runes[name] || 0) < 3) return;
    const level = Number(name.slice(-1));
    const base = name.slice(0, -1);
    showConfirm(
      "合成确认",
      `<p>消耗 3 个 ${name}，合成 1 个 ${base + (level + 1)} 符文。</p>`,
      "合成",
      () => craftRune(name)
    );
  }

  // 消耗金币和强化石强化已装备物品。
  function enhance(slot) {
    const eq = state.equipment[slot];
    if (!canEnhance(slot)) return;
    const cost = enhanceCost(eq);
    state.materials["强化石"] -= cost.stones;
    state.gold -= cost.gold;
    eq.level++;
    log(`${eq.name}强化到 +${eq.level}。`);
    render();
  }

  function confirmEnhance(slot) {
    const eq = state.equipment[slot];
    if (!canEnhance(slot)) return;
    const cost = enhanceCost(eq);
    showConfirm(
      "锻造强化",
      `<p>在合成台消耗 ${cost.gold} 金币和 ${cost.stones} 个强化石，将 ${eq.name} 强化到 +${eq.level + 1}。</p>`,
      "强化",
      () => enhance(slot)
    );
  }

  function canEnhance(slot) {
    const eq = state.equipment[slot];
    if (!eq) return false;
    const cost = enhanceCost(eq);
    return (state.materials["强化石"] || 0) >= cost.stones && state.gold >= cost.gold;
  }

  function enhanceDisabledReason(slot) {
    const eq = state.equipment[slot];
    if (!eq) return "未装备";
    const cost = enhanceCost(eq);
    if ((state.materials["强化石"] || 0) < cost.stones) return `缺少强化石（需要 ${cost.stones}）`;
    if (state.gold < cost.gold) return `金币不足（需要 ${cost.gold}）`;
    return "";
  }

  function enhanceCost(eq) {
    return enhanceCostForEquipment(eq);
  }

  // 消耗技能点和技能尘提升指定技能等级。
  function upgradeSkill(skillId, branchId = null) {
    if (!canUpgradeSkill(skillId)) return;
    const cost = skillUpgradeCost(skillId);
    state.skillPoints -= cost.points;
    state.skillDust -= cost.dust;
    state.skillLevels[skillId] = skillLevel(skillId) + 1;
    const skill = skillById(skillId);
    const branch = branchId ? skill?.branches?.find((entry) => entry.id === branchId) : null;
    if (branch) {
      state.skillBranches = state.skillBranches || {};
      state.skillBranches[skillId] = branch.id;
    }
    log(
      `${skill.name}提升到 Lv.${state.skillLevels[skillId]}${branch ? `，选择${branch.name}分支` : ""}。`
    );
    if (branch) closeModal();
    render();
  }

  function confirmUpgradeSkill(skillId) {
    const skill = skillById(skillId);
    if (!skill || !canUpgradeSkill(skillId)) return;
    const cost = skillUpgradeCost(skillId);
    const currentLevel = skillLevel(skillId);
    const current = upgradedSkill(skill);
    const nextLevel = currentLevel + 1;
    const currentBranch =
      skill.branches?.find((entry) => entry.id === state.skillBranches?.[skillId]) || null;
    const nextPower = Number(
      (skill.power * (1 + nextLevel * 0.075) + (currentBranch?.powerBonus || 0)).toFixed(2)
    );
    const nextMp = Math.max(
      1,
      skill.mp + Math.floor(nextLevel / 3) + (currentBranch?.mpDelta || 0)
    );
    const shouldChooseBranch =
      nextLevel >= 3 && skill.branches?.length && !state.skillBranches?.[skillId];
    if (shouldChooseBranch) {
      showModal(
        "技能分支选择",
        `<p>将 ${skill.name} 升到 Lv.${nextLevel} 时，需要选择一个长期分支。</p><div class="branch-choice-list">${skill.branches
          .map(
            (branch) =>
              `<button type="button" class="branch-choice" onclick="upgradeSkill('${skillId}', '${branch.id}')"><b>${branch.name}</b><small>${branch.desc}</small><span class="item-tags">${branchEffectTags(branch, "稳定分支")}</span></button>`
          )
          .join("")}</div><p>消耗 ${cost.points} 点技能点和 ${cost.dust} 点技能尘。</p>`,
        [{ text: "取消", action: closeModal }]
      );
      return;
    }
    showConfirm(
      "技能升级确认",
      `<p>消耗 ${cost.points} 点技能点和 ${cost.dust} 点技能尘，将 ${skill.name} 升到 Lv.${nextLevel}。</p><p>倍率 ${current.power} → ${nextPower}，耗蓝 ${current.mp} → ${nextMp}。</p>`,
      "升级",
      () => upgradeSkill(skillId)
    );
  }

  // 在商人处购买基础消耗品。
  function buy(kind) {
    let bought = false;
    const goods = merchantPurchasePreview(kind);
    if (kind === "hp" && state.gold >= goods.price) {
      state.gold -= goods.price;
      state.inventory.push(potion(goods.name, "hp", goods.amount));
      log(`购买${goods.name}。`);
      bought = true;
    }
    if (kind === "mp" && state.gold >= goods.price) {
      state.gold -= goods.price;
      state.inventory.push(potion(goods.name, "mp", goods.amount));
      log(`购买${goods.name}。`);
      bought = true;
    }
    if (kind === "beacon" && state.gold >= goods.price) {
      state.gold -= goods.price;
      state.inventory.push(teleportBeacon());
      log(`购买${goods.name}。`);
      bought = true;
    }
    if (kind === "universalKey") {
      const merchant = currentMerchant();
      const price = universalKeyPrice();
      if (!merchant || !merchantSellsUniversalKey(merchant) || merchant.universalKeySold) {
        log("这名商人没有可售的万能钥匙。");
        render();
        return;
      }
      if (state.gold >= price) {
        state.gold -= price;
        state.universalKeys = (state.universalKeys || 0) + 1;
        merchant.universalKeySold = true;
        log("购买万能钥匙。");
        bought = true;
      }
    }
    if (!bought) log("金币不足，交易没有完成。");
    render();
  }

  // 打开商人主弹窗，商人既能交易、收购装备，也可能提供任务。
  function openMerchant() {
    const merchant = currentMerchant();
    const hasTask = questDefinitionsForGiver("shop").length > 0;
    const trust = merchantTrust(state);
    const actions = [
      { text: "打开商店", action: openMerchantShop },
      { text: "售出装备", action: openMerchantSell }
    ];
    if (hasTask) actions.push({ text: "查看任务", action: () => openQuestFromGiver("shop") });
    actions.push({ text: "离开", action: closeModal });
    showModal(
      "流动商队",
      `
    <div class="merchant-panel">
      <div class="merchant-hero">
        <div class="merchant-portrait">${sprite("merchant", ASSETS.shop, "商人")}</div>
        <div class="merchant-copy">
          <b>流动补给</b>
          <small>商人拦住去路。购买、售出和分解都要在这里处理；偶尔也会带来路面委托。当前关系：${relationLabel(state, "merchants")} · 信任 ${trust}</small>
        </div>
      </div>
    </div>
  `,
      actions
    );
  }

  // 打开商店商品、随机装备和装备分解列表。
  function openMerchantShop() {
    const salvageRows = merchantSalvageRows();
    const merchant = currentMerchant();
    const equipmentRows = merchantEquipmentRows(merchant);
    const sellsUniversalKey = merchantSellsUniversalKey(merchant);
    const universalKeyRow = sellsUniversalKey
      ? `<button type="button" ${merchant.universalKeySold ? "disabled" : ""} onclick="confirmBuy('universalKey')"><span>${merchantPurchasePreview("universalKey").name}</span><small>${merchant.universalKeySold ? "已售出" : `${merchantPurchasePreview("universalKey").desc} · ${merchantPurchasePreview("universalKey").price} 金币`}</small></button>`
      : "";
    const hpGoods = merchantPurchasePreview("hp");
    const mpGoods = merchantPurchasePreview("mp");
    const beaconGoods = merchantPurchasePreview("beacon");
    showModal(
      "流动商队",
      `
    <div class="merchant-panel">
      <div class="merchant-hero">
        <div class="merchant-portrait">${sprite("merchant", ASSETS.shop, "商人")}</div>
        <div class="merchant-copy">
          <b>流动补给</b>
          <small>金币 ${state.gold}。货物会随楼层进度随机刷新，好装备只会偶尔出现。</small>
        </div>
      </div>
      <div class="merchant-goods">
        <button type="button" onclick="confirmBuy('hp')"><span>${hpGoods.name}</span><small>${hpGoods.desc} · ${hpGoods.price} 金币</small></button>
        <button type="button" onclick="confirmBuy('mp')"><span>${mpGoods.name}</span><small>${mpGoods.desc} · ${mpGoods.price} 金币</small></button>
        <button type="button" onclick="confirmBuy('beacon')"><span>${beaconGoods.name}</span><small>${beaconGoods.desc} · ${beaconGoods.price} 金币</small></button>
        ${universalKeyRow}
        ${equipmentRows}
      </div>
      <div class="merchant-salvage-list">
        <b>装备分解</b>
        <small>分解在商人交易窗口里进行，会获得魔尘，少数装备会返还强化石。</small>
        ${salvageRows}
      </div>
    </div>
  `,
      [{ text: "离开", action: closeModal }]
    );
  }

  function openMerchantSell() {
    showModal(
      "售出装备",
      `
    <div class="merchant-panel">
      <div class="merchant-hero">
        <div class="merchant-portrait">${sprite("merchant", ASSETS.shop, "商人")}</div>
        <div class="merchant-copy">
          <b>装备收购</b>
          <small>售出只在和商人交谈时开放，装备栏里不会再显示售出按钮。</small>
        </div>
      </div>
      <div class="merchant-salvage-list">
        <b>装备售出</b>
        ${merchantSellRows()}
      </div>
    </div>
  `,
      [
        { text: "返回商队", action: openMerchant },
        { text: "离开", action: closeModal }
      ]
    );
  }

  function currentMerchant() {
    return currentMerchantCell()?.object || null;
  }

  function currentMerchantCell() {
    if (!state?.map?.cells || !state.player) return null;
    const here = state.map.cells[state.player.y]?.[state.player.x];
    if (here?.object?.type === "shop") return here;
    return (
      cardinalNeighbors(state.map.cells, state.player.x, state.player.y).find(
        (cell) => cell.object?.type === "shop"
      ) || null
    );
  }

  function merchantSellsUniversalKey(merchant = currentMerchant()) {
    if (!merchant) return false;
    if (merchant.sellsUniversalKey === undefined) {
      merchant.sellsUniversalKey =
        random() < merchantUniversalKeyChance(state.floor, merchantTrust(state));
    }
    return !!merchant.sellsUniversalKey;
  }

  function universalKeyPrice() {
    return merchantUniversalKeyPrice(merchantPriceFactor(state));
  }

  function merchantPurchasePreview(kind) {
    const goods = shopGoodConfig(kind);
    const fixedPrice = "price" in goods ? goods.price : 0;
    return {
      kind,
      name: goods.name,
      desc: goods.desc,
      amount: goods.amount,
      price: kind === "universalKey" ? universalKeyPrice() : fixedPrice
    };
  }

  function ensureMerchantStock(merchant = currentMerchant()) {
    if (!merchant) return [];
    if (!merchant.stock) {
      merchant.stock = Array.from({ length: merchantStockCount() }, () => {
        const goods = randomEquipment();
        return {
          id: goods.id,
          item: goods,
          price: merchantEquipmentPrice(goods),
          sold: false
        };
      });
      const scroll = merchantSkillScrollItem();
      if (scroll) {
        merchant.stock.push({
          id: scroll.id,
          item: scroll,
          price: merchantSkillScrollPrice(scroll),
          sold: false
        });
      }
    }
    return merchant.stock;
  }

  function merchantStockCount() {
    return 1 + (random() < 0.55 ? 1 : 0) + (state.floor >= 8 && random() < 0.18 ? 1 : 0);
  }

  function merchantEquipmentPrice(entry) {
    const qualityBonus = equipmentQualityConfig(entry.quality).merchantPriceBonus;
    return Math.max(
      24,
      Math.round((itemScore(entry) * 1.45 + state.floor * 5 + qualityBonus) * merchantPriceFactor(state))
    );
  }

  function merchantSkillScrollItem() {
    if (state.floor < 4) return null;
    const trustBonus = Math.max(0, merchantTrust(state)) * 0.015;
    const chance = Math.min(0.24, 0.06 + state.floor * 0.003 + trustBonus);
    if (random() >= chance) return null;
    const candidates = (api.classSkills?.() || []).filter((skill) => {
      if (api.isSkillLearned?.(skill.id)) return false;
      const levelReq = Number(skill.requires?.level || 1);
      const floorReq = Number(skill.requires?.floor || 1);
      return levelReq <= state.floor + 4 && floorReq <= state.floor + 3;
    });
    const skill = candidates.sort((a, b) => (a.requires?.level || 1) - (b.requires?.level || 1))[0];
    return skill ? skillScrollItem(skill.id) : null;
  }

  function merchantSkillScrollPrice(scroll) {
    const skill = skillById(scroll.skillId);
    const reqLevel = Number(skill?.requires?.level || 2);
    return Math.max(48, Math.round((44 + reqLevel * 9 + state.floor * 2) * merchantPriceFactor(state)));
  }

  function merchantStockItem(id) {
    const stock = ensureMerchantStock();
    return stock.find((entry) => entry.id === id);
  }

  function merchantEquipmentRows(merchant = currentMerchant()) {
    const stock = ensureMerchantStock(merchant).filter((entry) => !entry.sold);
    if (!stock.length) return `<p>今天没有合适装备。</p>`;
    return stock
      .map(({ id, item: goods, price }) => {
        if (goods.kind === "skillScroll") {
          const skill = skillById(goods.skillId);
          return `<button type="button" onclick="confirmBuyMerchantEquipment('${id}')"><span>${goods.name}</span><small>技能卷轴 · ${skill ? skillRequirementText(skill) : "未知技能"} · ${price} 金币</small></button>`;
        }
        const summary = [
          SLOT_NAMES[goods.slot],
          goods.quality,
          statsText(goods) || "无属性",
          `${price} 金币`
        ].join(" · ");
        return `<button type="button" onclick="confirmBuyMerchantEquipment('${id}')"><span>${goods.name}</span><small>${summary}</small></button>`;
      })
      .join("");
  }

  function confirmBuyMerchantEquipment(id) {
    const entry = merchantStockItem(id);
    if (!entry || entry.sold) {
      showEvent("货物已售", "<p>这件装备已经不在商人的货架上了。</p>", "知道了");
      return;
    }
    if (entry.item.kind === "skillScroll") {
      showConfirm(
        "购买技能卷轴",
        `<p>花费 ${entry.price} 金币购买 ${entry.item.name}。</p><p>${skillRequirementText(skillById(entry.item.skillId))}</p>`,
        "购买",
        () => buyMerchantEquipment(id)
      );
      return;
    }
    showConfirm(
      "购买装备",
      `<p>花费 ${entry.price} 金币购买 ${entry.item.name}？</p><p>${statsText(entry.item) || "无属性"}</p>`,
      "购买",
      () => buyMerchantEquipment(id)
    );
  }

  function buyMerchantEquipment(id) {
    const entry = merchantStockItem(id);
    if (!entry || entry.sold) return;
    if ((state.gold || 0) < entry.price) {
      log("金币不足，交易没有完成。");
      render();
      return;
    }
    state.gold -= entry.price;
    entry.sold = true;
    state.inventory.push(entry.item);
    log(`购买${entry.item.name}。`);
    render();
  }

  function merchantSellRows() {
    const equipment = (state.inventory || []).filter((entry) => entry.kind === "equip");
    if (!equipment.length) return `<p>暂无可售出装备。</p>`;
    return equipment
      .map((entry) => {
        const price = equipmentSellValue(entry);
        return `<div class="merchant-salvage-row"><span>${entry.name}<small>${SLOT_NAMES[entry.slot]} · ${entry.quality} · ${price} 金币</small></span><button type="button" onclick="confirmSellEquipment('${entry.id}')">售出</button></div>`;
      })
      .join("");
  }

  function merchantSalvageRows() {
    const equipment = (state.inventory || []).filter((entry) => entry.kind === "equip");
    if (!equipment.length) return `<p>暂无可分解装备。</p>`;
    return equipment
      .map((entry) => {
        const reward = equipmentSalvageValue(entry);
        const rewardText = `魔尘 ${reward.dust}${reward.stones ? ` · 强化石 ${reward.stones}` : ""}`;
        return `<div class="merchant-salvage-row"><span>${entry.name}<small>${rewardText}</small></span><button type="button" onclick="confirmDisassembleEquipment('${entry.id}')">分解</button></div>`;
      })
      .join("");
  }

  // 打开合成台弹窗，集中展示可强化装备和缺失材料原因。
  function openForge() {
    const rows = SLOTS.map((slot) => {
      const eq = state.equipment[slot];
      const reason = enhanceDisabledReason(slot);
      return `<div class="forge-row">
      <div>
        <b>${SLOT_NAMES[slot]}</b>
        ${eq ? `<span>${eq.name} +${eq.level}</span><small>${statsText(eq)}${reason ? ` · ${reason}` : " · 可强化"}</small>` : "<small>未装备</small>"}
      </div>
      <button type="button" ${reason ? "disabled" : ""} onclick="confirmEnhance('${slot}')">强化</button>
    </div>`;
    }).join("");
    showModal(
      "合成台",
      `
    <div class="forge-panel">
      <div class="forge-summary">强化费用会随装备品质和强化等级提高。当前：金币 ${state.gold}，强化石 ${state.materials["强化石"] || 0}。</div>
      ${rows}
    </div>
  `,
      [{ text: "离开", action: closeModal }]
    );
  }

  // 渲染开始界面，提供继续存档和新游戏入口。
  const withState =
    (fn) =>
    (...args) => {
      syncState();
      return fn(...args);
    };

  return {
    addStat: withState(addStat),
    adjustStatDraft: withState(adjustStatDraft),
    adjustVitalsForMaxChange: withState(adjustVitalsForMaxChange),
    buy: withState(buy),
    canEnhance: withState(canEnhance),
    canSellEquipmentHere: withState(canSellEquipmentHere),
    canUnequipSlot: withState(canUnequipSlot),
    clampVital,
    confirmAddStat: withState(confirmAddStat),
    confirmBuyMerchantEquipment: withState(confirmBuyMerchantEquipment),
    confirmCraftRune: withState(confirmCraftRune),
    confirmDisassembleEquipment: withState(confirmDisassembleEquipment),
    confirmEnhance: withState(confirmEnhance),
    confirmEquipItem: withState(confirmEquipItem),
    confirmSellEquipment: withState(confirmSellEquipment),
    confirmUnequip: withState(confirmUnequip),
    confirmUpgradeSkill: withState(confirmUpgradeSkill),
    confirmUseItem: withState(confirmUseItem),
    craftRune: withState(craftRune),
    disassembleEquipment: withState(disassembleEquipment),
    enhance: withState(enhance),
    enhanceDisabledReason: withState(enhanceDisabledReason),
    equipItem: withState(equipItem),
    equipmentSalvageValue: withState(equipmentSalvageValue),
    equipmentSellValue: withState(equipmentSellValue),
    isBlockingInteraction,
    knownTeleportTargets: withState(knownTeleportTargets),
    landingNear,
    merchantPurchasePreview: withState(merchantPurchasePreview),
    merchantSellRows: withState(merchantSellRows),
    merchantSalvageRows: withState(merchantSalvageRows),
    openForge: withState(openForge),
    openMerchant: withState(openMerchant),
    openMerchantSell: withState(openMerchantSell),
    openMerchantShop: withState(openMerchantShop),
    openStatAllocator: withState(openStatAllocator),
    openTeleportBeacon: withState(openTeleportBeacon),
    renderStatAllocator: withState(renderStatAllocator),
    roomNameFromMap,
    sellEquipment: withState(sellEquipment),
    teleportAction: withState(teleportAction),
    teleportTargetLabel,
    teleportToTarget: withState(teleportToTarget),
    unequipItem: withState(unequipItem),
    upgradeSkill: withState(upgradeSkill),
    useItem: withState(useItem)
  };
}
