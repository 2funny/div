import type { GameState, Item } from "../types";

export type RoomEventChoice = {
  id: string;
  text: string;
  desc: string;
  relation?: { id: "wardens" | "merchants" | "survivors" | "runebound"; delta: number };
  flag?: string;
  canChoose?: (ctx: RoomEventContext) => boolean;
  apply: (ctx: RoomEventContext) => RoomEventResult;
};

export type RoomEventDef = {
  id: string;
  title: string;
  summary: string;
  minFloor: number;
  category: RoomEventCategory;
  risk: RoomEventRisk;
  choices: RoomEventChoice[];
};

export type RoomEventCategory = "reward" | "risk" | "trade" | "rest";

export type RoomEventRisk = "safe" | "low" | "medium" | "high";

const CATEGORY_LABELS: Record<RoomEventCategory, string> = {
  reward: "资源",
  risk: "风险",
  trade: "交易",
  rest: "整备"
};

const RISK_LABELS: Record<RoomEventRisk, string> = {
  safe: "安全",
  low: "轻微风险",
  medium: "中等风险",
  high: "高风险"
};

export type RoomEventContext = {
  state: GameState;
  randomEquipment: () => Item;
  randomRune: () => string;
  scaledReward: (value: number) => number;
};

export type RoomEventResult = {
  log: string;
  body: string;
};

export const ROOM_EVENTS: RoomEventDef[] = [
  {
    id: "cracked_altar",
    category: "risk",
    risk: "medium",
    title: "裂纹祭坛",
    summary: "祭坛里的符文还在发烫，像是在索要一段生命。",
    minFloor: 2,
    choices: [
      {
        id: "blood_for_rune",
        text: "献出生命",
        desc: "损失少量生命，换取一枚随机符文。",
        relation: { id: "runebound", delta: 2 },
        flag: "altar_blood_pact",
        canChoose: ({ state }) => (state.hp || 0) > Math.ceil((state.maxHp || 1) * 0.18),
        apply: ({ state, randomRune }) => {
          const cost = Math.max(3, Math.ceil((state.maxHp || 1) * 0.15));
          const rune = randomRune();
          state.hp = Math.max(1, (state.hp || 1) - cost);
          state.runes = state.runes || {};
          state.runes[rune] = (state.runes[rune] || 0) + 1;
          return {
            log: `裂纹祭坛吞下一点生命，吐出${rune}符文。`,
            body: `<p>生命 -${cost}</p><p>获得符文：${rune}</p>`
          };
        }
      },
      {
        id: "salvage_altar_dust",
        text: "刮取粉尘",
        desc: "不冒险，只收集少量魔尘和金币。",
        relation: { id: "wardens", delta: 1 },
        flag: "altar_salvaged",
        apply: ({ state, scaledReward }) => {
          const gold = scaledReward(8 + (state.floor || 1) * 2);
          state.materials = state.materials || {};
          state.materials["魔尘"] = (state.materials["魔尘"] || 0) + 1;
          state.gold = (state.gold || 0) + gold;
          return {
            log: "你刮下祭坛边缘的符文粉尘。",
            body: `<p>获得魔尘 +1</p><p>金币 +${gold}</p>`
          };
        }
      }
    ]
  },
  {
    id: "sealed_cache",
    category: "trade",
    risk: "medium",
    title: "封存补给箱",
    summary: "一只旧补给箱被符文扣锁压住，箱面刻着褪色的商路记号。",
    minFloor: 3,
    choices: [
      {
        id: "spend_key_for_cache",
        text: "用钥匙开启",
        desc: "消耗一把符文钥匙，获得一件装备。",
        relation: { id: "merchants", delta: 2 },
        flag: "cache_opened_cleanly",
        canChoose: ({ state }) => (state.keys || 0) > 0,
        apply: ({ state, randomEquipment }) => {
          const loot = randomEquipment();
          state.keys = Math.max(0, (state.keys || 0) - 1);
          state.inventory = state.inventory || [];
          state.inventory.push(loot);
          return {
            log: `你打开封存补给箱，取出${loot.name}。`,
            body: `<p>符文钥匙 -1</p><p>获得装备：${loot.name}</p>`
          };
        }
      },
      {
        id: "force_cache",
        text: "强行撬开",
        desc: "受到机关伤害，但能拿到金币和材料。",
        relation: { id: "merchants", delta: -1 },
        flag: "cache_forced",
        apply: ({ state, scaledReward }) => {
          const damage = 6 + Math.ceil((state.floor || 1) * 0.8);
          const gold = scaledReward(12 + (state.floor || 1) * 3);
          state.hp = Math.max(1, (state.hp || 1) - damage);
          state.gold = (state.gold || 0) + gold;
          state.materials = state.materials || {};
          state.materials["强化石"] = (state.materials["强化石"] || 0) + 1;
          return {
            log: "补给箱的机关划伤了你，但箱底还有可用物资。",
            body: `<p>生命 -${damage}</p><p>金币 +${gold}<br>强化石 +1</p>`
          };
        }
      }
    ]
  },
  {
    id: "lost_pack",
    category: "rest",
    risk: "safe",
    title: "遗失背包",
    summary: "角落里有只被割开的背包，里面还剩一些没被潮气毁掉的补给。",
    minFloor: 4,
    choices: [
      {
        id: "sort_lost_pack",
        text: "整理补给",
        desc: "获得金币，并恢复少量生命和法力。",
        relation: { id: "survivors", delta: 1 },
        flag: "lost_pack_sorted",
        apply: ({ state, scaledReward }) => {
          const gold = scaledReward(10 + (state.floor || 1) * 2);
          const hp = 8 + Math.ceil((state.floor || 1) * 1.2);
          const mp = 5 + Math.ceil((state.floor || 1) * 0.8);
          state.gold = (state.gold || 0) + gold;
          state.hp = Math.min(state.maxHp || state.hp || 1, (state.hp || 0) + hp);
          state.mp = Math.min(state.maxMp || state.mp || 0, (state.mp || 0) + mp);
          return {
            log: "你从遗失背包里整理出还能用的补给。",
            body: `<p>金币 +${gold}</p><p>恢复生命 ${hp}，法力 ${mp}</p>`
          };
        }
      },
      {
        id: "strip_lost_pack",
        text: "拆下扣环",
        desc: "获得魔尘和强化石。",
        relation: { id: "survivors", delta: -1 },
        flag: "lost_pack_stripped",
        apply: ({ state }) => {
          state.materials = state.materials || {};
          state.materials["魔尘"] = (state.materials["魔尘"] || 0) + 1;
          state.materials["强化石"] = (state.materials["强化石"] || 0) + 1;
          return {
            log: "你拆下背包上的符文扣环。",
            body: "<p>魔尘 +1<br>强化石 +1</p>"
          };
        }
      }
    ]
  },
  {
    id: "runaway_rune",
    category: "risk",
    risk: "medium",
    title: "失控符文",
    summary: "一枚符文悬在半空，周围的石屑被它反复吸起又抛下。",
    minFloor: 5,
    choices: [
      {
        id: "stabilize_rune",
        text: "用魔尘稳定",
        desc: "消耗魔尘，获得技能尘和随机符文。",
        relation: { id: "runebound", delta: 2 },
        flag: "rune_stabilized",
        canChoose: ({ state }) => (state.materials?.["魔尘"] || 0) > 0,
        apply: ({ state, randomRune }) => {
          const rune = randomRune();
          state.materials = state.materials || {};
          state.materials["魔尘"] = Math.max(0, (state.materials["魔尘"] || 0) - 1);
          state.skillDust = (state.skillDust || 0) + 2;
          state.runes = state.runes || {};
          state.runes[rune] = (state.runes[rune] || 0) + 1;
          return {
            log: `你用魔尘稳住失控符文，分离出${rune}。`,
            body: `<p>魔尘 -1</p><p>技能尘 +2<br>符文：${rune}</p>`
          };
        }
      },
      {
        id: "grab_rune",
        text: "强行抓取",
        desc: "受到法力灼伤，获得技能尘。",
        relation: { id: "runebound", delta: -1 },
        flag: "rune_forced",
        apply: ({ state }) => {
          const damage = 5 + Math.ceil((state.floor || 1) * 0.7);
          state.hp = Math.max(1, (state.hp || 1) - damage);
          state.skillDust = (state.skillDust || 0) + 1;
          return {
            log: "失控符文灼伤了你的手掌，也留下可用的技能尘。",
            body: `<p>生命 -${damage}</p><p>技能尘 +1</p>`
          };
        }
      }
    ]
  },
  {
    id: "key_mold",
    category: "trade",
    risk: "low",
    title: "钥匙模具",
    summary: "一副旧模具夹着半凝固的符文金属，形状像万能钥匙的雏形。",
    minFloor: 6,
    choices: [
      {
        id: "forge_universal_key",
        text: "补上强化石",
        desc: "消耗强化石和金币，铸成一把万能钥匙。",
        relation: { id: "wardens", delta: 1 },
        flag: "key_mold_forged",
        canChoose: ({ state }) => (state.materials?.["强化石"] || 0) > 0 && (state.gold || 0) >= 18,
        apply: ({ state }) => {
          state.materials = state.materials || {};
          state.materials["强化石"] = Math.max(0, (state.materials["强化石"] || 0) - 1);
          state.gold = Math.max(0, (state.gold || 0) - 18);
          state.universalKeys = (state.universalKeys || 0) + 1;
          return {
            log: "你补上强化石，铸成一把万能钥匙。",
            body: "<p>强化石 -1<br>金币 -18</p><p>万能钥匙 +1</p>"
          };
        }
      },
      {
        id: "melt_key_mold",
        text: "熔掉残料",
        desc: "放弃钥匙，换取金币和魔尘。",
        relation: { id: "merchants", delta: 1 },
        flag: "key_mold_melted",
        apply: ({ state, scaledReward }) => {
          const gold = scaledReward(16 + (state.floor || 1) * 2);
          state.gold = (state.gold || 0) + gold;
          state.materials = state.materials || {};
          state.materials["魔尘"] = (state.materials["魔尘"] || 0) + 1;
          return {
            log: "你熔掉钥匙模具里的残料。",
            body: `<p>金币 +${gold}<br>魔尘 +1</p>`
          };
        }
      }
    ]
  },
  {
    id: "echo_shrine",
    category: "rest",
    risk: "low",
    title: "回声神龛",
    summary: "神龛里传来自己的脚步声，比你慢半拍，像是在重复刚才的选择。",
    minFloor: 8,
    choices: [
      {
        id: "listen_echo",
        text: "聆听回声",
        desc: "恢复法力并获得技能尘。",
        relation: { id: "runebound", delta: 1 },
        flag: "echo_listened",
        apply: ({ state }) => {
          const mp = 8 + Math.ceil((state.floor || 1) * 0.9);
          state.mp = Math.min(state.maxMp || state.mp || 0, (state.mp || 0) + mp);
          state.skillDust = (state.skillDust || 0) + 1;
          return {
            log: "你听完回声，记住了一段更顺手的施法节奏。",
            body: `<p>恢复法力 ${mp}</p><p>技能尘 +1</p>`
          };
        }
      },
      {
        id: "break_echo_shrine",
        text: "打碎神龛",
        desc: "承受反噬，获得装备。",
        relation: { id: "runebound", delta: -2 },
        flag: "echo_shrine_broken",
        apply: ({ state, randomEquipment }) => {
          const damage = 8 + Math.ceil((state.floor || 1) * 0.9);
          const loot = randomEquipment();
          state.hp = Math.max(1, (state.hp || 1) - damage);
          state.inventory = state.inventory || [];
          state.inventory.push(loot);
          return {
            log: `你打碎回声神龛，在碎片中找到${loot.name}。`,
            body: `<p>生命 -${damage}</p><p>获得装备：${loot.name}</p>`
          };
        }
      }
    ]
  }
];

export function roomEventsForFloor(floor: number): RoomEventDef[] {
  return ROOM_EVENTS.filter((event) => floor >= event.minFloor);
}

export function roomEventMetaText(event: RoomEventDef): string {
  return `${CATEGORY_LABELS[event.category]} · ${RISK_LABELS[event.risk]}`;
}

export function roomEventById(id: string): RoomEventDef | undefined {
  return ROOM_EVENTS.find((event) => event.id === id);
}
