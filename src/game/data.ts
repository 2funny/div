import type { PlayerClass, SlotKey, StatKey } from "./types";

export const CLASSES: Record<string, PlayerClass> = {
  warrior: {
    name: "剑士",
    avatar: "剑",
    role: "前排压制",
    primary: "攻击 / 防御",
    desc: "生命和格挡成长更高，靠近战、护盾和削弱稳扎稳打。",
    stats: { atk: 4, mag: 1, def: 4, res: 2, spd: 2, luk: 1 },
    hp: 46,
    mp: 12,
    growth: { hp: 4, mp: 1, primary: "atk", primaryEvery: 2, secondary: "def", secondaryEvery: 4 },
    skills: [
      {
        id: "heavy",
        name: "重斩",
        mp: 4,
        desc: "造成高额攻击伤害。",
        type: "damage",
        scale: "atk",
        power: 1.35
      },
      {
        id: "guard",
        name: "格挡",
        mp: 3,
        desc: "本回合获得护盾并反击。",
        type: "guard",
        power: 0.45
      },
      {
        id: "roar",
        name: "战吼",
        mp: 5,
        desc: "造成伤害并削弱敌人。",
        type: "weaken",
        scale: "atk",
        power: 0.85
      }
    ]
  },
  mage: {
    name: "法师",
    avatar: "法",
    role: "元素爆发",
    primary: "法强 / 抗性",
    desc: "生命较低，法力和法强成长最高，依靠燃烧、减速和护盾处理战斗。",
    stats: { atk: 1, mag: 6, def: 1, res: 4, spd: 2, luk: 2 },
    hp: 32,
    mp: 30,
    growth: { hp: 2, mp: 4, primary: "mag", primaryEvery: 2, secondary: "res", secondaryEvery: 4 },
    skills: [
      {
        id: "fireball",
        name: "火球术",
        mp: 5,
        desc: "造成高魔法伤害并灼烧。",
        type: "burn",
        scale: "mag",
        power: 1.45
      },
      {
        id: "frost",
        name: "寒冰箭",
        mp: 4,
        desc: "造成伤害并减速。",
        type: "slow",
        scale: "mag",
        power: 1.15
      },
      { id: "shield", name: "奥术护盾", mp: 5, desc: "获得大量护盾。", type: "shield", power: 1.3 }
    ]
  },
  ranger: {
    name: "游侠",
    avatar: "弓",
    role: "高速游击",
    primary: "速度 / 幸运",
    desc: "速度和暴击成长突出，靠连击、闪避和持续伤害换取主动权。",
    stats: { atk: 4, mag: 1, def: 2, res: 2, spd: 6, luk: 4 },
    hp: 38,
    mp: 18,
    growth: { hp: 3, mp: 2, primary: "spd", primaryEvery: 2, secondary: "luk", secondaryEvery: 4 },
    skills: [
      {
        id: "double",
        name: "连射",
        mp: 4,
        desc: "连续攻击两次。",
        type: "double",
        scale: "atk",
        power: 0.86
      },
      { id: "step", name: "闪避步", mp: 3, desc: "提高闪避并准备暴击。", type: "evade", power: 1 },
      {
        id: "poison",
        name: "毒箭",
        mp: 4,
        desc: "造成伤害并中毒。",
        type: "poison",
        scale: "atk",
        power: 1.05
      }
    ]
  }
};

export const THEMES = [
  { id: "moss", name: "苔石入口", floors: [1, 2, 3], wallRate: 0.17, colorClass: "moss" },
  { id: "mine", name: "幽暗矿道", floors: [4, 5, 6], wallRate: 0.22, colorClass: "mine" },
  { id: "frost", name: "寒霜回廊", floors: [7, 8, 9], wallRate: 0.19, colorClass: "frost" },
  { id: "throne", name: "符文王座", floors: [10], wallRate: 0.05, colorClass: "throne" }
];

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

export const RUNES = ["火焰", "寒冰", "雷霆", "吸血", "守护", "迅捷"];
export const SLOTS: SlotKey[] = ["weapon", "armor", "boots", "ring", "amulet"];
export const SLOT_NAMES: Record<SlotKey, string> = {
  weapon: "武器",
  armor: "护甲",
  boots: "鞋子",
  ring: "戒指",
  amulet: "护符"
};
export const STAT_NAMES: Record<StatKey, string> = {
  atk: "攻击",
  mag: "法强",
  def: "防御",
  res: "抗性",
  spd: "速度",
  luk: "幸运"
};
export const SAVE_KEY = "rune-dungeon-save-v1";
export const DEFAULT_CLASS_ID = "warrior";
export const MASTER_VOLUME = 0.92;
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

export const ASSETS = {
  warrior: "assets/dawngeon/player-warrior.png",
  mage: "assets/dawngeon/player-mage.png",
  ranger: "assets/dawngeon/player-ranger-dark.svg",
  monster: "assets/dawngeon/monster-slime-dark.svg",
  monsterRat: "assets/dawngeon/monster-rat-dark.svg",
  monsterBat: "assets/dawngeon/monster-bat-dark.svg",
  monsterWolf: "assets/dawngeon/monster-wolf-dark.svg",
  elite: "assets/dawngeon/elite-dark.svg",
  boss: "assets/dawngeon/boss-dark.svg",
  chest: "assets/dawngeon/chest.png",
  altar: "assets/dawngeon/altar-dark.svg",
  forge: "assets/dawngeon/forge-dark.svg",
  shop: "assets/dawngeon/merchant-dark.svg",
  questNpc: "assets/dawngeon/quest-npc-dark.svg",
  fenceGate: "assets/dawngeon/fence-gate-dark.svg",
  trap: "assets/dawngeon/trap-spikes-dark.svg",
  portal: "assets/dawngeon/portal-dark.svg",
  stairsDown: "assets/dawngeon/stairs-down-dark.svg",
  stairsUp: "assets/dawngeon/stairs-up-dark.svg",
  floor: "assets/dawngeon/floor-dark.svg",
  wall: "assets/dawngeon/wall-dark.svg"
};

export const LEGEND_ITEMS = [
  ["player", "你", "当前位置"],
  ["monster", "怪", "普通怪"],
  ["elite", "精英", "精英怪"],
  ["boss", "Boss", "首领"],
  ["chest", "宝箱", "奖励"],
  ["locked-chest", "锁箱", "钥匙奖励"],
  ["altar", "祭坛", "恢复"],
  ["forge", "合成", "强化/符文"],
  ["shop", "商人", "补给"],
  ["questNpc", "委托", "中立委托人"],
  ["lockedDoor", "锁门", "需要指定钥匙或万能钥匙"],
  ["fenceGate", "门栅", "需要钥匙打开"],
  ["trap", "陷阱", "伤害"],
  ["portal", "传送", "下一层"]
];
