import type { PlayerClass } from "../types";

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
        power: 1.35,
        branches: [
          {
            id: "cleave",
            name: "裂斩",
            desc: "伤害更高，但耗蓝 +1。",
            powerBonus: 0.16,
            mpDelta: 1
          },
          {
            id: "breaker",
            name: "破甲",
            desc: "对抗性目标更稳定。",
            powerBonus: 0.04,
            pierceResist: true
          }
        ]
      },
      {
        id: "guard",
        name: "格挡",
        mp: 3,
        desc: "本回合获得护盾并反击。",
        type: "guard",
        power: 0.45,
        branches: [
          { id: "bulwark", name: "壁垒", desc: "格挡反击更强。", powerBonus: 0.12 },
          { id: "ward", name: "守势", desc: "耗蓝 -1。", mpDelta: -1 }
        ]
      },
      {
        id: "roar",
        name: "战吼",
        mp: 5,
        desc: "造成伤害并削弱敌人。",
        type: "weaken",
        scale: "atk",
        power: 0.85,
        element: "dark",
        branches: [
          { id: "intimidate", name: "震慑", desc: "伤害略高。", powerBonus: 0.1 },
          { id: "sunder", name: "碎抗", desc: "暗属性伤害可部分穿透抗性。", pierceResist: true }
        ]
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
        power: 1.45,
        element: "fire",
        branches: [
          {
            id: "burst",
            name: "爆裂",
            desc: "伤害更高，但耗蓝 +1。",
            powerBonus: 0.18,
            mpDelta: 1
          },
          { id: "ember", name: "余烬", desc: "灼烧伤害提高。", powerBonus: -0.04, statusBonus: 3 }
        ]
      },
      {
        id: "frost",
        name: "寒冰箭",
        mp: 4,
        desc: "造成伤害并减速。",
        type: "slow",
        scale: "mag",
        power: 1.15,
        element: "ice",
        branches: [
          { id: "deep-freeze", name: "深寒", desc: "伤害提高。", powerBonus: 0.12 },
          {
            id: "shatter-ice",
            name: "碎冰",
            desc: "冰属性伤害可部分穿透抗性。",
            pierceResist: true
          }
        ]
      },
      {
        id: "shield",
        name: "奥术护盾",
        mp: 5,
        desc: "获得大量护盾。",
        type: "shield",
        power: 1.3,
        branches: [
          { id: "focus", name: "凝神", desc: "耗蓝 -1。", mpDelta: -1 },
          { id: "aegis", name: "秘盾", desc: "护盾效果更强。", powerBonus: 0.15 }
        ]
      }
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
        power: 0.86,
        branches: [
          { id: "rapid", name: "疾射", desc: "耗蓝 -1。", mpDelta: -1 },
          { id: "charged", name: "蓄势", desc: "每箭伤害提高。", powerBonus: 0.08, mpDelta: 1 }
        ]
      },
      {
        id: "step",
        name: "闪避步",
        mp: 3,
        desc: "提高闪避并准备暴击。",
        type: "evade",
        power: 1,
        branches: [
          { id: "light-step", name: "轻步", desc: "耗蓝 -1。", mpDelta: -1 },
          { id: "counter-step", name: "反击步", desc: "后续输出略强。", powerBonus: 0.1 }
        ]
      },
      {
        id: "poison",
        name: "毒箭",
        mp: 4,
        desc: "造成伤害并中毒。",
        type: "poison",
        scale: "atk",
        power: 1.05,
        element: "poison",
        branches: [
          { id: "corrode", name: "腐蚀", desc: "中毒伤害提高。", statusBonus: 3 },
          {
            id: "venom-burst",
            name: "毒爆",
            desc: "伤害更高，但耗蓝 +1。",
            powerBonus: 0.16,
            mpDelta: 1
          }
        ]
      }
    ]
  }
};
