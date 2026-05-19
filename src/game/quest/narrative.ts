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
    eventChoices: { ...(current.eventChoices || {}) }
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
