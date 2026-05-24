import { elementName } from "../combat/elements";

type BattleCommandPanelContext = {
  autoBattlePolicy: any;
  battle: any;
  battleSkillElementMatchText: (skill: any) => string;
  battleSkills: () => any[];
  currentBattleTurnState: () => any;
  effectiveMaxHp: () => number;
  effectiveMaxMp: () => number;
  percentScore: (score: number) => number;
  skillPreviewText: (skill: any) => string;
  state: any;
  upgradedSkill: (skill: any) => any;
};

export function renderBattleCommandPanelMarkup(ctx: BattleCommandPanelContext, mpMax: number) {
  const state = ctx.state;
  const policy = state.currentEnemy ? ctx.autoBattlePolicy(state.currentEnemy) : null;
  const winRate = policy ? ctx.percentScore(policy.score) : null;
  const turn = ctx.currentBattleTurnState();
  const locked = turn.locked;
  const lockAttrs = locked ? `disabled title="${turn.disabledTitle}"` : "";
  const autoDisabled = locked || !policy?.allowed ? "disabled" : "";
  return {
    locked,
    markup: `
    <div class="battle-command-panel">
      ${battleTimelineMarkup(ctx, turn)}
      <div class="battle-command-layout">
        <div class="battle-basic-actions battle-command-section">
          <div class="battle-panel-title">
            <span>行动</span>
            <small>${turn.actionLabel}</small>
          </div>
          <div class="battle-action-grid">
            <button class="battle-action battle-action-attack" type="button" ${lockAttrs} onclick="attackEnemy('attack')">
              <span class="battle-action-mark" aria-hidden="true">攻</span>
              <span class="battle-action-copy"><b>普通攻击</b><small>稳定造成武器伤害</small></span>
            </button>
            <button class="battle-action battle-action-guard" type="button" ${lockAttrs} onclick="attackEnemy('defend')">
              <span class="battle-action-mark" aria-hidden="true">守</span>
              <span class="battle-action-copy"><b>防御</b><small>本回合减少伤害</small></span>
            </button>
          </div>
        </div>
        <div class="battle-skill-panel battle-command-section">
          <div class="battle-panel-title">
            <span>技能</span>
            <small>MP ${Math.ceil(state.mp)}/${mpMax}</small>
          </div>
          <div class="battle-skill-grid">
            ${renderSkillActionButtonsMarkup(ctx, "battle")}
          </div>
        </div>
        <div class="battle-command-side">
          <div class="battle-consumable-panel battle-command-section">
            <div class="battle-panel-title">
              <b>补给</b>
              <small>消耗行动</small>
            </div>
            <div class="battle-consumable-grid">
              ${renderBattlePotionButtonsMarkup(ctx)}
            </div>
          </div>
          <div class="battle-auto-panel battle-command-section">
            <div class="battle-panel-title">
              <span>战术</span>
              ${policy ? `<small>${policy.label}</small>` : "<small>评估</small>"}
            </div>
            <button class="battle-action enemy-detail-action" type="button" onclick="showCurrentEnemyDetail()">
              <span class="battle-action-mark" aria-hidden="true">情</span>
              <span class="battle-action-copy"><b>怪物详情</b><small>查看当前敌人的属性与抗性</small></span>
            </button>
            <button class="battle-action auto" type="button" ${autoDisabled} ${locked ? `title="${turn.disabledTitle}"` : ""} onclick="autoBattle()">
              <span class="battle-action-head"><b>一键战斗</b>${policy ? `<i class="battle-win-rate">胜率 ${winRate}%</i>` : ""}</span>
              <small>${locked ? turn.shortHint : policy?.allowed ? "低风险普通怪可自动结算 3 回合" : policy?.reason || "需要评估"}</small>
            </button>
          </div>
        </div>
      </div>
    </div>
  `
  };
}

export function battlePotionGroups(state: any) {
  const groups = new Map();
  for (const entry of state.inventory || []) {
    if (entry.kind !== "potion") continue;
    const key = `${entry.name}|${entry.effect}|${entry.amount}`;
    const group = groups.get(key) || { ...entry, count: 0 };
    group.count += 1;
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function renderBattlePotionButtonsMarkup(ctx: BattleCommandPanelContext) {
  const state = ctx.state;
  const potions = battlePotionGroups(state);
  if (!potions.length) return `<p class="battle-empty-supplies">暂无药剂</p>`;
  const turn = ctx.currentBattleTurnState();
  const locked = turn.locked;
  return potions
    .slice(0, 4)
    .map((entry: any) => {
      const isHp = entry.effect === "hp";
      const cap = isHp ? ctx.effectiveMaxHp() : ctx.effectiveMaxMp();
      const current = isHp ? state.hp : state.mp;
      const disabled = locked || current >= cap ? "disabled" : "";
      const effectText = `${isHp ? "HP" : "MP"} +${entry.amount}`;
      const note = locked ? turn.actionLabel : disabled ? "已满" : "立即恢复";
      return `<button class="battle-consumable" type="button" ${disabled} ${locked ? `title="${turn.disabledTitle}"` : ""} onclick="useBattlePotion('${entry.id}')"><span class="battle-card-head"><b>${entry.name}</b><i>x${entry.count}</i></span><span class="battle-effect-text">${effectText}</span><small>${note}</small></button>`;
    })
    .join("");
}

export function renderSkillActionButtonsMarkup(ctx: BattleCommandPanelContext, mode = "compact") {
  const state = ctx.state;
  const turn = ctx.currentBattleTurnState();
  const locked = turn.locked;
  const skills = ctx.battleSkills();
  if (!skills.length) {
    return mode === "battle"
      ? `<p class="battle-empty-supplies">未携带技能</p>`
      : `<p>未携带技能。</p>`;
  }
  return skills
    .map((skill: any) => {
      const upgraded = ctx.upgradedSkill(skill);
      const level = upgraded.level ? ` Lv.${upgraded.level}` : "";
      const hasMp = state.mp >= upgraded.mp;
      const cooldown = Math.max(0, Number(state.skillCooldowns?.[skill.id] || 0));
      const displayCooldown = cooldown;
      const ready = cooldown <= 0;
      const disabled = locked || !hasMp || !ready ? "disabled" : "";
      const title = locked
        ? `title="${turn.disabledTitle}"`
        : !ready
          ? `title="冷却中，还需 ${displayCooldown} 回合"`
          : !hasMp
            ? `title="法力不足"`
            : "";
      if (mode === "battle") {
        const baseCooldownText = `冷却 ${upgraded.cooldown || 0} 回合`;
        const mpText = hasMp || locked ? `${upgraded.mp} MP` : `${upgraded.mp} MP不足`;
        const cooldownMeta = `<span>${baseCooldownText}</span>${!ready ? `<span class="danger">剩余 ${displayCooldown}</span>` : ""}`;
        const matchText = ctx.battleSkillElementMatchText(upgraded);
        const matchMeta = matchText ? `<span>${matchText}</span>` : "";
        const branchText = upgraded.branch ? `${upgraded.branch.name} · ` : "";
        const elementText = elementName(upgraded.element);
        const note = locked
          ? turn.shortHint
          : !ready
            ? `冷却中，还需 ${displayCooldown} 回合`
            : `${branchText}${elementText ? `${elementText}属性 · ` : ""}${skill.desc}`;
        return `<button class="battle-skill-card" type="button" ${disabled} ${title} onclick="attackEnemy('skill', '${skill.id}')"><span class="battle-card-head"><b>${skill.name}${level}</b><i>${mpText}</i></span><span class="skill-preview">${ctx.skillPreviewText(upgraded)}</span><span class="battle-skill-meta">${cooldownMeta}${matchMeta}</span><small>${note}</small></button>`;
      }
      return `<button type="button" ${disabled} ${title} onclick="attackEnemy('skill', '${skill.id}')">${skill.name}${level} · ${ctx.skillPreviewText(upgraded)} · ${upgraded.mp} MP · 冷却 ${upgraded.cooldown || 0} 回合${!ready ? ` · 剩余 ${displayCooldown}` : ""}</button>`;
    })
    .join("");
}

export function currentBattleTurnState(state: any, battle: any) {
  const locked = !!state?.currentEnemy && Date.now() < Number(battle.inputLockedUntil || 0);
  const phase = locked ? battle.phase || "waiting" : "player-turn";
  if (!locked) return readyTurnState(locked, phase);
  if (phase === "enemy-windup") {
    return {
      locked,
      phase,
      className: "windup enemy",
      icon: "警",
      kicker: "敌方锁定",
      title: battle.message || "敌人正在逼近",
      detail: "你的行动已生效，观察伤害与状态，准备承受反击。",
      actionLabel: "反击将至",
      disabledTitle: "敌人即将反击",
      shortHint: "敌人即将反击"
    };
  }
  if (phase === "enemy-action" || phase === "enemy-turn") {
    return {
      locked,
      phase,
      className: "impact enemy",
      icon: "击",
      kicker: "敌方行动",
      title: battle.message || "敌人发动攻击",
      detail: "敌人的伤害、闪避和护盾结算中，随后会回到你的回合。",
      actionLabel: "结算中",
      disabledTitle: "敌方行动结算中",
      shortHint: "敌方行动结算中"
    };
  }
  return readyTurnState(locked, phase);
}

function readyTurnState(locked: boolean, phase: string) {
  return {
    locked,
    phase,
    className: "ready",
    icon: "令",
    kicker: "行动权",
    title: "轮到你行动",
    detail: "选择攻击、技能或补给，下一次操作会推进回合。",
    actionLabel: "可行动",
    disabledTitle: "",
    shortHint: ""
  };
}

function battleTimelineMarkup(ctx: BattleCommandPanelContext, turn: any) {
  const battle = ctx.battle || {};
  const history = Array.isArray(battle.actionTimeline) ? battle.actionTimeline : [];
  const current = currentBattleTimelineNode(ctx.state, battle, turn);
  const entries = current ? [...history, current] : history;
  const nodes = entries.length
    ? entries.map((entry, index) => battleTimelineNodeMarkup(entry, index, entry === current)).join("")
    : battleTimelineNodeMarkup(
        {
          seq: 0,
          actor: "hero",
          kind: "idle",
          title: "战斗开始",
          detail: "等待第一轮交锋。",
          meta: "准备"
        },
        0,
        true
      );
  return `<div class="battle-timeline" aria-label="战斗回合时间线"><div class="battle-timeline-rail">${nodes}</div></div>`;
}

function currentBattleTimelineNode(state: any, battle: any, turn: any) {
  if (!state.currentEnemy) return null;
  if (turn.phase === "enemy-windup") {
    return {
      seq: "now",
      actor: "enemy",
      kind: "windup",
      title: battle.message || `${state.currentEnemy.name}准备反击`,
      detail: "敌方行动即将结算。",
      meta: "预备"
    };
  }
  if (turn.phase === "enemy-action" || turn.phase === "enemy-turn") {
    return {
      seq: "now",
      actor: "enemy",
      kind: "hit",
      title: battle.message || `${state.currentEnemy.name}行动中`,
      detail: "伤害与状态正在结算。",
      meta: "结算"
    };
  }
  return {
    seq: "now",
    actor: "hero",
    kind: "ready",
    title: "轮到你行动",
    detail: "选择攻击、技能或补给。",
    meta: "当前"
  };
}

function battleTimelineNodeMarkup(entry: any, index: number, active = false) {
  const actor = entry.actor === "enemy" ? "enemy" : "hero";
  const side = index % 2 === 0 ? "top" : "bottom";
  const actorText = actor === "hero" ? "你" : "敌";
  const meta = entry.meta ? `<em>${entry.meta}</em>` : "";
  return `
      <article class="battle-timeline-node ${actor} ${side} ${entry.kind || "info"} ${active ? "active" : ""}">
        <div class="battle-timeline-card">
          <b>${entry.title || "战斗事件"}</b>
          <span>${entry.detail || ""}</span>
          ${meta}
        </div>
        <i>${actorText}</i>
      </article>
    `;
}
