import { branchEffectTags } from "./skillBranchText";

export function skillLoadoutMarkup(ctx, equipped = ctx.battleSkills(), interactive = true) {
  const slots = Array.from({ length: ctx.battleSkillLimit }, (_, index) => {
    const skill = equipped[index];
    const action = interactive ? ` onclick="openSkillLoadout()"` : "";
    if (!skill) {
      return `<button class="skill-slot empty" type="button"${action}><span>空位</span><small>点击装备技能</small></button>`;
    }
    const upgraded = ctx.upgradedSkill(skill);
    const level = upgraded.level ? ` Lv.${upgraded.level}` : "";
    return `<button class="skill-slot equipped" type="button"${action}><span>${skill.name}${level}</span><small>${ctx.skillPreviewText(upgraded)} · ${upgraded.mp} MP</small></button>`;
  }).join("");
  return `<section class="skill-loadout"><div class="skill-loadout-head"><div><span>已装备技能</span><b>${equipped.length}/${ctx.battleSkillLimit}</b></div>${interactive ? `<button type="button" onclick="openSkillLoadout()">调整</button>` : ""}</div><div class="skill-loadout-slots">${slots}</div></section>`;
}

export function skillLoadoutModalMarkup(ctx, learned, equipped) {
  const options = learned
    .map((skill) => {
      const upgraded = ctx.upgradedSkill(skill);
      return `<option value="${skill.id}">${skill.name} Lv.${upgraded.level} · ${ctx.skillPreviewText(upgraded)}</option>`;
    })
    .join("");
  const picker = learned.length
    ? Array.from({ length: ctx.battleSkillLimit }, (_, index) => {
        const skill = equipped[index];
        const upgraded = skill ? ctx.upgradedSkill(skill) : null;
        return `<div class="skill-picker-row ${skill ? "equipped" : ""}"><div class="item-main"><span class="item-kicker">技能槽 ${index + 1}</span><b>${skill ? `${skill.name} Lv.${upgraded.level}` : "空位"}</b>${skill ? `<small>${upgraded.branch?.desc || skill.desc}</small><span class="item-tags"><i>${ctx.skillPreviewText(upgraded)}</i><i>${upgraded.mp} MP</i><i>冷却 ${upgraded.cooldown || 0} 回合</i></span>` : `<small>选择一个已学会技能装备到这里。</small>`}</div><select onchange="setBattleSkillSlot(${index}, this.value)"><option value="" ${skill ? "" : "selected"}>空位</option>${options.replace(`value="${skill?.id}"`, `value="${skill?.id}" selected`)}</select></div>`;
      }).join("")
    : `<p>还没有已学会的技能。</p>`;
  return `<div class="skill-loadout-modal"><div class="skill-picker-list">${picker}</div></div>`;
}

export function renderSkillsMarkup(ctx) {
  const skills = ctx.classSkills();
  const learnedCount = skills.filter((skill) => ctx.isSkillLearned(skill.id)).length;
  const equippedCount = ctx.battleSkills().length;
  return `
    <div class="item-row"><div>技能资源<small>技能点 ${ctx.state.skillPoints || 0}，技能尘 ${ctx.state.skillDust || 0} · 已学 ${learnedCount}/${skills.length} · 携带 ${equippedCount}/${ctx.battleSkillLimit}</small></div></div>
    ${skillLoadoutMarkup(ctx)}
    ${skills.map((skill) => skillRowMarkup(ctx, skill)).join("")}
  `;
}

function skillRowMarkup(ctx, skill) {
  const learned = ctx.isSkillLearned(skill.id);
  const equipped = ctx.isSkillEquipped(skill.id);
  const learnable = ctx.canLearnSkill(skill.id);
  const upgraded = ctx.upgradedSkill(skill);
  const cost = ctx.skillUpgradeCost(skill.id);
  const upgradeDisabled = learned && ctx.canUpgradeSkill(skill.id) ? "" : "disabled";
  const equipDisabled = learned ? "" : "disabled";
  const learnState = learned ? (equipped ? "已携带" : "已学会") : learnable ? "可学习" : "未满足前置";
  const requirement = ctx.skillRequirementText(skill);
  const lockClass = learned ? "" : learnable ? "learnable" : "locked unmet";
  const stateClass = !learned && !learnable ? " danger" : "";
  const requirementClass = !learned && !learnable ? " class=\"skill-requirement unmet\"" : "";
  const branchTags = learned && upgraded.branch ? branchEffectTags(upgraded.branch) : "";
  return `<div class="item-row skill-row inventory-card ${lockClass}"><div class="item-main"><span class="item-kicker${stateClass}">${learnState}${upgraded.branch ? ` · ${upgraded.branch.name}` : ""}</span><b>${skill.name}${learned ? ` Lv.${upgraded.level}` : ""}</b><small${requirementClass}>${learned ? upgraded.branch?.desc || skill.desc : requirement}</small><span class="item-tags"><i>${ctx.skillPreviewText(upgraded)}</i><i>${upgraded.mp} MP</i><i>冷却 ${upgraded.cooldown || 0} 回合</i>${branchTags}${learned ? `<i>升级 ${cost.points} 点 / ${cost.dust} 尘</i>` : `<i>${skill.desc}</i>`}</span></div><div class="item-actions"><button type="button" ${upgradeDisabled} onclick="confirmUpgradeSkill('${skill.id}')">升级</button><button type="button" ${equipDisabled} onclick="updateBattleSkillFromList('${skill.id}')">${equipped ? "卸下" : "携带"}</button></div></div>`;
}
