import type { GameState } from "../types";

export interface LoreChapter {
  id: string;
  floor: number;
  title: string;
  text: string;
}

export interface LorePage {
  id: string;
  minFloor: number;
  sources: string[];
  title: string;
  text: string;
}

export interface LoreState {
  chapters: string[];
  pages: string[];
}

export const LORE_CHAPTERS: LoreChapter[] = [
  {
    id: "threshold",
    floor: 1,
    title: "第一章：入口不会记人",
    text: "巡夜人说，符文地牢每隔一段时间就会把入口换到不同山谷。只有那些进去又出来的人，才会发现墙上的旧划痕正在慢慢变成自己的字迹。"
  },
  {
    id: "missing",
    floor: 6,
    title: "第二章：失踪名单",
    text: "商队带来的失踪名单越写越长。奇怪的是，名单里有些名字被划掉后，又会出现在下一页，像是地牢不肯承认他们真正离开过。"
  },
  {
    id: "factions",
    floor: 14,
    title: "第三章：三种答案",
    text: "巡夜人想封住入口，符文学会想拆开核心，商队只想打通一条能活着往返的路。每个人都说自己在救人，也都在向地牢索取。"
  },
  {
    id: "memory-runes",
    floor: 26,
    title: "第四章：符文不是矿石",
    text: "你终于读懂那些残页：符文不是地底矿物，而是被压缩后的记忆。它们能强化装备，是因为它们仍记得上一任主人的战斗方式。"
  },
  {
    id: "echoes",
    floor: 42,
    title: "第五章：回声开始说话",
    text: "更深处的敌人开始叫出你的职业和选择。它们不是预言家，只是地牢已经记录过太多相似的你。"
  },
  {
    id: "warden",
    floor: 58,
    title: "第六章：守王以前也是冒险者",
    text: "符文守王留下的铭文没有命令，只有一句劝告：如果你只想杀死王座上的人，地牢会很快学会如何再造一个。"
  },
  {
    id: "throne",
    floor: 66,
    title: "终章：王座等待选择",
    text: "王座深处没有宝藏，只有一枚没有名字的符文。它安静地等待着新的记忆，或者等待一个终于愿意拆掉循环的人。"
  }
];

export const LORE_PAGES: LorePage[] = [
  {
    id: "threshold-scratch",
    minFloor: 1,
    sources: ["chest", "lockedChest"],
    title: "入口刻痕",
    text: "石砖背面刻着一行小字：第一间房的灰尘总会比脚印更诚实，别急着相信地牢递给你的第一份答案。"
  },
  {
    id: "wet-ledger",
    minFloor: 4,
    sources: ["elite", "lockedChest"],
    title: "潮湿账页",
    text: "账页记录着三批补给的去向，收货人都是同一个名字：未归者。"
  },
  {
    id: "night-watch-order",
    minFloor: 7,
    sources: ["elite", "chest"],
    title: "巡夜令",
    text: "巡夜令要求封锁入口，却在末尾补了一句：若听见地底有人求救，不得单独回应。"
  },
  {
    id: "scholar-margin",
    minFloor: 12,
    sources: ["elite", "lockedChest"],
    title: "学会页边注",
    text: "符文学会的批注反复强调，符文会吸收使用者的偏好。字迹到最后变得越来越像祈祷。"
  },
  {
    id: "merchant-route",
    minFloor: 18,
    sources: ["chest", "lockedChest"],
    title: "断裂商路图",
    text: "地图上标了三条安全路线，每一条都被后来的人用红墨划掉，只剩一句：门会移动。"
  },
  {
    id: "memory-tax",
    minFloor: 24,
    sources: ["elite", "boss"],
    title: "记忆税",
    text: "残页写道：每次使用符文，地牢都会留下一点你。起初只是招式，后来是声音，再后来是名字。"
  },
  {
    id: "class-echoes",
    minFloor: 28,
    sources: ["elite", "lockedChest"],
    title: "三份回声",
    text: "同一段回声被抄成三份：剑士听见盾沿震动，法师听见火星倒流，游侠听见第二支箭已经离弦。地牢不是复制人，它在复制习惯。"
  },
  {
    id: "echo-duel",
    minFloor: 34,
    sources: ["elite", "boss"],
    title: "回声决斗记录",
    text: "一名冒险者写下与自己影子的决斗过程。最后一行只有半句：它比我更熟悉我的下一步。"
  },
  {
    id: "survivor-cairn",
    minFloor: 38,
    sources: ["chest", "lockedChest"],
    title: "幸存者石堆",
    text: "石堆下压着一片布条，上面没有求救，只写着路线：如果后来者还愿意救人，就把左边第三块石头翻过来。"
  },
  {
    id: "warden-confession",
    minFloor: 50,
    sources: ["elite", "boss", "lockedChest"],
    title: "守王忏悔",
    text: "我坐上王座不是为了统治地牢，而是为了让它先学会吞下我。这样它就会晚一点学会吞下世界。"
  },
  {
    id: "merchant-last-price",
    minFloor: 56,
    sources: ["chest", "boss"],
    title: "最后报价",
    text: "商队账本的末页没有价格，只有一句：若门仍会移动，就把地图卖给还没失去名字的人。"
  },
  {
    id: "empty-rune",
    minFloor: 62,
    sources: ["boss", "lockedChest"],
    title: "空白符文",
    text: "这枚符文没有属性，也没有主人的记忆。它像一扇尚未打开的门，等着最后一个选择。"
  }
];

export function ensureLoreState(state: GameState | null | undefined): LoreState {
  if (!state) return { chapters: [], pages: [] };
  const current = (state.lore || {}) as Partial<LoreState>;
  const lore: LoreState = {
    chapters: Array.isArray(current.chapters) ? current.chapters : [],
    pages: Array.isArray(current.pages) ? current.pages : []
  };
  state.lore = lore;
  return lore;
}

export function unlockLoreChaptersForFloor(state: GameState | null | undefined): LoreChapter[] {
  if (!state) return [];
  const lore = ensureLoreState(state);
  const unlocked: LoreChapter[] = [];
  for (const chapter of LORE_CHAPTERS) {
    if ((state.floor || 1) < chapter.floor || lore.chapters.includes(chapter.id)) continue;
    lore.chapters.push(chapter.id);
    unlocked.push(chapter);
  }
  return unlocked;
}

export function discoverLorePage(
  state: GameState | null | undefined,
  source: string
): LorePage | null {
  if (!state) return null;
  const lore = ensureLoreState(state);
  const page = LORE_PAGES.find(
    (entry) =>
      (state.floor || 1) >= entry.minFloor &&
      entry.sources.includes(source) &&
      !lore.pages.includes(entry.id)
  );
  if (!page) return null;
  lore.pages.push(page.id);
  return page;
}

export function loreChapterById(id: string): LoreChapter | undefined {
  return LORE_CHAPTERS.find((chapter) => chapter.id === id);
}

export function lorePageById(id: string): LorePage | undefined {
  return LORE_PAGES.find((page) => page.id === id);
}
