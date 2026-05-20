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
    passives: [
      {
        id: "frontline",
        name: "前线韧性",
        desc: "高生命和防御成长，适合承受反击。",
        tags: ["防御", "生命"]
      }
    ],
    skills: [
      {
        id: "heavy",
        name: "重斩",
        mp: 4,
        cooldown: 2,
        desc: "造成高额攻击伤害。",
        type: "damage",
        scale: "atk",
        power: 1.35,
        baseDamage: 4,
        atkMultiplier: 1.35,
        starter: true,
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
        cooldown: 2,
        desc: "本回合获得护盾并反击。",
        type: "guard",
        power: 0.45,
        baseDamage: 2,
        starter: true,
        branches: [
          { id: "bulwark", name: "壁垒", desc: "格挡反击更强。", powerBonus: 0.12 },
          { id: "ward", name: "守势", desc: "耗蓝 -1。", mpDelta: -1 }
        ]
      },
      {
        id: "roar",
        name: "战吼",
        mp: 5,
        cooldown: 3,
        desc: "造成伤害并削弱敌人。",
        type: "weaken",
        scale: "atk",
        power: 0.85,
        baseDamage: 3,
        atkMultiplier: 0.85,
        element: "dark",
        starter: true,
        branches: [
          { id: "intimidate", name: "震慑", desc: "伤害略高。", powerBonus: 0.1 },
          { id: "sunder", name: "碎抗", desc: "暗属性伤害可部分穿透抗性。", pierceResist: true }
        ]
      },
      {
        id: "shieldBash",
        name: "盾击",
        mp: 5,
        cooldown: 2,
        desc: "以防御转化为打击伤害，适合高防御剑士。",
        type: "damage",
        scale: "atk",
        power: 1,
        baseDamage: 5,
        atkMultiplier: 0.65,
        defMultiplier: 0.8,
        requires: { level: 4, def: 5 },
        branches: [
          { id: "stagger", name: "震退", desc: "伤害提高。", powerBonus: 0.1 },
          { id: "low-guard", name: "低架", desc: "耗蓝 -1。", mpDelta: -1 }
        ]
      },
      {
        id: "ironWill",
        name: "钢铁意志",
        mp: 6,
        cooldown: 3,
        desc: "获得厚重护盾，依赖防御与生命上限。",
        type: "shield",
        power: 1.05,
        baseDamage: 0,
        defMultiplier: 0.4,
        hpMultiplier: 0.04,
        requires: { level: 8, hp: 72, def: 7 },
        branches: [
          { id: "unyielding", name: "不屈", desc: "护盾效果更强。", powerBonus: 0.12 },
          { id: "tempered", name: "淬心", desc: "冷却 -1。", cooldownDelta: -1 }
        ]
      },
      {
        id: "sweepingStrike",
        name: "旋身斩",
        mp: 4,
        cooldown: 1,
        desc: "低冷却的稳定斩击，适合在普通战斗中轮转使用。",
        type: "damage",
        scale: "atk",
        power: 1.12,
        baseDamage: 3,
        atkMultiplier: 1.02,
        requires: { level: 3, atk: 6 },
        branches: [
          { id: "wide-arc", name: "宽弧", desc: "伤害提高。", powerBonus: 0.1 },
          { id: "steady-arc", name: "稳步", desc: "耗蓝 -1。", mpDelta: -1 }
        ]
      },
      {
        id: "challenge",
        name: "挑衅",
        mp: 7,
        cooldown: 3,
        desc: "挑衅敌人并削弱攻击，更适合长战。",
        type: "weaken",
        scale: "atk",
        power: 0.95,
        baseDamage: 5,
        atkMultiplier: 0.75,
        defMultiplier: 0.45,
        requires: { level: 10, hp: 82, def: 8 },
        branches: [
          { id: "deep-taunt", name: "深压", desc: "伤害提高。", powerBonus: 0.1 },
          { id: "dark-challenge", name: "暗誓", desc: "转为暗属性并穿透抗性。", element: "dark", pierceResist: true }
        ]
      },
      {
        id: "execution",
        name: "处决",
        mp: 9,
        cooldown: 4,
        desc: "高消耗重击，依赖攻击与等级积累。",
        type: "damage",
        scale: "atk",
        power: 1.75,
        baseDamage: 10,
        atkMultiplier: 1.75,
        requires: { level: 14, atk: 11, skills: ["heavy"] },
        branches: [
          { id: "headsman", name: "断首", desc: "伤害更高，但耗蓝 +1。", powerBonus: 0.18, mpDelta: 1 },
          { id: "rune-edge", name: "符刃", desc: "暗属性并可部分穿透抗性。", element: "dark", pierceResist: true }
        ]
      },
      {
        id: "earthsplitter",
        name: "裂地斩",
        mp: 12,
        cooldown: 5,
        desc: "高防御战士的终盘重斩，同时依赖攻击与防御。",
        type: "damage",
        scale: "atk",
        power: 1.6,
        baseDamage: 14,
        atkMultiplier: 1.35,
        defMultiplier: 0.9,
        requires: { level: 18, atk: 15, def: 11, skills: ["shieldBash"] },
        branches: [
          { id: "fault-line", name: "裂隙", desc: "伤害更高，但耗蓝 +1。", powerBonus: 0.16, mpDelta: 1 },
          { id: "stone-oath", name: "石誓", desc: "冷却 -1。", cooldownDelta: -1 }
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
    passives: [
      {
        id: "elementalist",
        name: "元素专注",
        desc: "以法强和法力驱动高倍率元素技能。",
        tags: ["元素", "法力"]
      }
    ],
    skills: [
      {
        id: "fireball",
        name: "火球术",
        mp: 5,
        cooldown: 2,
        desc: "造成高魔法伤害并灼烧。",
        type: "burn",
        scale: "mag",
        power: 1.45,
        baseDamage: 5,
        magMultiplier: 1.45,
        element: "fire",
        starter: true,
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
        cooldown: 2,
        desc: "造成伤害并减速。",
        type: "slow",
        scale: "mag",
        power: 1.15,
        baseDamage: 4,
        magMultiplier: 1.15,
        element: "ice",
        starter: true,
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
        cooldown: 3,
        desc: "获得大量护盾。",
        type: "shield",
        power: 1.3,
        starter: true,
        branches: [
          { id: "focus", name: "凝神", desc: "耗蓝 -1。", mpDelta: -1 },
          { id: "aegis", name: "秘盾", desc: "护盾效果更强。", powerBonus: 0.15 }
        ]
      },
      {
        id: "spark",
        name: "雷光术",
        mp: 6,
        cooldown: 2,
        desc: "释放雷属性伤害，适合对抗冰与机关类敌人。",
        type: "damage",
        scale: "mag",
        power: 1.25,
        baseDamage: 5,
        magMultiplier: 1.25,
        element: "thunder",
        requires: { level: 4, mag: 8 },
        branches: [
          { id: "arc", name: "跃弧", desc: "伤害提高。", powerBonus: 0.12 },
          { id: "charged-mind", name: "蓄念", desc: "耗蓝 -1。", mpDelta: -1 }
        ]
      },
      {
        id: "manaWard",
        name: "法力壁垒",
        mp: 8,
        cooldown: 3,
        desc: "以法力和抗性凝成护盾。",
        type: "shield",
        power: 1.2,
        baseDamage: 0,
        magMultiplier: 0.2,
        defMultiplier: 0,
        requires: { level: 8, mp: 58, res: 6 },
        branches: [
          { id: "mirror-ward", name: "镜壁", desc: "护盾效果更强。", powerBonus: 0.14 },
          { id: "quiet-cast", name: "静默施法", desc: "冷却 -1。", cooldownDelta: -1 }
        ]
      },
      {
        id: "arcaneNeedle",
        name: "奥术针",
        mp: 4,
        cooldown: 1,
        desc: "快速的纯法术打击，耗蓝低但上限较低。",
        type: "damage",
        scale: "mag",
        power: 1.05,
        baseDamage: 3,
        magMultiplier: 1.05,
        requires: { level: 3, mag: 7 },
        branches: [
          { id: "needle-storm", name: "针雨", desc: "伤害提高。", powerBonus: 0.1 },
          { id: "clear-cast", name: "清吟", desc: "耗蓝 -1。", mpDelta: -1 }
        ]
      },
      {
        id: "voidPulse",
        name: "虚空脉冲",
        mp: 8,
        cooldown: 3,
        desc: "暗属性脉冲，造成伤害并削弱敌人。",
        type: "weaken",
        scale: "mag",
        power: 1.05,
        baseDamage: 7,
        magMultiplier: 1.05,
        element: "dark",
        requires: { level: 10, mag: 11, res: 7 },
        branches: [
          { id: "hollow-ring", name: "空环", desc: "伤害提高。", powerBonus: 0.12 },
          { id: "quiet-void", name: "静虚", desc: "冷却 -1。", cooldownDelta: -1 }
        ]
      },
      {
        id: "meteor",
        name: "陨星术",
        mp: 13,
        cooldown: 4,
        desc: "高消耗火属性爆发，并留下灼烧。",
        type: "burn",
        scale: "mag",
        power: 1.85,
        baseDamage: 12,
        magMultiplier: 1.85,
        element: "fire",
        requires: { level: 14, mag: 13, skills: ["fireball"] },
        branches: [
          { id: "falling-star", name: "坠星", desc: "伤害更高，但耗蓝 +1。", powerBonus: 0.18, mpDelta: 1 },
          { id: "long-burn", name: "余火", desc: "灼烧伤害提高。", powerBonus: -0.04, statusBonus: 4 }
        ]
      },
      {
        id: "starPrison",
        name: "星牢",
        mp: 15,
        cooldown: 5,
        desc: "高等级法术图阵，以法强与法力上限压制敌人。",
        type: "slow",
        scale: "mag",
        power: 1.55,
        baseDamage: 12,
        magMultiplier: 1.45,
        element: "ice",
        requires: { level: 18, mag: 16, mp: 92, skills: ["frost"] },
        branches: [
          { id: "absolute-zero", name: "零度", desc: "伤害更高，但耗蓝 +1。", powerBonus: 0.16, mpDelta: 1 },
          { id: "cold-star", name: "寒星", desc: "冰属性伤害可部分穿透抗性。", pierceResist: true }
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
    passives: [
      {
        id: "ranger_combo",
        name: "游击连击",
        desc: "普通攻击有概率追加一次普通攻击，概率随速度提高。",
        tags: ["连击", "速度"],
        chanceBase: 0.08,
        chancePerSpeed: 0.006,
        chanceMax: 0.55
      },
      {
        id: "ranger_followup",
        name: "追击本能",
        desc: "攻击型技能可触发一次普通追击，不会重复施放技能。",
        tags: ["追击", "技能"],
        chanceBase: 0.1,
        chancePerSpeed: 0.004,
        chanceMax: 0.4,
        value: 0.65
      },
      {
        id: "ranger_evasion",
        name: "轻身闪避",
        desc: "速度提高闪避概率，最终概率最多 95%。",
        tags: ["闪避", "速度"]
      }
    ],
    skills: [
      {
        id: "double",
        name: "连射",
        mp: 4,
        cooldown: 2,
        desc: "射出一记强力箭矢，并有概率触发追击。",
        type: "double",
        scale: "atk",
        power: 0.96,
        baseDamage: 3,
        atkMultiplier: 0.96,
        starter: true,
        branches: [
          { id: "rapid", name: "疾射", desc: "耗蓝 -1。", mpDelta: -1 },
          { id: "charged", name: "蓄势", desc: "每箭伤害提高。", powerBonus: 0.08, mpDelta: 1 }
        ]
      },
      {
        id: "step",
        name: "闪避步",
        mp: 3,
        cooldown: 2,
        desc: "提高闪避并准备暴击。",
        type: "evade",
        power: 1,
        starter: true,
        branches: [
          { id: "light-step", name: "轻步", desc: "耗蓝 -1。", mpDelta: -1 },
          { id: "counter-step", name: "反击步", desc: "后续输出略强。", powerBonus: 0.1 }
        ]
      },
      {
        id: "poison",
        name: "毒箭",
        mp: 4,
        cooldown: 2,
        desc: "造成伤害并中毒。",
        type: "poison",
        scale: "atk",
        power: 1.05,
        baseDamage: 3,
        atkMultiplier: 1.05,
        element: "poison",
        starter: true,
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
      },
      {
        id: "aimedShot",
        name: "瞄准射击",
        mp: 5,
        cooldown: 2,
        desc: "稳定的高命中箭术，依赖攻击与幸运。",
        type: "damage",
        scale: "atk",
        power: 1.25,
        baseDamage: 4,
        atkMultiplier: 1.12,
        requires: { level: 4, spd: 8 },
        branches: [
          { id: "keen-eye", name: "鹰眼", desc: "伤害提高。", powerBonus: 0.1 },
          { id: "quick-nock", name: "速搭", desc: "耗蓝 -1。", mpDelta: -1 }
        ]
      },
      {
        id: "smokeStep",
        name: "烟雾步",
        mp: 5,
        cooldown: 3,
        desc: "更强的闪避步法，并准备下一次反击。",
        type: "evade",
        power: 1.18,
        requires: { level: 8, spd: 11, luk: 5 },
        branches: [
          { id: "vanish", name: "隐没", desc: "后续输出更强。", powerBonus: 0.12 },
          { id: "short-smoke", name: "短烟", desc: "冷却 -1。", cooldownDelta: -1 }
        ]
      },
      {
        id: "markShot",
        name: "标记射击",
        mp: 4,
        cooldown: 1,
        desc: "低消耗的精准射击，适合初期补充输出。",
        type: "damage",
        scale: "atk",
        power: 1.08,
        baseDamage: 3,
        atkMultiplier: 0.95,
        requires: { level: 3, luk: 5 },
        branches: [
          { id: "sure-mark", name: "稳标", desc: "伤害提高。", powerBonus: 0.1 },
          { id: "cheap-mark", name: "轻标", desc: "耗蓝 -1。", mpDelta: -1 }
        ]
      },
      {
        id: "serratedArrow",
        name: "锯齿箭",
        mp: 6,
        cooldown: 3,
        desc: "利用毒刃箭造成持续伤害，适合对抗高生命目标。",
        type: "poison",
        scale: "atk",
        power: 1.12,
        baseDamage: 5,
        atkMultiplier: 1.02,
        element: "poison",
        requires: { level: 10, atk: 9, spd: 12 },
        branches: [
          { id: "deep-serration", name: "深锯", desc: "中毒伤害提高。", statusBonus: 3 },
          { id: "barbed-point", name: "倒刺", desc: "伤害提高。", powerBonus: 0.12 }
        ]
      },
      {
        id: "stormArrows",
        name: "风暴箭",
        mp: 10,
        cooldown: 4,
        desc: "雷属性连射，依赖速度和攻击的长期成长。",
        type: "double",
        scale: "atk",
        power: 1.35,
        baseDamage: 8,
        atkMultiplier: 1.2,
        element: "thunder",
        requires: { level: 14, spd: 15, skills: ["double"] },
        branches: [
          { id: "tempest", name: "骤雨", desc: "伤害更高，但耗蓝 +1。", powerBonus: 0.15, mpDelta: 1 },
          { id: "static-string", name: "电弦", desc: "雷属性伤害可部分穿透抗性。", pierceResist: true }
        ]
      },
      {
        id: "phantomBarrage",
        name: "幻影连射",
        mp: 12,
        cooldown: 5,
        desc: "高速高幸运的终盘连射技，保留游侠追击特色。",
        type: "double",
        scale: "atk",
        power: 1.42,
        baseDamage: 10,
        atkMultiplier: 1.18,
        requires: { level: 18, spd: 18, luk: 10, skills: ["aimedShot"] },
        branches: [
          { id: "ghost-string", name: "魂弦", desc: "冷却 -1。", cooldownDelta: -1 },
          { id: "lucky-volley", name: "幸运齐射", desc: "伤害更高，但耗蓝 +1。", powerBonus: 0.15, mpDelta: 1 }
        ]
      }
    ]
  }
};
