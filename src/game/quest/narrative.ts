import type { GameState, NarrativeState } from "../types";

export const NARRATIVE_RELATIONS = {
  wardens: "巡夜人",
  merchants: "流动商队",
  survivors: "被困者",
  runebound: "符文回声"
} as const;

export type NarrativeRelationId = keyof typeof NARRATIVE_RELATIONS;

export function ensureNarrativeState(state: GameState): NarrativeState {
  const current = (state.narrative || {}) as Partial<NarrativeState>;
  const narrative: NarrativeState = {
    relations: { ...(current.relations || {}) },
    flags: { ...(current.flags || {}) },
    eventChoices: { ...(current.eventChoices || {}) },
    rescuedNpcIds: Array.isArray(current.rescuedNpcIds) ? [...current.rescuedNpcIds] : [],
    merchantTrust: Number(current.merchantTrust || 0),
    factionLeanings: { ...(current.factionLeanings || {}) }
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

export function relationRewardBonus(state: GameState, id: NarrativeRelationId) {
  const score = relationScore(state, id);
  if (score >= 6) return 0.18;
  if (score >= 2) return 0.08;
  if (score <= -6) return -0.08;
  return 0;
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
  if (trust >= 6) return 0.88;
  if (trust >= 3) return 0.94;
  if (trust <= -4) return 1.12;
  return 1;
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
