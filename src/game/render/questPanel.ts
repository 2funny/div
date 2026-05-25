import {
  LORE_CHAPTERS,
  LORE_PAGES,
  ensureLoreState,
  loreChapterById,
  lorePageById
} from "../quest/lore";
import {
  dominantNarrativeBranchText,
  endingTitle,
  endingWorldEffectText
} from "../quest/narrative";
import { QUEST_DEFS } from "../quest/quests";
import { currentTutorialStep } from "../tutorial/tutorial";
import { escapeHtml } from "./html";

export const LORE_TOTAL = LORE_CHAPTERS.length + LORE_PAGES.length;

type QuestPanelContext = {
  closeModal: () => void;
  ensureQuestList: () => any[];
  questLocationText: (quest: any) => string;
  questRewardGold: (def: any, floor?: number) => number;
  showEvent: (title: string, body: string, actionText?: string) => void;
  showModal: (title: string, body: string, actions: any[]) => void;
  state: any;
};

export function renderTutorialCard(state: any) {
  const step = currentTutorialStep(state);
  if (!step) return "";
  return `<div class="tutorial-card"><span>当前目标</span><b>${escapeHtml(step.title)}</b><small>${escapeHtml(step.desc)}</small></div>`;
}

export function renderLoreShortcut(state: any) {
  const count = unlockedLoreEntries(state).length;
  if (!count) return "";
  return `
    <button class="lore-shortcut" type="button" onclick="openLoreArchive()">
      <span>地牢残页</span>
      <small>${count}/${LORE_TOTAL}</small>
    </button>
  `;
}

export function renderQuestList(ctx: QuestPanelContext) {
  const quests = ctx.ensureQuestList();
  const main = renderMainQuestRow(ctx.state);
  if (!quests.length) {
    return `<section class="quest-list">${main}<p>暂无委托。和商人或委托人交谈后，可以在这里追踪目标。</p></section>`;
  }
  const rows = quests.map((quest) => renderQuestRow(ctx, quest)).join("");
  return `<section class="quest-list">${main}${rows}</section>`;
}

export function unlockedLoreEntries(state: any) {
  const lore = ensureLoreState(state);
  return [
    ...lore.chapters.map(loreChapterById).filter(Boolean).map((entry) => ({
      type: "主线",
      floorText: `第 ${entry.floor} 层`,
      title: entry.title,
      text: entry.text
    })),
    ...lore.pages.map(lorePageById).filter(Boolean).map((entry) => ({
      type: "残页",
      floorText: `第 ${entry.minFloor} 层后`,
      title: entry.title,
      text: entry.text
    }))
  ];
}

export function openLoreArchive(index = 0, ctx: QuestPanelContext) {
  const entries = unlockedLoreEntries(ctx.state);
  if (!entries.length) {
    ctx.showEvent("地牢残页", "<p>还没有发现可翻阅的残页。</p>", "知道了");
    return;
  }
  const safeIndex = Math.max(0, Math.min(entries.length - 1, Number(index) || 0));
  const entry = entries[safeIndex];
  ctx.showModal(
    "地牢残页",
    `
    <article class="lore-page">
      <span class="item-kicker">${entry.type} · ${entry.floorText} · ${safeIndex + 1}/${entries.length}</span>
      <b>${escapeHtml(entry.title)}</b>
      <p>${escapeHtml(entry.text)}</p>
    </article>
  `,
    [
      {
        text: "上一页",
        action: () => openLoreArchive(safeIndex - 1, ctx),
        disabled: safeIndex === 0
      },
      {
        text: "下一页",
        action: () => openLoreArchive(safeIndex + 1, ctx),
        disabled: safeIndex >= entries.length - 1
      },
      { text: "关闭", action: ctx.closeModal }
    ]
  );
}

function renderQuestRow(ctx: QuestPanelContext, quest: any) {
  const base = QUEST_DEFS[quest.id] || {
    title: "未知任务",
    giverName: "未知",
    desc: "",
    rewardGold: 0
  };
  const def =
    quest.id === "rescueRoom"
      ? {
          ...base,
          title: `${quest.roomName || "房间"}救援`,
          desc: `清理${quest.roomName || "目标房间"}并确认${quest.rescueName || "被困者"}安全。`
        }
      : base;
  const location = ctx.questLocationText(quest);
  const stateText = quest.claimed
    ? "已领取"
    : quest.completed
      ? "可领取"
      : quest.roomCleared
        ? "待救援"
        : "进行中";
  const rewardGold = ctx.questRewardGold(def, quest.floor);
  const rewards = [
    def.rewardKeys ? `钥匙 +${def.rewardKeys}` : "",
    rewardGold ? `金币 +${rewardGold}` : "",
    def.rewardSkillPoints ? `技能点 +${def.rewardSkillPoints}` : "",
    def.rewardSkillDust ? `技能尘 +${def.rewardSkillDust}` : "",
    def.rewardRune ? "随机符文" : "",
    def.rewardBeacon ? "商路信标" : "",
    def.rewardPotion ? (def.rewardPotion === "mp" ? "法力药水 +1" : "生命药水 +1") : ""
  ]
    .filter(Boolean)
    .join(" · ");
  const targetKind = questTargetKindText(def);
  return `
    <article class="quest-row inventory-card ${quest.completed && !quest.claimed ? "ready" : ""}">
      <div class="item-main">
        <span class="item-kicker">${def.giverName}</span>
        <b>${def.title}</b>
        <small>${def.desc}</small>
        <span class="item-tags"><i>目标${location}</i>${targetKind ? `<i>${targetKind}</i>` : ""}<i>${quest.kills}/${quest.target}</i>${rewards ? `<i>${rewards}</i>` : ""}</span>
      </div>
      <span class="quest-state">${stateText}</span>
    </article>
  `;
}

function questTargetKindText(def: any) {
  if (def.targetKind === "elite") return "精英目标";
  if (def.targetKind === "runic") return "符文回声";
  if (def.targetKind === "monster") return "普通怪物";
  return "";
}

function renderMainQuestRow(state: any) {
  const lore = ensureLoreState(state);
  const loreCount = unlockedLoreEntries(state).length;
  const branchText = dominantNarrativeBranchText(state);
  const endingId = state?.narrative?.endingId || "";
  const ending = endingTitle(endingId);
  if (ending) {
    const consequences = state?.narrative?.endingConsequences || [];
    return `
      <article class="quest-row inventory-card main-quest-row ready">
        <div class="item-main">
          <span class="item-kicker">主线</span>
          <b>${escapeHtml(ending)}</b>
          <small>${escapeHtml(endingWorldEffectText(state))}</small>
          ${consequences
            .slice(1, 3)
            .map((entry: string) => `<small class="quest-impact">${escapeHtml(entry)}</small>`)
            .join("")}
          <span class="item-tags"><i>王座已安静</i><i>残页 ${loreCount}/${LORE_TOTAL}</i></span>
        </div>
        <span class="quest-state">已完成</span>
      </article>
    `;
  }
  const hasOpening = lore.chapters.includes("threshold");
  const nextChapter = LORE_CHAPTERS.find((chapter) => !lore.chapters.includes(chapter.id));
  const title = hasOpening ? "追查符文地牢" : "寻找入口引路人";
  const desc = hasOpening
    ? "收集地牢残页，弄清入口为什么会移动，以及符文正在记录什么。"
    : "入口附近有人在等你。先听完他的说明，再带着第一张残页进入地牢。";
  const stateText = hasOpening ? "进行中" : "待接触";
  const target = hasOpening
    ? nextChapter
      ? `深入第 ${nextChapter.floor} 层`
      : "抵达王座深处"
    : "和旧灯引路人交谈";
  return `
    <article class="quest-row inventory-card main-quest-row">
      <div class="item-main">
        <span class="item-kicker">主线</span>
        <b>${title}</b>
        <small>${desc}</small>
        ${branchText ? `<small class="quest-impact">${escapeHtml(branchText)}</small>` : ""}
        <span class="item-tags"><i>${target}</i><i>残页 ${loreCount}/${LORE_TOTAL}</i></span>
      </div>
      <span class="quest-state">${stateText}</span>
    </article>
  `;
}
