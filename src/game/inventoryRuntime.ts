// @ts-nocheck
import { ASSETS, RUNES, SLOT_NAMES, SLOTS, STAT_NAMES } from "./data";
import { cardinalNeighbors, cellsWithin, distance } from "./mapGeometry";

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
  const itemScore = (...args) => api.itemScore(...args);
  const log = (...args) => api.log(...args);
  const cloneFloorMap = (...args) => api.cloneFloorMap(...args);
  const openQuestFromGiver = (...args) => api.openQuestFromGiver(...args);
  const playSound = (...args) => api.playSound(...args);
  const potion = (...args) => api.potion(...args);
  const questDefinitionsForGiver = (...args) => api.questDefinitionsForGiver(...args);
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
    if (!draft.value) return;
    const next = (draft.value.stats[key] || 0) + delta;
    if (next < 0) return;
    const used = Object.values(draft.value.stats).reduce((sum, value) => sum + value, 0);
    if (delta > 0 && used >= draft.value.points) return;
    draft.value.stats[key] = next;
    if (redraw) renderStatAllocator();
  }

  function renderStatAllocator() {
    const used = Object.values(draft.value.stats).reduce((sum, value) => sum + value, 0);
    const left = draft.value.points - used;
    showModal(
      "分配属性点",
      `
    <div class="stat-allocator">
      <div class="allocator-summary">剩余 <b>${left}</b> / ${draft.value.points}</div>
      ${Object.entries(STAT_NAMES)
        .map(([key, name]) => {
          const extra = key === "def" ? "生命上限 +4" : key === "res" ? "法力上限 +3" : "";
          return `<div class="allocator-row">
          <div><b>${name}</b><small>当前 ${state.stats[key] || 0}${extra ? ` · ${extra}` : ""}</small></div>
          <div class="stepper">
            <button type="button" onclick="adjustStatDraft('${key}', -1)">-</button>
            <span>${draft.value.stats[key] || 0}</span>
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
    if (!draft.value) return;
    const beforeHpMax = effectiveMaxHp();
    const beforeMpMax = effectiveMaxMp();
    for (const [key, value] of Object.entries(draft.value.stats)) {
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
    if (["shop", "forge", "questNpc", "rescueNpc", "fenceGate", "lockedDoor"].includes(obj.type))
      return true;
    if (obj.type === "lockedChest") return (state.keys || 0) <= 0;
    return false;
  }

  // 装备背包中的物品，并把原装备放回背包。
  function equipItem(id) {
    const index = state.inventory.findIndex((entry) => entry.id === id);
    const entry = state.inventory[index];
    if (!entry || entry.kind !== "equip") return;
    const beforeHpMax = effectiveMaxHp();
    const beforeMpMax = effectiveMaxMp();
    const old = state.equipment[entry.slot];
    state.equipment[entry.slot] = entry;
    state.inventory.splice(index, 1);
    if (old) state.inventory.push(old);
    adjustVitalsForMaxChange(beforeHpMax, beforeMpMax);
    log(`装备了${entry.name}。`);
    render();
  }

  function confirmEquipItem(id) {
    const entry = state.inventory.find((item) => item.id === id);
    if (!entry) return;
    showConfirm(
      "装备确认",
      `<p>要装备 ${entry.name} 吗？当前同部位装备会放回背包。</p>${equipmentCompareText(entry)}`,
      "装备",
      () => equipItem(id)
    );
  }

  // 计算装备出售价格，评分和强化等级越高价格越高。
  function equipmentSellValue(entry) {
    return Math.max(6, Math.round(itemScore(entry) * 0.55 + (entry.level || 0) * 8));
  }

  // 计算装备分解收益，用于产出魔尘和少量强化石。
  function equipmentSalvageValue(entry) {
    const qualityDust = { 普通: 1, 优秀: 1, 稀有: 2, 史诗: 3, 传说: 4 }[entry.quality] || 1;
    const stones = entry.level > 0 || ["史诗", "传说"].includes(entry.quality) ? 1 : 0;
    return { dust: qualityDust + Math.floor((entry.level || 0) / 2), stones };
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
      showEvent("需要商人", "<p>售出装备需要在商人身边进行。分解装备可以随时操作。</p>", "知道了");
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
      showEvent("需要商人", "<p>售出装备需要在商人身边进行。分解装备可以随时操作。</p>", "知道了");
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
    for (const [floor, saved] of Object.entries(state.floorStates || {}))
      addFromMap(floor, saved.map);
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
    state.materials["强化石"]--;
    state.gold -= 20;
    eq.level++;
    log(`${eq.name}强化到 +${eq.level}。`);
    render();
  }

  function confirmEnhance(slot) {
    const eq = state.equipment[slot];
    if (!canEnhance(slot)) return;
    showConfirm(
      "锻造强化",
      `<p>在合成台消耗 20 金币和 1 个强化石，将 ${eq.name} 强化到 +${eq.level + 1}。</p>`,
      "强化",
      () => enhance(slot)
    );
  }

  function canEnhance(slot) {
    const eq = state.equipment[slot];
    return !!eq && (state.materials["强化石"] || 0) > 0 && state.gold >= 20;
  }

  function enhanceDisabledReason(slot) {
    const eq = state.equipment[slot];
    if (!eq) return "未装备";
    if ((state.materials["强化石"] || 0) <= 0) return "缺少强化石";
    if (state.gold < 20) return "金币不足";
    return "";
  }

  // 消耗技能点和技能尘提升指定技能等级。
  function upgradeSkill(skillId) {
    if (!canUpgradeSkill(skillId)) return;
    const cost = skillUpgradeCost(skillId);
    state.skillPoints -= cost.points;
    state.skillDust -= cost.dust;
    state.skillLevels[skillId] = skillLevel(skillId) + 1;
    const skill = skillById(skillId);
    log(`${skill.name}提升到 Lv.${state.skillLevels[skillId]}。`);
    render();
  }

  function confirmUpgradeSkill(skillId) {
    const skill = skillById(skillId);
    if (!skill || !canUpgradeSkill(skillId)) return;
    const cost = skillUpgradeCost(skillId);
    const next = upgradedSkill({ ...skill, id: skill.id });
    const currentLevel = skillLevel(skillId);
    const nextPower = Number((skill.power * (1 + (currentLevel + 1) * 0.14)).toFixed(2));
    const nextMp = Math.max(1, skill.mp - Math.floor((currentLevel + 1) / 2));
    showConfirm(
      "技能升级确认",
      `<p>消耗 ${cost.points} 点技能点和 ${cost.dust} 点技能尘，将 ${skill.name} 升到 Lv.${currentLevel + 1}。</p><p>倍率 ${next.power} → ${nextPower}，耗蓝 ${next.mp} → ${nextMp}。</p>`,
      "升级",
      () => upgradeSkill(skillId)
    );
  }

  // 在商人处购买基础消耗品。
  function buy(kind) {
    let bought = false;
    if (kind === "hp" && state.gold >= 12) {
      state.gold -= 12;
      state.inventory.push(potion("小型生命药水", "hp", 18));
      log("购买小型生命药水。");
      bought = true;
    }
    if (kind === "mp" && state.gold >= 12) {
      state.gold -= 12;
      state.inventory.push(potion("小型法力药水", "mp", 12));
      log("购买小型法力药水。");
      bought = true;
    }
    if (kind === "beacon" && state.gold >= 45) {
      state.gold -= 45;
      state.inventory.push(teleportBeacon());
      log("购买商路信标。");
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

  // 打开商人主弹窗，商人既能交易也可能提供任务。
  // 商人弹窗提供购买入口，装备出售入口由背包列表根据距离动态开放。
  function openMerchant() {
    const hasTask = questDefinitionsForGiver("shop").length > 0;
    if (!hasTask) {
      openMerchantShop();
      return;
    }
    showModal(
      "流动商队",
      `
    <div class="merchant-panel">
      <div class="merchant-hero">
        <div class="merchant-portrait">${sprite("merchant", ASSETS.shop, "商人")}</div>
        <div class="merchant-copy">
          <b>流动补给</b>
          <small>商人拦住去路，既能交易，也有需要冒险者处理的路面麻烦。</small>
        </div>
      </div>
    </div>
  `,
      [
        { text: "打开商店", action: openMerchantShop },
        { text: "查看任务", action: () => openQuestFromGiver("shop") },
        { text: "离开", action: closeModal }
      ]
    );
  }

  // 打开商店商品和装备分解列表。
  function openMerchantShop() {
    const salvageRows = merchantSalvageRows();
    const merchant = currentMerchant();
    const sellsUniversalKey = merchantSellsUniversalKey(merchant);
    const universalKeyRow = sellsUniversalKey
      ? `<button type="button" ${merchant.universalKeySold ? "disabled" : ""} onclick="confirmBuy('universalKey')"><span>万能钥匙</span><small>${merchant.universalKeySold ? "已售出" : `打开任意上锁房门 · ${universalKeyPrice()} 金币`}</small></button>`
      : "";
    showModal(
      "流动商队",
      `
    <div class="merchant-panel">
      <div class="merchant-hero">
        <div class="merchant-portrait">${sprite("merchant", ASSETS.shop, "商人")}</div>
        <div class="merchant-copy">
          <b>流动补给</b>
          <small>金币 ${state.gold}。商人挡住去路，交易后可从旁边绕行。</small>
        </div>
      </div>
      <div class="merchant-goods">
        <button type="button" onclick="confirmBuy('hp')"><span>小型生命药水</span><small>恢复 18 HP · 12 金币</small></button>
        <button type="button" onclick="confirmBuy('mp')"><span>小型法力药水</span><small>恢复 12 MP · 12 金币</small></button>
        <button type="button" onclick="confirmBuy('beacon')"><span>商路信标</span><small>传送到已探索设施 · 45 金币</small></button>
        ${universalKeyRow}
      </div>
      <div class="merchant-salvage-list">
        <b>装备分解</b>
        ${salvageRows}
      </div>
    </div>
  `,
      [{ text: "离开", action: closeModal }]
    );
  }

  function currentMerchant() {
    if (!state?.map?.cells || !state.player) return null;
    const here = state.map.cells[state.player.y]?.[state.player.x];
    if (here?.object?.type === "shop") return here.object;
    return (
      cardinalNeighbors(state.map.cells, state.player.x, state.player.y).find(
        (cell) => cell.object?.type === "shop"
      )?.object || null
    );
  }

  function merchantSellsUniversalKey(merchant = currentMerchant()) {
    if (!merchant) return false;
    if (merchant.sellsUniversalKey === undefined) {
      const luck = state.stats?.luk || 0;
      merchant.sellsUniversalKey =
        Math.random() < Math.min(0.48, 0.2 + state.floor * 0.018 + luck * 0.01);
    }
    return !!merchant.sellsUniversalKey;
  }

  function universalKeyPrice() {
    return 58;
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
      <div class="forge-summary">强化装备需要 <b>20 金币</b> 和 <b>1 个强化石</b>。当前：金币 ${state.gold}，强化石 ${state.materials["强化石"] || 0}。</div>
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
    merchantSalvageRows: withState(merchantSalvageRows),
    openForge: withState(openForge),
    openMerchant: withState(openMerchant),
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
