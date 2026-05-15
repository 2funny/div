// @ts-nocheck
import { CLASSES, MAX_FLOOR, RUNES, SLOTS } from "../constants";
import {
  PLAYER_ELEMENT_RESIST,
  elementMatchLabel,
  elementMultiplier,
  elementName
} from "../elements";
import { QUEST_DEFS } from "../quest/quests";
import { clearBattleFx, resetBattleFx, setBattleFx } from "./combatFx";
import { discoverLorePage } from "../quest/lore";
import { choice, rand } from "../random";

// 战斗运行时聚合回合制战斗、技能升级、胜负结算和自动战斗策略。
export function createCombatRuntime(ctx) {
  const { api, battle } = ctx;
  let state = ctx.getState();
  const syncState = () => {
    state = ctx.getState();
    return state;
  };

  const closeModal = (...args) => api.closeModal(...args);
  const effectiveMaxHp = (...args) => api.effectiveMaxHp(...args);
  const effectiveMaxMp = (...args) => api.effectiveMaxMp(...args);
  const enterFloor = (...args) => api.enterFloor(...args);
  const enemyAffixText = (...args) => api.enemyAffixText(...args);
  const equipmentSummary = (...args) => api.equipmentSummary(...args);
  const itemScore = (...args) => api.itemScore(...args);
  const log = (...args) => api.log(...args);
  const openStatAllocator = (...args) => api.openStatAllocator(...args);
  const playSound = (...args) => api.playSound(...args);
  const questState = (...args) => api.questState(...args);
  const randomEquipment = (...args) => api.randomEquipment(...args);
  const render = (...args) => api.render(...args);
  const renderBattleView = (...args) => api.renderBattleView(...args);
  const saveGame = (...args) => api.saveGame(...args);
  const showEvent = (...args) => api.showEvent(...args);
  const showModal = (...args) => api.showModal(...args);
  const syncMusicToGame = (...args) => api.syncMusicToGame(...args);
  const ensureQuestList = (...args) => api.ensureQuestList(...args);
  const generateFloor = (...args) => api.generateFloor(...args);
  const roomName = (...args) => api.roomName(...args);
  const totals = (...args) => api.totals(...args);
  const useItem = (...args) => api.useItem(...args);
  // 执行玩家回合：普通攻击、技能或防御都会在这里统一进入敌方回合。
  function attackEnemy(mode, skill = null) {
    if (Date.now() < battle.inputLockedUntil) return;
    const enemy = state.currentEnemy;
    if (!enemy || Number(enemy.hp) <= 0) {
      state.currentEnemy = null;
      render();
      return;
    }
    if (mode === "skill") {
      skill = typeof skill === "string" ? skillById(skill) : skill;
      if (!skill) {
        log("技能未找到。");
        render();
        return;
      }
    }
    playSound(mode === "skill" ? "spell" : mode === "attack" ? "attack" : "guard");
    const t = totals();
    let result = "";
    resetBattleFx(mode);
    if (mode === "attack") {
      result = dealDamage(
        enemy,
        Math.max(2, t.atk * 0.92 + t.spd * 0.12 - enemy.def * 0.45),
        "普通攻击",
        currentWeaponElement()
      );
    } else if (mode === "skill") {
      skill = upgradedSkill(skill);
      if (state.mp < skill.mp) {
        log("法力不足。");
        render();
        return;
      }
      state.mp -= skill.mp;
      result = castSkill(enemy, skill, t);
    } else if (mode === "defend") {
      const block = 3 + t.def;
      state._guard = block;
      setBattleFx("hero", { type: "guard", text: `-${block}`, label: "防御" });
      setBattleFx("center", { type: "guard", text: "防御姿态" });
      result = `你进入防御姿态，准备抵挡 ${block} 点伤害。`;
    }
    log(result);
    if (enemy.hp <= 0) {
      winBattle(enemy);
    } else {
      enemyTurn(enemy);
    }
    render();
  }

  // 战斗中使用药水，喝药后敌人会立刻行动。
  function useBattlePotion(id) {
    const enemy = state.currentEnemy;
    if (!enemy) {
      useItem(id);
      return;
    }
    const index = state.inventory.findIndex((entry) => entry.id === id);
    const entry = state.inventory[index];
    if (!entry || entry.kind !== "potion") return;
    const isHp = entry.effect === "hp";
    const before = isHp ? state.hp : state.mp;
    if (isHp) state.hp = Math.min(effectiveMaxHp(), state.hp + entry.amount);
    else state.mp = Math.min(effectiveMaxMp(), state.mp + entry.amount);
    const after = isHp ? state.hp : state.mp;
    state.inventory.splice(index, 1);
    playSound("altar");
    resetBattleFx("item");
    setBattleFx("hero", {
      type: "shield",
      text: `+${Math.max(0, Math.round(after - before))}`,
      label: entry.name
    });
    setBattleFx("center", { type: "guard", text: "补给行动" });
    log(
      `战斗中使用${entry.name}，恢复 ${Math.max(0, Math.round(after - before))} 点${isHp ? "生命" : "法力"}。`
    );
    enemyTurn(enemy);
    render();
  }

  // 计算暴击并扣除敌人生命，同时返回战斗日志文本。
  function dealDamage(enemy, amount, label, element = null, options = {}) {
    if (enemy.affix?.id === "swift" && Math.random() < 0.12) {
      setBattleFx("enemy", { type: "evade", text: "闪避", label });
      return `${enemy.name}借迅捷身法避开了${label}。`;
    }
    const guard = enemy._guard || 0;
    if (guard > 0) {
      amount = Math.max(1, amount - guard);
      enemy._guard = 0;
    }
    const multiplier = elementMultiplier(element, enemy, state.classId, options);
    const crit = Math.random() < 0.06 + totals().luk * 0.008;
    const damage = Math.max(1, Math.round(amount * multiplier * (crit ? 1.7 : 1)));
    enemy.hp = Math.max(0, Math.round(enemy.hp - damage));
    const match = elementMatchLabel(multiplier);
    const elementText = elementName(element);
    const fxLabel = [label, elementText, match].filter(Boolean).join("·");
    setBattleFx("enemy", {
      type: crit ? "crit" : "hit",
      element,
      text: `-${damage}`,
      label: fxLabel
    });
    return `${label}${elementText ? `（${elementText}）` : ""}${crit ? "暴击" : ""}，造成 ${damage} 点伤害${match ? `（${match}）` : ""}。`;
  }

  // 执行职业技能效果，例如护盾、中毒、灼烧或连射。
  function castSkill(enemy, skill, t) {
    if (skill.type === "guard") {
      state._guard = 6 + t.def;
      const damage = Math.round(t.atk * skill.power);
      enemy.hp = Math.max(0, Math.round(enemy.hp - damage));
      setBattleFx("hero", { type: "guard", text: `-${state._guard}`, label: "格挡" });
      setBattleFx("enemy", { type: "hit", text: `-${damage}`, label: skill.name });
      return `格挡反击，造成 ${damage} 点伤害。`;
    }
    if (skill.type === "shield") {
      state._guard = 8 + t.mag;
      setBattleFx("hero", { type: "shield", text: `+${state._guard}`, label: skill.name });
      setBattleFx("center", { type: "shield", text: "护盾展开" });
      return `奥术护盾展开，抵挡 ${state._guard} 点伤害。`;
    }
    if (skill.type === "evade") {
      state._evade = true;
      setBattleFx("hero", { type: "evade", text: "闪避", label: skill.name });
      setBattleFx("center", { type: "evade", text: "拉开距离" });
      return "你拉开距离，下回合更容易闪避。";
    }
    if (skill.type === "double") {
      const element = currentWeaponElement();
      const d1 = dealDamage(enemy, t.atk * skill.power, "第一箭", element);
      const d2 = dealDamage(enemy, t.atk * skill.power, "第二箭", element);
      return `${d1} ${d2}`;
    }
    const base = skill.scale === "mag" ? t.mag : t.atk;
    const element = skill.element || currentWeaponElement();
    const text = dealDamage(enemy, base * skill.power + state.floor, skill.name, element, {
      pierceResist: skill.pierceResist
    });
    if (["burn", "poison"].includes(skill.type)) {
      const extra = 2 + Math.ceil(state.floor * 0.5) + (skill.statusBonus || 0);
      enemy.hp = Math.max(0, Math.round(enemy.hp - extra));
      setBattleFx("enemy", {
        type: skill.type,
        element: skill.element,
        text: `-${extra}`,
        label: skill.name
      });
    }
    if (skill.type === "weaken") enemy.atk = Math.max(1, enemy.atk - 3);
    if (skill.type === "slow") enemy.atk = Math.max(1, enemy.atk - 2);
    return text;
  }

  // 结算敌人攻击回合，包含闪避、防御减伤和死亡检测。
  function enemyTurn(enemy) {
    const t = totals();
    const dodge = Math.random() < t.spd * 0.006 + (state._evade ? 0.35 : 0);
    state._evade = false;
    if (dodge) {
      setBattleFx("hero", { type: "evade", text: "闪避", label: enemy.name });
      log(`${enemy.name}的攻击落空。`);
      return;
    }
    const skill = chooseEnemySkill(enemy);
    if (skill) {
      enemySkillTurn(enemy, skill, t);
      if (state.hp <= 0) death();
      return;
    }
    let damage = Math.max(1, Math.round(enemy.atk * 1.08 - t.def * 0.36 - t.res * 0.08));
    if (state._guard) {
      const guard = enemy.affix?.id === "shatter" ? Math.ceil(state._guard * 0.45) : state._guard;
      damage = Math.max(0, damage - guard);
      state._guard = 0;
    }
    state.hp -= damage;
    if (enemy.affix?.id === "drain" && damage > 0) {
      const heal = Math.max(1, Math.round(damage * 0.22));
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + heal);
    }
    setBattleFx("hero", {
      type: "hit",
      element: enemy.element,
      text: `-${damage}`,
      label: enemy.name
    });
    playSound("hurt");
    log(`${enemy.name}反击，造成 ${damage} 点伤害。`);
    if (state.hp <= 0) death();
  }

  function currentWeaponElement() {
    return state.equipment?.weapon?.element || null;
  }

  function chooseEnemySkill(enemy) {
    if (!enemy?.skills?.length) return null;
    const hpRatio = enemy.maxHp ? enemy.hp / enemy.maxHp : 1;
    const baseChance =
      enemy.type === "boss" ? 0.54 : enemy.type === "elite" || enemy.roomBoss ? 0.42 : 0.24;
    const candidates = enemy.skills.filter((skill) => {
      if (skill.type === "heal" && hpRatio > 0.55) return false;
      if (skill.type === "guard" && enemy._guard) return false;
      return Math.random() < (skill.chance || baseChance);
    });
    if (!candidates.length && Math.random() < baseChance * 0.35) return choice(enemy.skills);
    return candidates.length ? choice(candidates) : null;
  }

  function enemySkillTurn(enemy, skill, t) {
    if (skill.type === "guard") {
      const guard = Math.max(3, Math.round(3 + enemy.def + state.floor * 0.45));
      enemy._guard = guard;
      setBattleFx("enemy", { type: "shield", text: `+${guard}`, label: skill.name });
      log(`${enemy.name}使用${skill.name}，下一次受到的伤害降低 ${guard} 点。`);
      return;
    }
    if (skill.type === "heal") {
      const missing = Math.max(0, enemy.maxHp - enemy.hp);
      const heal = Math.max(2, Math.min(missing, Math.round(enemy.maxHp * (skill.power || 0.14))));
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + heal);
      setBattleFx("enemy", { type: "shield", text: `+${heal}`, label: skill.name });
      log(`${enemy.name}使用${skill.name}，恢复 ${heal} 点生命。`);
      return;
    }

    let damage = Math.max(
      1,
      Math.round(enemy.atk * (skill.power || 1) - t.def * 0.28 - t.res * 0.16)
    );
    const resistMultiplier = incomingElementMultiplier(skill.element);
    damage = Math.max(1, Math.round(damage * resistMultiplier));
    if (skill.type === "weaken") {
      state._guard = 0;
      damage = Math.max(1, Math.round(damage * 0.85));
    }
    if (state._guard) {
      const guard = enemy.affix?.id === "shatter" ? Math.ceil(state._guard * 0.45) : state._guard;
      damage = Math.max(0, damage - guard);
      state._guard = 0;
    }
    state.hp -= damage;
    if (skill.type === "drain" && damage > 0) {
      const heal = Math.max(1, Math.round(damage * 0.28));
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + heal);
    }
    const elementText = elementName(skill.element);
    setBattleFx("hero", {
      type: "hit",
      element: skill.element,
      text: `-${damage}`,
      label: [skill.name, elementText].filter(Boolean).join("·")
    });
    playSound("hurt");
    log(
      `${enemy.name}使用${skill.name}${elementText ? `（${elementText}）` : ""}，造成 ${damage} 点伤害${resistMultiplier < 1 ? "（装备抗性）" : ""}。`
    );
  }

  function incomingElementMultiplier(element) {
    if (!element) return 1;
    const resistances = new Set();
    for (const eq of Object.values(state.equipment || {})) {
      for (const entry of eq?.elementResistances || []) resistances.add(entry);
    }
    return resistances.has(element) ? PLAYER_ELEMENT_RESIST : 1;
  }

  function skillLevel(id) {
    return state.skillLevels?.[id] || 0;
  }

  function skillById(id) {
    return CLASSES[state.classId].skills.find((skill) => skill.id === id);
  }

  function upgradedSkill(skill) {
    const level = skillLevel(skill.id);
    const branchId = state.skillBranches?.[skill.id];
    const branch = skill.branches?.find((entry) => entry.id === branchId) || null;
    return {
      ...skill,
      level,
      branch,
      mp: Math.max(1, skill.mp + Math.floor(level / 3) + (branch?.mpDelta || 0)),
      power: Number((skill.power * (1 + level * 0.1) + (branch?.powerBonus || 0)).toFixed(2)),
      element: branch?.element || skill.element,
      statusBonus: branch?.statusBonus || 0,
      pierceResist: !!branch?.pierceResist
    };
  }

  function skillPreviewText(skill) {
    const t = totals();
    const floor = state?.floor || 1;
    const base = skill.scale === "mag" ? t.mag : t.atk;
    if (skill.type === "guard") {
      const damage = Math.max(1, Math.round(t.atk * skill.power));
      return `伤害 ${damage} · 格挡 ${6 + t.def}`;
    }
    if (skill.type === "shield") return `护盾 ${8 + t.mag}`;
    if (skill.type === "evade") return "下回合闪避 +35%";
    if (skill.type === "double") {
      const damage = Math.max(1, Math.round(t.atk * skill.power));
      return `两段伤害 ${damage} + ${damage}`;
    }
    const damage = Math.max(1, Math.round(base * skill.power + floor));
    const elementText = elementName(skill.element);
    const prefix = elementText ? `${elementText} · ` : "";
    if (skill.type === "burn")
      return `${prefix}伤害 ${damage} · 灼烧 ${2 + Math.ceil(floor * 0.5) + (skill.statusBonus || 0)}`;
    if (skill.type === "poison")
      return `${prefix}伤害 ${damage} · 中毒 ${2 + Math.ceil(floor * 0.5) + (skill.statusBonus || 0)}`;
    if (skill.type === "weaken") return `${prefix}伤害 ${damage} · 攻击 -3`;
    if (skill.type === "slow") return `${prefix}伤害 ${damage} · 攻击 -2`;
    return `${prefix}伤害 ${damage}`;
  }

  function skillUpgradeCost(skillId) {
    const nextLevel = skillLevel(skillId) + 1;
    return { points: 1, dust: nextLevel };
  }

  function canUpgradeSkill(skillId) {
    const cost = skillUpgradeCost(skillId);
    return (state.skillPoints || 0) >= cost.points && (state.skillDust || 0) >= cost.dust;
  }

  // 完成战斗结算：发放奖励、清除敌人格子，并检查 Boss 通关。
  // 胜利结算会同时处理经验、掉落、任务进度、封印解锁和楼层推进。
  function winBattle(enemy) {
    state.gold += enemy.gold;
    state.xp += enemy.xp;
    log(`击败${enemy.name}，获得 ${enemy.xp} 经验和 ${enemy.gold} 金币。`);
    const cell = state.map.cells[state.player.y][state.player.x];
    cell.object = null;
    state.currentEnemy = null;
    syncMusicToGame();
    const rewards = [`经验 +${enemy.xp}`, `金币 +${enemy.gold}`];
    recordQuestKill(enemy, rewards);
    completeStairSeal(enemy, rewards);
    rewards.push(...maybeDrop(enemy));
    const lore = discoverBattleLore(enemy);
    if (lore) rewards.push(`残页：${lore.title}`);
    const levelBefore = state.level;
    while (state.xp >= state.xpNext) levelUp();
    if (state.level > levelBefore) rewards.push(`等级提升到 Lv.${state.level}`);
    if (enemy.type === "boss") {
      showModal(
        "通关",
        `<p>第 ${MAX_FLOOR} 层的符文守王倒下了，地牢深处的王座重新安静下来。</p>${battleResultList(rewards)}`,
        [{ text: "继续整理装备", action: closeModal }]
      );
    } else {
      showModal(
        `击败 ${enemy.name}`,
        `<p>战斗结束，你清点了这次收获。</p>${battleResultList(rewards)}`,
        [{ text: "收下", action: closeModal }]
      );
    }
  }

  // 击败封印守卫后解除当前楼层下行楼梯封印。
  function completeStairSeal(enemy, rewards = []) {
    if (!enemy?.sealId || !state?.map?.cells) return false;
    const stairCell = state.map.cells
      .flat()
      .find((cell) => cell.object?.type === "stairsDown" && cell.object?.sealId === enemy.sealId);
    if (!stairCell?.object?.locked) return false;
    stairCell.object.locked = false;
    stairCell.object.seal.completed = true;
    log("下行楼梯的符文封印解除了。");
    rewards.push("下行楼梯封印已解除");
    return true;
  }

  function recordQuestKill(enemy, rewards = []) {
    if (!enemy || enemy.type === "boss") return;
    for (const quest of ensureQuestList()) {
      if (
        !quest.accepted ||
        quest.claimed ||
        quest.completed ||
        (quest.targetFloor || quest.floor) !== state.floor
      )
        continue;
      const def = QUEST_DEFS[quest.id];
      if (!def) continue;
      if (def.type === "rescueRoom" && enemy.roomId !== quest.roomId) continue;
      if (
        def.type !== "rescueRoom" &&
        quest.targetRoomName &&
        roomName(enemy.roomId) !== quest.targetRoomName
      )
        continue;
      quest.kills++;
      if (quest.kills >= quest.target) {
        quest.kills = quest.target;
        if (def.type === "rescueRoom") {
          quest.roomCleared = true;
          log(
            `${quest.roomName || roomName(quest.roomId)}已经清理，去确认${quest.rescueName || "被困者"}安全。`
          );
          rewards.push(`${quest.roomName || "目标房间"}已清理`);
          rewards.push(`去找${quest.rescueName || "被困者"}`);
          continue;
        }
        quest.completed = true;
        log(`${def.title}完成了，回到${def.giverName}处领取奖励。`);
        rewards.push(`${def.title} ${quest.kills}/${quest.target}`);
        rewards.push(`回${def.giverName}处领取奖励`);
      } else {
        rewards.push(`${def.title} ${quest.kills}/${quest.target}`);
      }
    }
  }

  // 抽取战斗后的钥匙、材料、技能尘、装备和符文掉落。
  function maybeDrop(enemy) {
    const drops = [];
    const reward = floorEffectReward();
    if (enemy.dropsKey || enemy.type === "boss") {
      state.keys = (state.keys || 0) + 1;
      log(`${enemy.name}掉落了符文钥匙。`);
      drops.push("符文钥匙 +1");
    }
    if (enemy.roomBoss || enemy.type === "boss") {
      state.materials["首领印记"] = (state.materials["首领印记"] || 0) + 1;
      drops.push("首领印记 +1");
    }
    const specialBonus = reward > 1 ? 0.08 : 0;
    const dustChance =
      enemy.type === "boss"
        ? 1
        : enemy.type === "elite"
          ? Math.min(0.95, 0.85 + specialBonus)
          : Math.min(0.42, 0.32 + specialBonus);
    if (Math.random() < dustChance) {
      const dust = Math.max(
        1,
        Math.round(
          (enemy.type === "boss" ? 5 : enemy.type === "elite" ? 2 : 1) * (reward > 1 ? 1.12 : 1)
        )
      );
      state.skillDust = (state.skillDust || 0) + dust;
      log(`获得 ${dust} 点技能尘。`);
      drops.push(`技能尘 +${dust}`);
    }
    const equipmentChance = Math.min(0.8, 0.34 + state.floor * 0.035 + specialBonus);
    if (Math.random() < equipmentChance || enemy.type !== "monster") {
      const loot = randomEquipment();
      state.inventory.push(loot);
      log(`${enemy.name}掉落了${loot.name}。`);
      drops.push(`装备：${loot.name}`);
    }
    if (Math.random() < Math.min(0.7, 0.28 + state.floor * 0.025 + specialBonus)) {
      const rune = choice(RUNES) + "1";
      state.runes[rune] = (state.runes[rune] || 0) + 1;
      log(`获得${rune}符文。`);
      drops.push(`符文：${rune}`);
    }
    if (!drops.length) drops.push("未发现额外掉落");
    return drops;
  }

  function discoverBattleLore(enemy) {
    const source =
      enemy.type === "boss" ? "boss" : enemy.type === "elite" || enemy.roomBoss ? "elite" : "";
    if (!source) return null;
    const page = discoverLorePage(state, source);
    if (page) log(`发现地牢残页：${page.title}。`);
    return page;
  }

  function floorEffectReward() {
    return state?.map?.effect?.reward || 1;
  }

  function battleResultList(rewards) {
    return `<ul class="reward-list">${rewards.map((reward) => `<li>${reward}</li>`).join("")}</ul>`;
  }

  // 提升等级，发放属性点和技能点，并刷新生命法力。
  function levelUp() {
    state.xp -= state.xpNext;
    state.level++;
    state.xpNext = 16 + state.level * 8;
    state.statPoints++;
    state.skillPoints = (state.skillPoints || 0) + 1;
    applyClassLevelGrowth();
    state.hp = effectiveMaxHp();
    state.mp = effectiveMaxMp();
    log(`升级到 Lv.${state.level}，获得 1 点属性点和 1 点技能点。`);
  }

  function applyClassLevelGrowth() {
    const growth = CLASSES[state.classId]?.growth || { hp: 3, mp: 2 };
    state.maxHp += growth.hp || 0;
    state.maxMp += growth.mp || 0;
    if (growth.primary && state.level % (growth.primaryEvery || 2) === 0) {
      state.stats[growth.primary] = (state.stats[growth.primary] || 0) + 1;
    }
    if (growth.secondary && state.level % (growth.secondaryEvery || 4) === 0) {
      state.stats[growth.secondary] = (state.stats[growth.secondary] || 0) + 1;
    }
  }

  // 处理战败：不删除存档，扣除少量金币并回到本层入口。
  function death() {
    state.hp = Math.ceil(effectiveMaxHp() * 0.55);
    state.mp = Math.ceil(effectiveMaxMp() * 0.45);
    state.gold = Math.max(0, state.gold - Math.ceil(state.gold * 0.15));
    state.currentEnemy = null;
    syncMusicToGame();
    generateFloor();
    log("你被击倒，被传送回本层入口，损失了少量金币。");
  }

  // 对低风险战斗执行一键结算，实际仍复用普通攻击/技能流程。
  function autoBattle() {
    const enemy = state.currentEnemy;
    const policy = autoBattlePolicy(enemy);
    if (!policy.allowed) {
      showEvent(
        "一键战斗评估",
        `<p>${enemy.name} 当前评估为${policy.label}，胜率约 ${Math.round(policy.score * 100)}%。${policy.reason}，建议手动战斗。</p>`,
        "知道了"
      );
      return;
    }
    showModal(
      "一键战斗评估",
      `<p>${enemy.name} 当前评估为${policy.label}，胜率约 ${Math.round(policy.score * 100)}%。</p><p>自动战斗只会尝试 3 回合，生命或法力跌破安全线会中止。</p>`,
      [
        { text: "取消", action: closeModal },
        {
          text: "开始一键战斗",
          action: () => {
            closeModal();
            executeAutoBattle();
          }
        }
      ]
    );
  }

  function executeAutoBattle() {
    let rounds = 0;
    while (
      state.currentEnemy &&
      state.hp > 0 &&
      rounds < 3 &&
      autoBattlePolicy(state.currentEnemy).allowed
    ) {
      const bestSkill = CLASSES[state.classId].skills.find(
        (skill) => state.mp >= upgradedSkill(skill).mp && skill.type !== "evade"
      );
      attackEnemy(bestSkill ? "skill" : "attack", bestSkill || null);
      rounds++;
    }
  }

  // 一键战斗准入策略：显示胜率高于 60% 时允许使用。
  function autoBattlePolicy(enemy) {
    if (!enemy) return { allowed: false, score: 0, label: "未知", reason: "没有可结算的敌人" };
    const risk = battleRisk(enemy);
    const displayedWinRate = Math.round(risk.score * 100);
    if (displayedWinRate <= 60) {
      return { ...risk, allowed: false, reason: "胜率没有超过 60%" };
    }
    return { ...risk, allowed: true, reason: "胜率高于 60%" };
  }

  // 兼容测试和老存档中缺少装备结构的场景，安全获取生命上限。
  function safeEffectiveMaxHp() {
    return state.equipment ? effectiveMaxHp() : state.maxHp;
  }

  // 兼容测试和老存档中缺少装备结构的场景，安全获取法力上限。
  function safeEffectiveMaxMp() {
    return state.equipment ? effectiveMaxMp() : state.maxMp;
  }

  // 根据玩家和敌人的综合强度估算战斗风险。
  function battleRisk(enemy) {
    const t = totals();
    const heroPower = state.hp + state.mp * 0.35 + t.atk * 7 + t.mag * 6 + t.def * 6 + t.spd * 4;
    const skillPressure =
      (enemy.skills?.length || 0) * (enemy.type === "boss" ? 28 : enemy.type === "elite" ? 18 : 10);
    const enemyPower = enemy.hp * 1.08 + enemy.atk * 12 + enemy.def * 8 + skillPressure;
    const score = heroPower / (heroPower + enemyPower);
    const label =
      score >= 0.75
        ? "碾压"
        : score >= 0.64
          ? "优势"
          : score >= 0.55
            ? "均势"
            : score >= 0.42
              ? "危险"
              : "致命";
    return { score, label };
  }

  // 消耗一个待分配属性点并提升指定基础属性。
  const withState =
    (fn) =>
    (...args) => {
      syncState();
      return fn(...args);
    };

  return {
    applyClassLevelGrowth: withState(applyClassLevelGrowth),
    attackEnemy: withState(attackEnemy),
    autoBattle: withState(autoBattle),
    autoBattlePolicy: withState(autoBattlePolicy),
    battleResultList,
    battleRisk: withState(battleRisk),
    canUpgradeSkill: withState(canUpgradeSkill),
    castSkill: withState(castSkill),
    completeStairSeal: withState(completeStairSeal),
    dealDamage: withState(dealDamage),
    death: withState(death),
    enemySkillTurn: withState(enemySkillTurn),
    enemyTurn: withState(enemyTurn),
    executeAutoBattle: withState(executeAutoBattle),
    levelUp: withState(levelUp),
    maybeDrop: withState(maybeDrop),
    recordQuestKill: withState(recordQuestKill),
    safeEffectiveMaxHp: withState(safeEffectiveMaxHp),
    safeEffectiveMaxMp: withState(safeEffectiveMaxMp),
    skillById,
    skillLevel: withState(skillLevel),
    skillPreviewText: withState(skillPreviewText),
    skillUpgradeCost: withState(skillUpgradeCost),
    upgradedSkill: withState(upgradedSkill),
    useBattlePotion: withState(useBattlePotion),
    winBattle: withState(winBattle)
  };
}
