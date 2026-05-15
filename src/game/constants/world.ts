export const THEMES = [
  { id: "moss", name: "苔石入口", floors: range(1, 5), wallRate: 0.17, colorClass: "moss" },
  { id: "mine", name: "幽暗矿道", floors: range(6, 10), wallRate: 0.22, colorClass: "mine" },
  { id: "frost", name: "寒霜回廊", floors: range(11, 16), wallRate: 0.19, colorClass: "frost" },
  { id: "fungal", name: "荧菌深庭", floors: range(17, 22), wallRate: 0.2, colorClass: "fungal" },
  { id: "cistern", name: "沉钟水廊", floors: range(23, 28), wallRate: 0.18, colorClass: "cistern" },
  { id: "ember", name: "赤曜熔脉", floors: range(29, 34), wallRate: 0.16, colorClass: "ember" },
  { id: "archive", name: "风蚀书库", floors: range(35, 40), wallRate: 0.2, colorClass: "archive" },
  { id: "astral", name: "星砂祭坛", floors: range(41, 46), wallRate: 0.15, colorClass: "astral" },
  { id: "shadow", name: "影幕王城", floors: range(47, 52), wallRate: 0.19, colorClass: "shadow" },
  { id: "void", name: "虚空回廊", floors: range(53, 60), wallRate: 0.14, colorClass: "void" },
  { id: "throne", name: "符文王座", floors: range(61, 66), wallRate: 0.05, colorClass: "throne" }
];

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export const FLOOR_EFFECTS = [
  {
    id: "rain",
    name: "暴雨层",
    className: "effect-rain",
    desc: "雨幕让怪物更凶，但地牢会冲出更多战利品。",
    difficulty: 1.08,
    reward: 1.12,
    minFloor: 4
  },
  {
    id: "snow",
    name: "霜雪层",
    className: "effect-snow",
    desc: "寒雪压低视线，精英和宝藏都更常见。",
    difficulty: 1.1,
    reward: 1.14,
    minFloor: 6
  },
  {
    id: "lava",
    name: "熔岩层",
    className: "effect-lava",
    desc: "地脉热浪强化敌人，也让奖励更加丰厚。",
    difficulty: 1.14,
    reward: 1.18,
    minFloor: 8
  }
];

export const MAX_FLOOR = 66;
export const MAP_SIZE = 27;
export const MAP_SIZE_MIN = 23;
export const MAP_SIZE_MAX = 31;
export const MAP_VIEW_SIZE = 15;
export const VISION_RADIUS = 3;

export function isValidMapSize(size: unknown): size is number {
  return (
    typeof size === "number" &&
    Number.isInteger(size) &&
    size >= MAP_SIZE_MIN &&
    size <= MAP_SIZE_MAX
  );
}
