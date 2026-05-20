export function xpForNextLevel(level: number) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  const earlyCurve = 16 + safeLevel * 8;
  const latePressure = safeLevel <= 8 ? 0 : Math.floor((safeLevel - 8) ** 2 * 0.22);
  return earlyCurve + latePressure;
}

export function recommendedLevelForFloor(floor: number) {
  return Math.max(1, Math.floor(Number(floor) || 1) + 12);
}

export function overlevelXpMultiplier(level: number, floor: number) {
  const over = Math.max(0, Math.floor(Number(level) || 1) - recommendedLevelForFloor(floor));
  if (over <= 0) return 1;
  return Math.max(0.35, 1 - over * 0.045);
}

export function skillPointGainForLevel(level: number) {
  return level % 2 === 0 ? 1 : 0;
}
