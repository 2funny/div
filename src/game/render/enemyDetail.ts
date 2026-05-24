import { elementName, elementTags } from "../combat/elements";
import { escapeHtml } from "./html";
import type { EnemySkill } from "../types";

type EnemyDetailContext = {
  autoBattlePolicy: (enemy: any) => any;
  battleRisk: (enemy: any) => any;
  effectiveMaxHp: () => number;
  enemyAffixText: (enemy: any) => string;
  objectSprite: (enemy: any) => string;
  totals: () => Record<string, number>;
  currentEnemy?: any;
};

export function enemyDetailMarkup(enemy: any, mode = "map", ctx: EnemyDetailContext) {
  if (mode === "map" && !canScoutEnemy(enemy)) {
    return `
      <div class="enemy-detail">
        <div class="enemy-detail-head">
          ${ctx.objectSprite(enemy)}
          <div>
            <span>${enemyKindLabel(enemy)}</span>
            <b>${escapeHtml(enemy.name)}</b>
            <small>符文干扰过强，无法在战斗前读取完整属性。</small>
          </div>
        </div>
        <p class="enemy-scout-note">Boss、钥匙守卫、房间首领和特殊目标需要进入战斗后再确认信息。</p>
      </div>
    `;
  }
  const scout = mode === "map";
  const totals = ctx.totals();
  const risk = ctx.currentEnemy === enemy ? ctx.autoBattlePolicy(enemy) : ctx.battleRisk(enemy);
  const skills = enemy.skills?.length
    ? enemy.skills.map((skill: EnemySkill) => enemySkillSummary(skill)).join(" / ")
    : "无";
  const weaknesses = elementList(enemy.weaknesses) || "无";
  const resistances = elementList(enemy.resistances) || "无";
  const phase = enemyPhaseText(enemy);
  const tacticHint = enemyTacticHint(enemy);
  return `
    <div class="enemy-detail">
      <div class="enemy-detail-head">
        ${ctx.objectSprite(enemy)}
        <div>
          <span>${enemyKindLabel(enemy)}${enemy.affix ? ` · ${escapeHtml(ctx.enemyAffixText(enemy))}` : ""}</span>
          <b>${escapeHtml(enemy.name)}</b>
          <small>${risk ? `${risk.label} · 胜率估算 ${Math.round(risk.score * 100)}%` : "暂无评估"}</small>
        </div>
      </div>
      <div class="enemy-stat-grid">
        ${enemyStatCell("生命", Math.max(0, Math.round(enemy.hp)), Math.round(enemy.maxHp || enemy.hp || 0), ctx.effectiveMaxHp(), scout)}
        ${enemyStatCell("攻击", enemy.atk, null, enemyAtkBenchmark(totals), scout)}
        ${enemyStatCell("防御", enemy.def, null, Math.max(totals.atk || 0, totals.mag || 0), scout)}
        ${enemyStatCell("速度", enemy.spd, null, totals.spd || 0, scout)}
      </div>
      <div class="equipment-detail enemy-detail-rows">
        ${tacticHint ? `<div class="detail-row"><b>应对</b><span>${escapeHtml(tacticHint)}</span></div>` : ""}
        <div class="detail-row"><b>元素</b><span>${elementTags(enemy) || "无"}</span></div>
        <div class="detail-row"><b>弱点</b><span>${weaknesses}</span></div>
        <div class="detail-row"><b>抗性</b><span>${resistances}</span></div>
        ${phase ? `<div class="detail-row"><b>阶段</b><span>${phase}</span></div>` : ""}
        <div class="detail-row"><b>技能</b><span>${skills}</span></div>
      </div>
      ${scout ? `<p class="enemy-scout-note">“?” 表示该项超出当前角色的战前判断范围，进入战斗后可查看完整数值。</p>` : ""}
    </div>
  `;
}

export function isEnemyObject(obj: any) {
  return !!obj && ["monster", "elite", "boss"].includes(obj.type);
}

export function canScoutEnemy(enemy: any) {
  return (
    isEnemyObject(enemy) &&
    enemy.type !== "boss" &&
    !enemy.roomBoss &&
    !enemy.dropsKey &&
    !enemy.rare &&
    !enemy.sealId &&
    !enemy.bossProfile
  );
}

function enemySkillSummary(skill: EnemySkill) {
  const intent =
    {
      damage: "伤害",
      guard: "防御",
      heal: "恢复",
      drain: "汲取",
      weaken: "削弱"
    }[skill.type] || "技能";
  const element = elementName(skill.element);
  const chance = skill.chance ? ` ${Math.round(skill.chance * 100)}%` : "";
  return escapeHtml(`${skill.name}（${[intent, element].filter(Boolean).join(" · ")}${chance}）`);
}

function enemyPhaseText(enemy: any) {
  if (!(enemy.type === "boss" || enemy.roomBoss)) return "";
  const ratio = Number(enemy.maxHp || 0) > 0 ? Number(enemy.hp || 0) / Number(enemy.maxHp) : 1;
  if (ratio <= 0.35) return "濒危：更可能恢复或压制";
  if (ratio <= 0.65) return "转阶段：攻防节奏更紧";
  return "稳态：先观察技能与抗性";
}

function enemyTacticHint(enemy: any) {
  if (!enemy?.skills?.length) return "";
  const skills = enemy.skills;
  if (skills.some((skill: EnemySkill) => skill.type === "heal" || skill.type === "drain")) return "压低血线前保留爆发，避免被恢复拖长战斗";
  if (skills.some((skill: EnemySkill) => skill.type === "guard")) return "观察护盾回合，优先用低耗行动骗出防御";
  if (skills.some((skill: EnemySkill) => skill.type === "weaken")) return "准备药剂或防御回合，削弱后不要硬拼";
  if (skills.some((skill: EnemySkill) => skill.type === "damage")) return "确认元素克制后再交高耗技能";
  return "";
}

function enemyStatCell(
  label: string,
  value: number,
  maxValue: number | null,
  benchmark: number,
  scout: boolean
) {
  const masked = scout && shouldMaskEnemyStat(value, benchmark);
  const display = masked
    ? "?"
    : maxValue == null
      ? Math.round(value || 0)
      : `${Math.round(value || 0)}/${maxValue}`;
  return `<div class="enemy-stat-cell ${masked ? "masked" : ""}"><span>${label}</span><b>${display}</b></div>`;
}

function shouldMaskEnemyStat(value: number, benchmark: number) {
  const safeValue = Number(value || 0);
  const safeBenchmark = Math.max(1, Number(benchmark || 0));
  return safeValue >= Math.max(safeBenchmark * 1.45, safeBenchmark + 14);
}

function enemyAtkBenchmark(totals: Record<string, number>) {
  return Math.max(1, Number(totals.def || 0) * 1.15 + Number(totals.res || 0) * 0.3 + 8);
}

function elementList(ids = []) {
  return ids.map((id) => elementName(id) || id).filter(Boolean).join(" / ");
}

function enemyKindLabel(enemy: any) {
  if (enemy.type === "boss") return "Boss";
  if (enemy.roomBoss) return "房间首领";
  if (enemy.dropsKey) return "钥匙守卫";
  if (enemy.type === "elite") return "精英";
  return "普通怪物";
}
