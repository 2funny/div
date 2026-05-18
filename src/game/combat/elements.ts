export const ELEMENT_IDS = ["fire", "ice", "thunder", "poison", "holy", "dark"] as const;

export type ElementId = (typeof ELEMENT_IDS)[number];

export const ELEMENTS: Record<
  ElementId,
  { value: ElementId; name: string; strongAgainst: ElementId[]; weakAgainst: ElementId[] }
> = {
  fire: { value: "fire", name: "火", strongAgainst: ["ice", "poison"], weakAgainst: ["ice"] },
  ice: { value: "ice", name: "冰", strongAgainst: ["fire", "thunder"], weakAgainst: ["fire"] },
  thunder: { value: "thunder", name: "雷", strongAgainst: ["poison", "holy"], weakAgainst: ["ice"] },
  poison: { value: "poison", name: "毒", strongAgainst: ["holy", "fire"], weakAgainst: ["thunder"] },
  holy: { value: "holy", name: "圣", strongAgainst: ["dark", "poison"], weakAgainst: ["dark"] },
  dark: { value: "dark", name: "暗", strongAgainst: ["holy", "thunder"], weakAgainst: ["holy"] }
};

export const ELEMENT_ADVANTAGE = 1.35;
export const ELEMENT_RESIST = 0.7;
export const ELEMENT_SAME_RESIST = 0.85;
export const MAGE_ADVANTAGE_BONUS = 0.15;
export const PLAYER_ELEMENT_RESIST = 0.82;

export function elementName(element?: string | null) {
  return element && ELEMENTS[element as ElementId]?.name ? ELEMENTS[element as ElementId].name : "";
}

export function elementMultiplier(
  attackElement?: string | null,
  target?: { element?: string | null; weaknesses?: string[]; resistances?: string[] } | null,
  classId?: string | null,
  options: { pierceResist?: boolean } = {}
) {
  if (!attackElement || !target) return 1;
  const targetElement = target.element || null;
  const weaknesses = new Set(target.weaknesses || []);
  const resistances = new Set(target.resistances || []);
  let multiplier = 1;

  if (weaknesses.has(attackElement)) multiplier = ELEMENT_ADVANTAGE;
  else if (resistances.has(attackElement)) multiplier = options.pierceResist ? 0.9 : ELEMENT_RESIST;
  else if (targetElement && targetElement === attackElement) multiplier = options.pierceResist
    ? 1
    : ELEMENT_SAME_RESIST;

  if (classId === "mage" && multiplier > 1) multiplier += MAGE_ADVANTAGE_BONUS;
  return Number(multiplier.toFixed(2));
}

export function elementMatchLabel(multiplier: number) {
  if (multiplier >= ELEMENT_ADVANTAGE) return "克制";
  if (multiplier <= ELEMENT_RESIST) return "抗性";
  if (multiplier === 0.9) return "穿透抗性";
  if (multiplier < 1) return "同属性";
  return "";
}

export function elementTags(target?: {
  element?: string | null;
  weaknesses?: string[];
  resistances?: string[];
}) {
  if (!target?.element && !target?.weaknesses?.length && !target?.resistances?.length) return "";
  const parts = [];
  if (target.element) parts.push(`属性 ${elementName(target.element)}`);
  if (target.weaknesses?.length)
    parts.push(`弱 ${target.weaknesses.map((entry) => elementName(entry)).filter(Boolean).join("/")}`);
  if (target.resistances?.length)
    parts.push(`抗 ${target.resistances.map((entry) => elementName(entry)).filter(Boolean).join("/")}`);
  return parts.filter(Boolean).join(" · ");
}

export function elementResistText(resistances?: string[]) {
  if (!resistances?.length) return "";
  return `抗 ${resistances.map((entry) => elementName(entry)).filter(Boolean).join("/")}`;
}
