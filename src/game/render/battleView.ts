import { getBattleFx } from "../combat/combatFx";
import { elementTags } from "../combat/elements";

export function renderBattleViewMarkup(ctx) {
  const { state, enemy, cls, hpMax, mpMax, hpPct, mpPct, enemyPct } = ctx;
  return `
    <div class="battle-board">
      <div class="combatant hero-combatant ${battleFxClass("hero")}">
        <div class="battle-sprite">${ctx.sprite("player", ctx.assetForClass(state.classId), cls.name)}</div>
        ${combatantFxMarkup("hero")}
        <h2>${cls.name}</h2>
        <div class="battle-meter"><span style="width:${hpPct}%"></span><b>${Math.ceil(state.hp)}/${hpMax} HP</b></div>
        <div class="battle-meter mp"><span style="width:${mpPct}%"></span><b>${Math.ceil(state.mp)}/${mpMax} MP</b></div>
      </div>
      <div class="battle-center">
        <strong>VS</strong>
        ${centerFxMarkup()}
      </div>
      <div class="combatant enemy-combatant ${battleFxClass("enemy")}">
        <button class="battle-sprite enemy-detail-sprite" type="button" onclick="showCurrentEnemyDetail()" title="查看怪物信息">${ctx.objectSprite(enemy)}</button>
        ${combatantFxMarkup("enemy")}
        <button class="enemy-detail-button" type="button" onclick="showCurrentEnemyDetail()">详情</button>
        <h2>${enemy.name}</h2>
        ${enemy.affix ? `<small class="enemy-affix">${ctx.enemyAffixText(enemy)}</small>` : ""}
        ${elementTags(enemy) ? `<small class="enemy-element">${elementTags(enemy)}</small>` : ""}
        <div class="battle-meter enemy"><span style="width:${enemyPct}%"></span><b>${Math.max(0, Math.round(enemy.hp))}/${enemy.maxHp} HP</b></div>
        <p>攻击 ${enemy.atk} · 防御 ${enemy.def}${enemy.skills?.length ? ` · 技能 ${enemy.skills.map((skill) => skill.name).join("/")}` : ""}</p>
      </div>
    </div>
    ${ctx.renderBattleCommandPanel(mpMax)}
  `;
}

export function battleFxClass(target) {
  const fx = getBattleFx()?.[target];
  if (!fx) return "";
  return [`fx-${fx.type}`, fx.element ? `fx-element-${fx.element}` : ""]
    .filter(Boolean)
    .join(" ");
}

export function combatantFxMarkup(target) {
  const fx = getBattleFx()?.[target];
  if (!fx) return "";
  const classes = [
    `combat-fx`,
    `combat-fx-${fx.type}`,
    fx.element ? `combat-fx-element-${fx.element}` : ""
  ]
    .filter(Boolean)
    .join(" ");
  return `<span class="${classes}" style="--fx-key:${fx.seq}">${elementBurstMarkup(fx.element)}<b>${fx.text}</b><small>${fx.label}</small></span>`;
}

export function elementBurstMarkup(element) {
  if (!element) return "";
  return `<i class="element-burst" aria-hidden="true">${Array.from({ length: 8 }, () => "<i></i>").join("")}</i>`;
}

export function centerFxMarkup() {
  const fx = getBattleFx()?.center;
  if (!fx) return "";
  return `<span class="center-fx center-fx-${fx.type}">${fx.text}</span>`;
}
