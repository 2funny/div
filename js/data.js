const CLASSES = {
  warrior: {
    name: "剑士",
    avatar: "剑",
    desc: "稳定耐打，适合第一次进入地牢。",
    stats: { atk: 8, mag: 2, def: 7, res: 4, spd: 4, luk: 3 },
    hp: 120,
    mp: 32,
    skills: [
      { id: "heavy", name: "重斩", mp: 6, desc: "造成 170% 攻击伤害。", type: "damage", scale: "atk", power: 1.7 },
      { id: "guard", name: "格挡", mp: 4, desc: "本回合获得护盾并反击。", type: "guard", power: 0.5 },
      { id: "roar", name: "战吼", mp: 5, desc: "造成伤害并削弱敌人。", type: "weaken", scale: "atk", power: 1.0 }
    ]
  },
  mage: {
    name: "法师",
    avatar: "法",
    desc: "爆发强，能用元素控制敌人。",
    stats: { atk: 3, mag: 10, def: 3, res: 7, spd: 4, luk: 3 },
    hp: 82,
    mp: 78,
    skills: [
      { id: "fireball", name: "火球术", mp: 8, desc: "造成高魔法伤害并灼烧。", type: "burn", scale: "mag", power: 1.55 },
      { id: "frost", name: "寒冰箭", mp: 7, desc: "造成伤害并减速。", type: "slow", scale: "mag", power: 1.25 },
      { id: "shield", name: "奥术护盾", mp: 9, desc: "获得大量护盾。", type: "shield", power: 1.3 }
    ]
  },
  ranger: {
    name: "游侠",
    avatar: "弓",
    desc: "高速暴击，擅长快速解决低防敌人。",
    stats: { atk: 7, mag: 3, def: 4, res: 4, spd: 9, luk: 7 },
    hp: 96,
    mp: 44,
    skills: [
      { id: "double", name: "连射", mp: 6, desc: "连续攻击两次。", type: "double", scale: "atk", power: 0.92 },
      { id: "step", name: "闪避步", mp: 5, desc: "提高闪避并准备暴击。", type: "evade", power: 1 },
      { id: "poison", name: "毒箭", mp: 7, desc: "造成伤害并中毒。", type: "poison", scale: "atk", power: 1.15 }
    ]
  }
};

const THEMES = [
  { id: "moss", name: "苔石入口", floors: [1, 2, 3], wallRate: 0.17, colorClass: "moss" },
  { id: "mine", name: "幽暗矿道", floors: [4, 5, 6], wallRate: 0.22, colorClass: "mine" },
  { id: "frost", name: "寒霜回廊", floors: [7, 8, 9], wallRate: 0.19, colorClass: "frost" },
  { id: "throne", name: "符文王座", floors: [10], wallRate: 0.05, colorClass: "throne" }
];

const RUNES = ["火焰", "寒冰", "雷霆", "吸血", "守护", "迅捷"];
const SLOTS = ["weapon", "armor", "boots", "ring", "amulet"];
const SLOT_NAMES = { weapon: "武器", armor: "护甲", boots: "鞋子", ring: "戒指", amulet: "护符" };
const STAT_NAMES = { atk: "攻击", mag: "法强", def: "防御", res: "抗性", spd: "速度", luk: "幸运" };
const SAVE_KEY = "rune-dungeon-save-v1";
const MAP_SIZE = 15;

const ASSETS = {
  warrior: "assets/dawngeon/player-warrior.png",
  mage: "assets/dawngeon/player-mage.png",
  ranger: "assets/dawngeon/player-ranger.png",
  monster: "assets/dawngeon/monster.png",
  elite: "assets/dawngeon/elite.png",
  boss: "assets/dawngeon/boss.png",
  chest: "assets/dawngeon/chest.png",
  altar: "assets/dawngeon/altar.png",
  forge: "assets/dawngeon/forge.png",
  shop: "assets/dawngeon/shop.png",
  trap: "assets/dawngeon/trap.png",
  portal: "assets/dawngeon/portal.png"
};

const LEGEND_ITEMS = [
  ["player", "你", "当前位置"],
  ["monster", "怪", "普通怪"],
  ["elite", "精英", "精英怪"],
  ["boss", "Boss", "首领"],
  ["chest", "宝箱", "奖励"],
  ["altar", "祭坛", "恢复"],
  ["forge", "合成", "强化/符文"],
  ["shop", "商人", "补给"],
  ["trap", "陷阱", "伤害"],
  ["portal", "传送", "下一层"]
];
