import { elementName } from "../combat/elements";
import { escapeHtml } from "./html";
import type { SkillBranch } from "../types";

export function branchEffectLabels(branch: SkillBranch): string[] {
  const labels = [];
  if (branch.powerBonus) labels.push(`伤害 ${branch.powerBonus > 0 ? "+" : ""}${Math.round(branch.powerBonus * 100)}%`);
  if (branch.statusBonus) labels.push(`持续 +${branch.statusBonus}`);
  if (branch.mpDelta) labels.push(`耗蓝 ${branch.mpDelta > 0 ? "+" : ""}${branch.mpDelta}`);
  if (branch.cooldownDelta) labels.push(`冷却 ${branch.cooldownDelta > 0 ? "+" : ""}${branch.cooldownDelta}`);
  if (branch.pierceResist) labels.push("穿透抗性");
  if (branch.element) labels.push(`${elementName(branch.element)}属性`);
  return labels;
}

export function branchEffectTags(branch: SkillBranch, fallback = ""): string {
  const labels = branchEffectLabels(branch);
  const tags = labels.length ? labels : fallback ? [fallback] : [];
  return tags.map((tag) => `<i>${escapeHtml(tag)}</i>`).join("");
}
