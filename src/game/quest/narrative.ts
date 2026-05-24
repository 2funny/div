import type { GameState, NarrativeState } from "../types";

export const NARRATIVE_RELATIONS = {
  wardens: "巡夜人",
  merchants: "流动商队",
  survivors: "被困者",
  runebound: "符文回声"
} as const;

export type NarrativeRelationId = keyof typeof NARRATIVE_RELATIONS;

type EndingScore = {
  wardens: number;
  merchants: number;
  survivors: number;
  runebound: number;
};

export type EndingOutcome = {
  id: string;
  title: string;
  summary: string;
  consequence: string;
  score: EndingScore;
  highlights: string[];
};

export function ensureNarrativeState(state: GameState): NarrativeState {
  const current = (state.narrative || {}) as Partial<NarrativeState>;
  const narrative: NarrativeState = {
    relations: { ...(current.relations || {}) },
    flags: { ...(current.flags || {}) },
    eventChoices: { ...(current.eventChoices || {}) },
    rescuedNpcIds: Array.isArray(current.rescuedNpcIds) ? [...current.rescuedNpcIds] : [],
    merchantTrust: Number(current.merchantTrust || 0),
    factionLeanings: { ...(current.factionLeanings || {}) },
    milestones: Array.isArray(current.milestones) ? [...current.milestones] : [],
    endingId: current.endingId || "",
    endingScores: { ...(current.endingScores || {}) },
    endingClassText: current.endingClassText || "",
    endingConsequences: Array.isArray(current.endingConsequences) ? [...current.endingConsequences] : [],
    questOutcomes: { ...(current.questOutcomes || {}) },
    failedQuestIds: Array.isArray(current.failedQuestIds) ? [...current.failedQuestIds] : []
  };
  state.narrative = narrative;
  return narrative;
}

export function adjustRelation(state: GameState, id: NarrativeRelationId, delta: number) {
  const narrative = ensureNarrativeState(state);
  const next = Number(narrative.relations[id] || 0) + delta;
  narrative.relations[id] = Math.max(-20, Math.min(20, next));
  return narrative.relations[id];
}

export function relationScore(state: GameState, id: NarrativeRelationId) {
  return Number(ensureNarrativeState(state).relations[id] || 0);
}

export function relationLabel(state: GameState, id: NarrativeRelationId) {
  const score = relationScore(state, id);
  const name = NARRATIVE_RELATIONS[id];
  if (score >= 6) return `${name}信赖`;
  if (score >= 2) return `${name}友好`;
  if (score <= -6) return `${name}疏离`;
  if (score <= -2) return `${name}警惕`;
  return `${name}中立`;
}

export function relationImpactText(state: GameState, id: NarrativeRelationId, delta = 1) {
  const score = relationScore(state, id);
  const next = Math.max(-20, Math.min(20, score + delta));
  const bonus = rewardBonusLabel(next);
  return `${NARRATIVE_RELATIONS[id]} ${signedNumber(score)} -> ${signedNumber(next)}${bonus ? ` · ${bonus}` : ""}`;
}

export function questImpactText(state: GameState, def: { id?: string; giver?: string; relation?: string }) {
  const relationId = questRelationId(def);
  const delta = def.id === "rescueRoom" ? 2 : 1;
  const parts = [`影响：${relationImpactText(state, relationId, delta)}`];
  if (relationId === "merchants") parts.push("商队信任提高，后续商店价格更稳定");
  if (relationId === "survivors") parts.push("幸存者会在事件中留下更多线索");
  if (relationId === "wardens") parts.push("巡夜人更愿意交付钥匙和封印委托");
  if (relationId === "runebound") parts.push("符文回声任务更容易带来技能资源");
  return parts.join("；");
}

export function questRelationId(def: { id?: string; giver?: string; relation?: string }): NarrativeRelationId {
  if (def.relation && def.relation in NARRATIVE_RELATIONS) return def.relation as NarrativeRelationId;
  if (def.id === "merchantRoute" || def.giver === "shop") return "merchants";
  if (def.id === "rescueRoom") return "survivors";
  return "wardens";
}

function signedNumber(value: number) {
  return `${value >= 0 ? "+" : ""}${value}`;
}

function rewardBonusLabel(score: number) {
  if (score >= 6) return "奖励 +18%";
  if (score >= 2) return "奖励 +8%";
  if (score <= -6) return "奖励 -8%";
  return "";
}

export function relationRewardBonus(state: GameState, id: NarrativeRelationId) {
  const score = relationScore(state, id);
  if (score >= 6) return 0.18;
  if (score >= 2) return 0.08;
  if (score <= -6) return -0.08;
  return 0;
}

export function endingQuestRewardBonus(state: GameState, id: NarrativeRelationId) {
  const endingId = ensureNarrativeState(state).endingId;
  if (endingId === "shared_compact") return 0.08;
  if (endingId === "seal_kept" && id === "wardens") return 0.12;
  if (endingId === "trade_route" && id === "merchants") return 0.12;
  if (endingId === "survivor_road" && id === "survivors") return 0.12;
  if (endingId === "echo_release" && id === "runebound") return 0.12;
  return 0;
}

export function endingTitle(id = "") {
  return ENDINGS[id]?.title || "";
}

export function endingWorldEffectText(state: GameState) {
  const id = ensureNarrativeState(state).endingId || "";
  if (id === "shared_compact") return "共管誓约：所有阵营委托金币 +8%，商队价格小幅降低。";
  if (id === "seal_kept") return "封印延续：巡夜人委托金币 +12%。";
  if (id === "trade_route") return "商路重开：商队委托金币 +12%，商队价格明显降低。";
  if (id === "survivor_road") return "撤离之路：幸存者委托金币 +12%。";
  if (id === "echo_release") return "回声解放：符文回声委托金币 +12%。";
  if (id === "lone_return") return "孤身归还：世界保持中性，后续探索不会偏向任何阵营。";
  return "";
}

export function markNarrativeFlag(state: GameState, flag: string) {
  const narrative = ensureNarrativeState(state);
  narrative.flags[flag] = true;
}

export function hasNarrativeFlag(state: GameState, flag: string) {
  return !!ensureNarrativeState(state).flags[flag];
}

export function recordEventChoice(state: GameState, eventId: string, choiceId: string) {
  const narrative = ensureNarrativeState(state);
  narrative.eventChoices[eventId] = choiceId;
}

export function eventChoiceCount(state: GameState, choiceId: string) {
  const choices = Object.values(ensureNarrativeState(state).eventChoices);
  return choices.filter((choice) => choice === choiceId).length;
}

export function recordRescuedNpc(state: GameState, npcId: string) {
  if (!npcId) return;
  const narrative = ensureNarrativeState(state);
  if (!narrative.rescuedNpcIds.includes(npcId)) narrative.rescuedNpcIds.push(npcId);
}

export function hasRescuedNpc(state: GameState, npcId: string) {
  return !!npcId && ensureNarrativeState(state).rescuedNpcIds.includes(npcId);
}

export function recordQuestOutcome(state: GameState, questKey: string, outcome: "completed" | "failed") {
  if (!questKey) return;
  const narrative = ensureNarrativeState(state);
  narrative.questOutcomes = narrative.questOutcomes || {};
  narrative.questOutcomes[questKey] = outcome;
  if (outcome === "failed") {
    narrative.failedQuestIds = narrative.failedQuestIds || [];
    if (!narrative.failedQuestIds.includes(questKey)) narrative.failedQuestIds.push(questKey);
  }
}

export function adjustMerchantTrust(state: GameState, delta: number) {
  const narrative = ensureNarrativeState(state);
  narrative.merchantTrust = Math.max(-10, Math.min(10, Number(narrative.merchantTrust || 0) + delta));
  return narrative.merchantTrust;
}

export function merchantTrust(state: GameState) {
  return Number(ensureNarrativeState(state).merchantTrust || 0);
}

export function merchantPriceFactor(state: GameState) {
  const trust = merchantTrust(state);
  const endingId = ensureNarrativeState(state).endingId;
  const endingFactor = endingId === "trade_route" ? 0.9 : endingId === "shared_compact" ? 0.95 : 1;
  if (trust >= 6) return 0.88;
  if (trust >= 3) return Number((0.94 * endingFactor).toFixed(2));
  if (trust <= -4) return Number((1.12 * endingFactor).toFixed(2));
  return endingFactor;
}

export function adjustFactionLeaning(state: GameState, id: string, delta: number) {
  if (!id) return 0;
  const narrative = ensureNarrativeState(state);
  const next = Number(narrative.factionLeanings[id] || 0) + delta;
  narrative.factionLeanings[id] = Math.max(-20, Math.min(20, next));
  return narrative.factionLeanings[id];
}

export function factionLeaning(state: GameState, id: string) {
  return Number(ensureNarrativeState(state).factionLeanings[id] || 0);
}

export function narrativeBranchMilestone(state: GameState, id: NarrativeRelationId) {
  const narrative = ensureNarrativeState(state);
  const score = branchScore(state, id);
  const tier = score >= 8 ? "locked" : score >= 4 ? "leaning" : "";
  if (!tier) return "";
  const key = `${id}:${tier}`;
  if (narrative.milestones?.includes(key)) return "";
  narrative.milestones = narrative.milestones || [];
  narrative.milestones.push(key);
  state.narrative = narrative;
  const name = NARRATIVE_RELATIONS[id];
  if (tier === "locked") return `${name}路线已经成形，终局选择会明显偏向这一方。`;
  return `${name}路线开始显现，后续委托和事件会更常呼应这一选择。`;
}

export function dominantNarrativeBranchText(state: GameState) {
  const entries = (Object.keys(NARRATIVE_RELATIONS) as NarrativeRelationId[])
    .map((id) => ({ id, score: branchScore(state, id) }))
    .sort((a, b) => b.score - a.score);
  const best = entries[0];
  if (!best || best.score < 3) return "";
  const second = entries[1]?.score || 0;
  const name = NARRATIVE_RELATIONS[best.id];
  if (best.score >= 8 && best.score - second >= 3) return `剧情倾向：${name}路线稳固`;
  if (best.score >= 4) return `剧情倾向：${name}路线升温`;
  return `剧情倾向：${name}开始回应你`;
}

function branchScore(state: GameState, id: NarrativeRelationId) {
  const narrative = ensureNarrativeState(state);
  const rescuedBonus = id === "survivors" ? Math.min(4, narrative.rescuedNpcIds.length) : 0;
  const merchantBonus = id === "merchants" ? Math.floor(Number(narrative.merchantTrust || 0) / 2) : 0;
  return (
    Number(narrative.factionLeanings[id] || 0) +
    Math.floor(relationScore(state, id) / 3) +
    rescuedBonus +
    merchantBonus
  );
}

export function determineEnding(state: GameState): EndingOutcome {
  recordUnfinishedQuestFailures(state);
  const score = endingScores(state);
  const narrative = ensureNarrativeState(state);
  const sorted = Object.entries(score).sort((a, b) => b[1] - a[1]);
  const [leader, leaderScore] = sorted[0] || ["wardens", 0];
  const secondScore = Number(sorted[1]?.[1] || 0);
  const balanced = leaderScore >= 5 && secondScore >= 4 && leaderScore - secondScore <= 2;
  const rescued = narrative.rescuedNpcIds.length;

  let outcome = ENDINGS.lone_return;
  if (balanced) outcome = ENDINGS.shared_compact;
  else if (leader === "survivors" && (leaderScore >= 4 || rescued >= 2)) outcome = ENDINGS.survivor_road;
  else if (leader === "merchants" && leaderScore >= 4) outcome = ENDINGS.trade_route;
  else if (leader === "runebound" && leaderScore >= 4) outcome = ENDINGS.echo_release;
  else if (leader === "wardens" && leaderScore >= 4) outcome = ENDINGS.seal_kept;

  narrative.endingId = outcome.id;
  narrative.endingScores = { ...score };
  narrative.endingClassText = classEndingText(state.classId || "");
  narrative.endingConsequences = endingConsequences(state, outcome.id);
  return {
    ...outcome,
    score,
    highlights: endingHighlights(state, score)
  };
}

export function endingScores(state: GameState): EndingScore {
  const narrative = ensureNarrativeState(state);
  const choices = narrative.eventChoices || {};
  const score: EndingScore = {
    wardens: Number(narrative.factionLeanings.wardens || 0) + Math.floor(relationScore(state, "wardens") / 3),
    merchants:
      Number(narrative.factionLeanings.merchants || 0) +
      Math.floor(relationScore(state, "merchants") / 3) +
      Math.floor(Number(narrative.merchantTrust || 0) / 2),
    survivors:
      Number(narrative.factionLeanings.survivors || 0) +
      Math.floor(relationScore(state, "survivors") / 3) +
      Math.min(4, narrative.rescuedNpcIds.length),
    runebound: Number(narrative.factionLeanings.runebound || 0) + Math.floor(relationScore(state, "runebound") / 3)
  };
  // Room event choices become visible late-game consequences instead of isolated rewards.
  if (choices.cracked_altar === "blood_for_rune") score.runebound += 2;
  if (choices.cracked_altar === "salvage_altar_dust") score.wardens += 1;
  if (choices.sealed_cache === "spend_key_for_cache") score.merchants += 1;
  if (choices.sealed_cache === "force_cache") score.merchants -= 1;
  if (choices.survivor_mark === "claim_survivor_cache") score.survivors += 2;
  if (choices.warden_seal === "reinforce_warden_seal") score.wardens += 2;
  if (choices.warden_seal === "strip_warden_seal") score.runebound += 1;
  if (choices.merchant_ledger === "redeem_ledger_credit") score.merchants += 2;
  if (choices.echo_shrine === "listen_echo") score.runebound += 1;
  if (choices.echo_shrine === "break_echo_shrine") score.runebound -= 1;
  for (const questId of narrative.failedQuestIds || []) {
    const relation = questId.includes("rescueRoom")
      ? "survivors"
      : questId.includes("merchant")
        ? "merchants"
        : questId.includes("runebound")
          ? "runebound"
          : "wardens";
    score[relation] -= 2;
  }
  return score;
}

function endingHighlights(state: GameState, score: EndingScore) {
  const narrative = ensureNarrativeState(state);
  const parts = [
    `巡夜人 ${signedNumber(score.wardens)}`,
    `商队 ${signedNumber(score.merchants)}`,
    `幸存者 ${signedNumber(score.survivors)}`,
    `符文回声 ${signedNumber(score.runebound)}`
  ];
  if (narrative.rescuedNpcIds.length) parts.push(`救援 ${narrative.rescuedNpcIds.length} 人`);
  if (narrative.failedQuestIds?.length) parts.push(`未竟委托 ${narrative.failedQuestIds.length} 件`);
  if (narrative.merchantTrust) parts.push(`商队信任 ${signedNumber(narrative.merchantTrust)}`);
  const classText = classEndingText(state.classId || "");
  if (classText) parts.push(classText);
  return parts;
}

function recordUnfinishedQuestFailures(state: GameState) {
  for (const quest of state.quests || []) {
    if (!quest?.accepted || quest.claimed) continue;
    if (quest.completed && !quest.claimed) continue;
    recordQuestOutcome(state, questOutcomeKey(quest), "failed");
  }
}

export function questOutcomeKey(quest: { id?: string; floor?: number; roomId?: string | null }) {
  return [quest.id || "quest", quest.floor || 0, quest.roomId || ""].join(":");
}

export function classEndingText(classId = "") {
  if (classId === "warrior") return "剑士后果：巡夜封条获得新的守门人，后续防御型装备更常回应你。";
  if (classId === "mage") return "法师后果：符文回声被重新编目，后续技能卷轴和法力套装更常出现。";
  if (classId === "ranger") return "游侠后果：撤离路线被标进暗记，后续速度型装备和救援线索更常出现。";
  return "";
}

export function endingConsequences(state: GameState, endingId = ensureNarrativeState(state).endingId || "") {
  const narrative = ensureNarrativeState(state);
  const consequences = [endingWorldEffectText(state), classEndingText(state.classId || "")].filter(Boolean);
  if (narrative.failedQuestIds?.length) {
    consequences.push(`有 ${narrative.failedQuestIds.length} 件委托没能收束，对应阵营会在结局评分中扣分。`);
  }
  if (endingId === "shared_compact") consequences.push("多阵营平衡会带来更复杂但奖励更均衡的后续委托。");
  if (endingId === "lone_return") consequences.push("缺少明确盟友，后续世界不会提供阵营偏向补给。");
  return consequences;
}

const ENDINGS: Record<string, Omit<EndingOutcome, "score" | "highlights">> = {
  seal_kept: {
    id: "seal_kept",
    title: "结局：封印延续",
    summary: "巡夜人的封条重新压住王座。地牢没有消失，但它学会了在边界内沉默。",
    consequence: "后续探索会以钥匙、封印和稳定补给为主，危险被控制，答案也被保留。"
  },
  echo_release: {
    id: "echo_release",
    title: "结局：回声解放",
    summary: "你没有继承王座，而是拆开它的记忆回路。符文回声第一次不再复述旧命令。",
    consequence: "符文知识散入各层，技能资源更充足，但地牢会出现更多无法预测的回声事件。"
  },
  survivor_road: {
    id: "survivor_road",
    title: "结局：撤离之路",
    summary: "幸存者留下的暗记连成路线。王座倒下后，第一批人终于从深层走回入口。",
    consequence: "后续世界会出现更多救援、护送和安全屋事件，地牢不再只是一个人的远征。"
  },
  trade_route: {
    id: "trade_route",
    title: "结局：商路重开",
    summary: "商队把废弃补给点重新点亮。王座的沉默变成一条可来回通行的路。",
    consequence: "后续补给价格更稳定，传送信标和万能钥匙会成为主要的深层策略资源。"
  },
  shared_compact: {
    id: "shared_compact",
    title: "结局：共管誓约",
    summary: "没有任何一方独占王座。封印、商路、幸存者暗记和符文回声被写进同一份誓约。",
    consequence: "后续探索会获得最均衡的世界状态，但各阵营也会提出更复杂的长期委托。"
  },
  lone_return: {
    id: "lone_return",
    title: "结局：孤身归还",
    summary: "王座安静下来，但没有足够的人接住它留下的空洞。你带着答案独自返回入口。",
    consequence: "后续世界保持中性，资源和事件不会偏向任何阵营。"
  }
};
