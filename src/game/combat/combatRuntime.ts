import { CLASSES, MAX_FLOOR, RUNES, SLOTS } from "../constants";
import {
  PLAYER_ELEMENT_RESIST,
  elementMatchLabel,
  elementMultiplier,
  elementName
} from "./elements";
import { QUEST_DEFS } from "../quest/quests";
import { clearBattleFx, resetBattleFx, setBattleFx } from "./combatFx";
import { discoverLorePage } from "../quest/lore";
import { advanceTutorial } from "../tutorial/tutorial";
import { choice, rand, random } from "../random";
import type { DamageStatus } from "../types/combat";

const BASE_DODGE = 0.03;
const SPEED_DODGE_SCALE = 0.005;
const EVADE_SKILL_DODGE_BONUS = 0.35;
const CHANCE_CAP = 0.95;
const CRIT_BASE = 0.06;
const CRIT_LUCK_SCALE = 0.008;
const DAMAGE_STATUS_TURNS = 3;
const PLAYER_TO_ENEMY_DELAY = 920;
const ENEMY_TURN_RECOVERY_DELAY = 120;

// 战斗运行时聚合回合制战斗、技能升级、胜负结算和自动战斗策略。
export function createCombatRuntime(ctx) {
  const { api, battle } = ctx;
  let state = ctx.getState();
  let enemyTurnTimer = null;
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
  function attackEnemy(mode, skill = null, immediateEnemyTurn = false) {
    if (Date.now() < battle.inputLockedUntil) return;
    if (enemyTurnTimer) return;
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
      result = basicAttack(enemy, t, "普通攻击");
      if (enemy.hp > 0 && shouldTriggerRangerCombo(t)) {
        result += ` ${basicAttack(enemy, t, "连击")}`;
      }
    } else if (mode === "skill") {
      skill = upgradedSkill(skill);
      const cooldown = skillCooldownRemaining(skill.id);
      if (cooldown > 0) {
        log(`技能冷却中，还需 ${cooldown} 回合。`);
        render();
        return;
      }
      if (state.mp < skill.mp) {
        log("法力不足。");
        render();
        return;
      }
      state.mp -= skill.mp;
      result = castSkill(enemy, skill, t);
      setSkillCooldown(skill);
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
      finishPlayerAction(enemy, immediateEnemyTurn);
      return;
    }
    render();
  }

  function finishPlayerAction(enemy, immediateEnemyTurn = false) {
    if (!applyEnemyStatuses(enemy)) {
      winBattle(enemy);
      render();
      return;
    }
    setBattlePhase("enemy-windup", `${enemy.name}锁定了你`, "enemy");
    if (immediateEnemyTurn) {
      enemyTurn(enemy);
      if (state.currentEnemy && state.hp > 0) {
        tickSkillCooldowns();
        setBattlePhase("player-turn", "你的回合", "hero");
      }
      render();
      return;
    }
    scheduleEnemyTurn(enemy);
    render();
  }

  function scheduleEnemyTurn(enemy) {
    if (enemyTurnTimer) clearTimeout(enemyTurnTimer);
    const delay = PLAYER_TO_ENEMY_DELAY;
    battle.inputLockedUntil = Date.now() + delay + ENEMY_TURN_RECOVERY_DELAY;
    enemyTurnTimer = setTimeout(() => {
      enemyTurnTimer = null;
      syncState();
      if (!state.currentEnemy || state.currentEnemy !== enemy || Number(enemy.hp) <= 0 || state.hp <= 0) {
        render();
        return;
      }
      resetBattleFx("enemy-turn");
      setBattlePhase("enemy-action", `${enemy.name}发动反击`, "enemy");
      enemyTurn(enemy);
      if (state.currentEnemy && state.hp > 0) {
        tickSkillCooldowns();
        setBattlePhase("player-turn", "你的回合", "hero");
      }
      battle.inputLockedUntil = Date.now() + ENEMY_TURN_RECOVERY_DELAY;
      render();
    }, delay);
  }

  function setBattlePhase(phase, message = "", actor = "") {
    battle.phase = phase;
    battle.message = message;
    battle.actor = actor;
  }

  // 战斗中使用药水，喝药后敌人会立刻行动。
  function useBattlePotion(id, immediateEnemyTurn = false) {
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
    finishPlayerAction(enemy, immediateEnemyTurn);
  }

  // 计算暴击并扣除敌人生命，同时返回战斗日志文本。
  function dealDamage(enemy, amount, label, element = null, options: any = {}) {
    const bonus = consumeNextDamageBonus(0);
    if (bonus > 0) amount *= 1 + bonus;
    if (enemy.affix?.id === "swift" && random() < 0.12) {
      setBattleFx("enemy", { type: "evade", text: "闪避", label });
      return `${enemy.name}借迅捷身法避开了${label}。`;
    }
    const guard = enemy._guard || 0;
    if (guard > 0) {
      amount = Math.max(1, amount - guard);
      enemy._guard = 0;
    }
    const multiplier = elementMultiplier(element, enemy, state.classId, options);
    const crit = random() < critChance(totals());
    const damage = Math.max(1, Math.round(amount * multiplier * (crit ? 1.7 : 1)));
    enemy.hp = Math.max(0, Math.round(enemy.hp - damage));
    if (typeof options.onHit === "function") options.onHit({ damage, multiplier, crit });
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

  function basicAttack(enemy, t, label = "普通攻击") {
    return dealDamage(enemy, basicAttackDamage(t, enemy), label, currentWeaponElement());
  }

  function basicAttackDamage(t, enemy) {
    return Math.max(2, t.atk * 1 - (enemy.def || 0) * 0.45);
  }

  function shouldTriggerRangerCombo(t) {
    return random() < passiveChance("ranger_combo", t);
  }

  function rangerComboChance(t) {
    return passiveChance("ranger_combo", t);
  }

  function shouldTriggerRangerSkillFollowUp(t) {
    return random() < passiveChance("ranger_followup", t);
  }

  function rangerSkillFollowUpChance(t) {
    return passiveChance("ranger_followup", t);
  }

  function passiveById(id) {
    return CLASSES[state.classId]?.passives?.find((passive) => passive.id === id) || null;
  }

  function passiveChance(id, t) {
    const passive = passiveById(id);
    if (!passive) return 0;
    const max = Math.min(CHANCE_CAP, passive.chanceMax ?? CHANCE_CAP);
    return clampChance((passive.chanceBase || 0) + (t.spd || 0) * (passive.chancePerSpeed || 0), max);
  }

  function passiveValue(id, fallback = 0) {
    const passive = passiveById(id);
    return Number(passive?.value ?? fallback);
  }

  function critChance(t) {
    return clampChance(CRIT_BASE + (t.luk || 0) * CRIT_LUCK_SCALE);
  }

  function dodgeChance(t, bonus = 0) {
    return clampChance(BASE_DODGE + (t.spd || 0) * SPEED_DODGE_SCALE + bonus);
  }

  function clampChance(value, max = CHANCE_CAP) {
    return Math.max(0, Math.min(max, Number(value) || 0));
  }

  function skillDamageAmount(skill, t, enemy) {
    const hasMultiScale =
      skill.atkMultiplier != null ||
      skill.magMultiplier != null ||
      skill.hpMultiplier != null ||
      skill.defMultiplier != null ||
      skill.baseDamage != null;
    const baseDamage = Number(skill.baseDamage || 0);
    const raw = hasMultiScale
      ? baseDamage +
        (t.atk || 0) * Number(skill.atkMultiplier || 0) +
        (t.mag || 0) * Number(skill.magMultiplier || 0) +
        (state.maxHp || 0) * Number(skill.hpMultiplier || 0) +
        (t.def || 0) * Number(skill.defMultiplier || 0)
      : (skill.scale === "mag" ? t.mag : t.atk) * skill.power;
    const physicalWeight = skill.magMultiplier && !skill.atkMultiplier ? 0.18 : 0.3;
    const mitigation = (enemy.def || 0) * physicalWeight;
    return Math.max(2, raw + state.floor - mitigation);
  }

  // 执行职业技能效果，例如护盾、中毒、灼烧或连射。
  function castSkill(enemy, skill, t) {
    if (skill.type === "guard") {
      state._guard = 6 + t.def;
      setBattleFx("hero", { type: "guard", text: `-${state._guard}`, label: "格挡" });
      return dealDamage(enemy, skillDamageAmount(skill, t, enemy), "格挡反击", currentWeaponElement());
    }
    if (skill.type === "shield") {
      state._guard = Math.max(1, Math.round(8 + t.mag * skill.power));
      setBattleFx("hero", { type: "shield", text: `+${state._guard}`, label: skill.name });
      setBattleFx("center", { type: "shield", text: "护盾展开" });
      return `奥术护盾展开，抵挡 ${state._guard} 点伤害。`;
    }
    if (skill.type === "evade") {
      state._evade = true;
      const damageBonus = evadeDamageBonus(skill);
      if (damageBonus > 0) state._nextDamageBonus = Math.max(state._nextDamageBonus || 0, damageBonus);
      setBattleFx("hero", { type: "evade", text: "闪避", label: skill.name });
      setBattleFx("center", { type: "evade", text: "拉开距离" });
      return `你拉开距离，下回合更容易闪避${damageBonus > 0 ? `，下次伤害提高 ${Math.round(damageBonus * 100)}%` : ""}。`;
    }
    if (skill.type === "double") {
      const element = currentWeaponElement();
      let text = dealDamage(enemy, skillDamageAmount(skill, t, enemy), skill.name, element);
      if (enemy.hp > 0 && shouldTriggerRangerSkillFollowUp(t)) {
        text += ` ${dealDamage(enemy, basicAttackDamage(t, enemy) * passiveValue("ranger_followup", 0.65), "追击", element)}`;
      }
      return text;
    }
    const element = skill.element || currentWeaponElement();
    let text = dealDamage(enemy, skillDamageAmount(skill, t, enemy), skill.name, element, {
      pierceResist: skill.pierceResist,
      onHit: () => {
        if (["burn", "poison"].includes(skill.type)) {
          const extra = statusDamageAmount(skill);
          applyDamageStatus(enemy, skill, extra);
          setBattleFx("enemy", {
            type: skill.type,
            element: skill.element,
            text: `${extra}x${DAMAGE_STATUS_TURNS}`,
            label: skill.name
          });
        }
        if (skill.type === "weaken") enemy.atk = Math.max(1, enemy.atk - 3);
        if (skill.type === "slow") enemy.atk = Math.max(1, enemy.atk - 2);
      }
    });
    if (enemy.hp > 0 && shouldTriggerRangerSkillFollowUp(t)) {
      text += ` ${dealDamage(enemy, basicAttackDamage(t, enemy) * passiveValue("ranger_followup", 0.65), "追击", element)}`;
    }
    return text;
  }

  function statusDamageAmount(skill) {
    return 2 + Math.ceil(state.floor * 0.5) + (skill.statusBonus || 0);
  }

  function applyDamageStatus(enemy, skill, damage) {
    enemy.statuses = enemy.statuses || {};
    enemy.statuses[skill.type] = {
      type: skill.type,
      name: skill.type === "burn" ? "灼烧" : "中毒",
      damage,
      turns: DAMAGE_STATUS_TURNS,
      element: skill.element
    };
  }

  function applyEnemyStatuses(enemy) {
    const statuses = Object.values(enemy.statuses || {}).filter(
      (status): status is DamageStatus => Boolean(status)
    );
    if (!statuses.length) return true;
    const entries = [];
    for (const status of statuses) {
      const damage = Math.max(1, Math.round(status.damage || 0));
      enemy.hp = Math.max(0, Math.round(enemy.hp - damage));
      status.turns = Math.max(0, Number(status.turns || 0) - 1);
      entries.push(`${status.name}造成 ${damage} 点伤害`);
      setBattleFx("enemy", {
        type: status.type,
        element: status.element,
        text: `-${damage}`,
        label: status.name
      });
    }
    for (const [type, status] of Object.entries(enemy.statuses || {}) as [
      string,
      DamageStatus | undefined
    ][]) {
      if (!status || status.turns <= 0 || enemy.hp <= 0) delete enemy.statuses[type];
    }
    log(`${enemy.name}受到${entries.join("，")}。`);
    return enemy.hp > 0;
  }

  function evadeDamageBonus(skill) {
    return Math.max(0, (skill.power || 1) - 1);
  }

  function consumeNextDamageBonus(amount = 1) {
    const bonus = state._nextDamageBonus || 0;
    if (bonus > 0) state._nextDamageBonus = 0;
    if (amount === 0) return bonus;
    return amount * (1 + bonus);
  }

  // 结算敌人攻击回合，包含闪避、防御减伤和死亡检测。
  function enemyTurn(enemy) {
    const t = totals();
    const dodge = random() < dodgeChance(t, state._evade ? EVADE_SKILL_DODGE_BONUS : 0);
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
    const filteredSkills = enemy.skills.filter((skill) => {
      if (skill.type === "heal" && hpRatio > 0.55) return false;
      if (skill.type === "guard" && enemy._guard) return false;
      return true;
    });
    const candidates = filteredSkills.filter((skill) => {
      return random() < (skill.chance || baseChance);
    });
    if (!candidates.length && filteredSkills.length && random() < baseChance * 0.35)
      return choice(filteredSkills);
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
    for (const eq of Object.values(state.equipment || {}) as any[]) {
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
    const scale = 1 + level * 0.1;
    const power = Number((skill.power * scale + (branch?.powerBonus || 0)).toFixed(2));
    const multiplierBonus = branch?.powerBonus || 0;
    return {
      ...skill,
      level,
      branch,
      mp: Math.max(1, skill.mp + Math.floor(level / 3) + (branch?.mpDelta || 0)),
      cooldown: Math.max(0, (skill.cooldown ?? 1) + (branch?.cooldownDelta || 0)),
      power,
      atkMultiplier:
        skill.atkMultiplier == null
          ? undefined
          : Number((skill.atkMultiplier * scale + multiplierBonus).toFixed(2)),
      magMultiplier:
        skill.magMultiplier == null
          ? undefined
          : Number((skill.magMultiplier * scale + multiplierBonus).toFixed(2)),
      hpMultiplier:
        skill.hpMultiplier == null
          ? undefined
          : Number((skill.hpMultiplier * scale + multiplierBonus).toFixed(2)),
      defMultiplier:
        skill.defMultiplier == null
          ? undefined
          : Number((skill.defMultiplier * scale + multiplierBonus).toFixed(2)),
      element: branch?.element || skill.element,
      statusBonus: branch?.statusBonus || 0,
      pierceResist: !!branch?.pierceResist
    };
  }

  function skillCooldownRemaining(skillId) {
    return Math.max(0, Number(state.skillCooldowns?.[skillId] || 0));
  }

  function setSkillCooldown(skill) {
    if (!skill.cooldown) return;
    state.skillCooldowns = state.skillCooldowns || {};
    state.skillCooldowns[skill.id] = skill.cooldown;
  }

  function tickSkillCooldowns() {
    if (!state.skillCooldowns) return;
    for (const [skillId, turns] of Object.entries(state.skillCooldowns)) {
      const next = Math.max(0, Number(turns) - 1);
      if (next > 0) state.skillCooldowns[skillId] = next;
      else delete state.skillCooldowns[skillId];
    }
  }

  function skillPreviewText(skill) {
    const t = totals();
    const floor = state?.floor || 1;
    const enemy = state.currentEnemy || { def: 0 };
    if (skill.type === "guard") {
      const damage = Math.max(1, Math.round(skillDamageAmount(skill, t, enemy)));
      return `伤害 ${damage} · 格挡 ${6 + t.def}`;
    }
    if (skill.type === "shield") return `护盾 ${Math.max(1, Math.round(8 + t.mag * skill.power))}`;
    if (skill.type === "evade") {
      const bonus = evadeDamageBonus(skill);
      return `下回合闪避 +35%${bonus > 0 ? ` · 下次伤害 +${Math.round(bonus * 100)}%` : ""}`;
    }
    if (skill.type === "double") {
      const damage = Math.max(1, Math.round(skillDamageAmount(skill, t, enemy)));
      return `伤害 ${damage} · 追击 ${Math.round(rangerSkillFollowUpChance(t) * 100)}%`;
    }
    const damage = Math.max(1, Math.round(skillDamageAmount(skill, t, enemy)));
    const elementText = elementName(skill.element);
    const prefix = elementText ? `${elementText} · ` : "";
    if (skill.type === "burn")
      return `${prefix}伤害 ${damage} · 灼烧 ${statusDamageAmount(skill)}x${DAMAGE_STATUS_TURNS}`;
    if (skill.type === "poison")
      return `${prefix}伤害 ${damage} · 中毒 ${statusDamageAmount(skill)}x${DAMAGE_STATUS_TURNS}`;
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
    const cell = currentBattleCell(enemy);
    if (cell?.object === enemy) cell.object = null;
    else if (cell?.object && Number(cell.object.hp) <= 0) cell.object = null;
    delete state._battleCell;
    state.currentEnemy = null;
    state.skillCooldowns = {};
    setBattlePhase("idle");
    advanceTutorial(state, "battle");
    syncMusicToGame();
    const rewards = [`经验 +${enemy.xp}`, `金币 +${enemy.gold}`];
    recordQuestKill(enemy, rewards);
    completeStairSeal(enemy, rewards);
    rewards.push(...maybeDrop(enemy));
    const lore = discoverBattleLore(enemy);
    if (lore) rewards.push(`残页：${lore.title}`);
    state._nextDamageBonus = 0;
    const levelBefore = state.level;
    while (state.xp >= state.xpNext) levelUp();
    if (state.level > levelBefore) rewards.push(`等级提升到 Lv.${state.level}`);
    if (enemy.type === "boss") {
      showModal(
        "通关",
        `<p>第 ${MAX_FLOOR} 层的符文守王倒下了，地牢深处的王座重新安静下来。</p>${battleResultList(rewards, "最终战利品")}`,
        [{ text: "继续整理装备", action: closeModal }]
      );
    } else {
      showModal(
        `击败 ${enemy.name}`,
        battleResultList(rewards, "战斗收获"),
        [{ text: "收下", action: closeModal }]
      );
    }
  }

  function currentBattleCell(enemy) {
    const tracked = state._battleCell;
    if (tracked) {
      const cell = state.map?.cells?.[tracked.y]?.[tracked.x];
      if (cell) return cell;
    }
    const playerCell = state.map?.cells?.[state.player?.y]?.[state.player?.x];
    if (playerCell?.object === enemy) return playerCell;
    return state.map?.cells?.flat?.().find((cell) => cell.object === enemy) || playerCell || null;
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

  // 抽取战斗后的钥匙、材料、技能尘、装备、符文和额外金币。
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
    if (enemy.type === "boss") dropEquipment(enemy, drops);
    const rolls = lootRollCount(enemy, reward);
    for (let i = 0; i < rolls; i++) rollLootDrop(enemy, drops, reward);
    if (!drops.length) drops.push("未发现额外掉落");
    return drops;
  }

  function lootRollCount(enemy, reward = 1) {
    const base = enemy.type === "boss" ? 3 : enemy.type === "elite" || enemy.roomBoss ? 2 : 1;
    const extraChance =
      enemy.type === "boss"
        ? 0.75
        : enemy.type === "elite" || enemy.roomBoss
          ? 0.42
          : Math.min(0.38, 0.16 + state.floor * 0.008);
    return base + (random() < extraChance + (reward > 1 ? 0.1 : 0) ? 1 : 0);
  }

  function rollLootDrop(enemy, drops, reward = 1) {
    const noneChance = enemy.type === "monster" ? 0.2 : enemy.type === "elite" ? 0.06 : 0;
    if (random() < noneChance) return false;
    const roll = random();
    const equipmentWeight =
      enemy.type === "boss" ? 0.42 : enemy.type === "elite" || enemy.roomBoss ? 0.34 : 0.2;
    const runeWeight = equipmentWeight + (enemy.type === "boss" ? 0.2 : 0.22);
    const dustWeight = runeWeight + (enemy.type === "boss" ? 0.18 : 0.2);
    const materialWeight = dustWeight + 0.14;
    if (roll < equipmentWeight) return dropEquipment(enemy, drops);
    if (roll < runeWeight) return dropRune(drops);
    if (roll < dustWeight) return dropSkillDust(enemy, drops, reward);
    if (roll < materialWeight) return dropMaterial(drops, reward);
    return dropBonusGold(enemy, drops, reward);
  }

  function dropEquipment(enemy, drops) {
    const loot = randomEquipment();
    state.inventory.push(loot);
    log(`${enemy.name}掉落了${loot.name}。`);
    drops.push(`装备：${loot.name}`);
    return true;
  }

  function dropRune(drops) {
    const rune = choice(RUNES) + "1";
    state.runes[rune] = (state.runes[rune] || 0) + 1;
    log(`获得${rune}符文。`);
    drops.push(`符文：${rune}`);
    return true;
  }

  function dropSkillDust(enemy, drops, reward = 1) {
    const dust = Math.max(
      1,
      Math.round(
        (enemy.type === "boss" ? rand(4, 6) : enemy.type === "elite" ? rand(1, 3) : 1) *
          (reward > 1 ? 1.12 : 1)
      )
    );
    state.skillDust = (state.skillDust || 0) + dust;
    log(`获得 ${dust} 点技能尘。`);
    drops.push(`技能尘 +${dust}`);
    return true;
  }

  function dropMaterial(drops, reward = 1) {
    const amount = reward > 1 && random() < 0.35 ? 2 : 1;
    state.materials["强化石"] = (state.materials["强化石"] || 0) + amount;
    drops.push(`材料：强化石 +${amount}`);
    return true;
  }

  function dropBonusGold(enemy, drops, reward = 1) {
    const gold = Math.max(1, Math.round(rand(4, 12 + state.floor) * reward));
    state.gold += gold;
    log(`${enemy.name}身上还找到 ${gold} 枚金币。`);
    drops.push(`额外金币 +${gold}`);
    return true;
  }

  function discoverBattleLore(enemy) {
    if (enemy?.loreSource) return discoverLorePage(state, enemy.loreSource);
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

  function battleResultList(rewards, title = "战斗收获") {
    const listClass = rewards.length > 4 ? "reward-list dense" : "reward-list";
    return `
      <div class="battle-result">
        <div class="battle-result-head">
          <span>收获 ${rewards.length} 项</span>
          <b>${title}</b>
        </div>
        <div class="${listClass}">
          ${rewards.map((reward) => rewardItemMarkup(reward)).join("")}
        </div>
      </div>
    `;
  }

  function rewardItemMarkup(reward) {
    const meta = rewardMeta(reward);
    return `<div class="reward-item ${meta.className}"><i>${meta.icon}</i><span>${reward}</span></div>`;
  }

  function rewardMeta(reward) {
    if (reward.startsWith("经验")) return { className: "reward-xp", icon: "XP" };
    if (reward.startsWith("金币")) return { className: "reward-gold", icon: "金" };
    if (reward.startsWith("额外金币")) return { className: "reward-gold", icon: "金" };
    if (reward.startsWith("装备")) return { className: "reward-equipment", icon: "装" };
    if (reward.startsWith("符文")) return { className: "reward-rune", icon: "符" };
    if (reward.startsWith("技能尘")) return { className: "reward-dust", icon: "尘" };
    if (reward.startsWith("材料")) return { className: "reward-material", icon: "材" };
    if (reward.startsWith("残页")) return { className: "reward-lore", icon: "书" };
    if (reward.includes("等级提升")) return { className: "reward-level", icon: "Lv" };
    if (reward.includes("钥匙") || reward.includes("封印")) return { className: "reward-key", icon: "钥" };
    if (reward.includes("任务") || reward.includes("清理") || reward.includes("去找") || reward.includes("领取")) {
      return { className: "reward-quest", icon: "任" };
    }
    return { className: "reward-common", icon: "·" };
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
    const growth: any = CLASSES[state.classId]?.growth || { hp: 3, mp: 2 };
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
    state._nextDamageBonus = 0;
    state.currentEnemy = null;
    state.skillCooldowns = {};
    delete state._battleCell;
    setBattlePhase("idle");
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
        (skill) =>
          state.mp >= upgradedSkill(skill).mp &&
          skill.type !== "evade" &&
          skillCooldownRemaining(skill.id) <= 0
      );
      attackEnemy(bestSkill ? "skill" : "attack", bestSkill || null, true);
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
