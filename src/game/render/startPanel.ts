import {
  CLASSES,
  INITIAL_BUILD_PRESETS,
  INITIAL_SKILL_DUST,
  INITIAL_SKILL_POINTS,
  INITIAL_STAT_POINTS,
  STAT_NAMES
} from "../constants";
import { escapeHtml } from "./html";

type StartPanelContext = {
  currentSaveSlot: string;
  formatSaveTime: (value: string) => string;
  saveSlotCard: (slot: any) => string;
};

export function renderStartScreenMarkup(slots: any[]) {
  const occupied = slots.filter((slot) => slot.meta);
  return `
    <article class="start-hub">
      <header class="start-hero">
        <div>
          <span>冒险入口</span>
          <h2>符文地牢</h2>
          <p>选择职业开启新的地牢探索，或从已有存档继续。</p>
        </div>
      </header>
      <div class="start-actions">
        <button type="button" onclick="startNewGame()">新游戏</button>
        <button type="button" ${occupied.length ? "" : "disabled"} onclick="renderContinueSlots()">继续</button>
      </div>
      ${occupied.length ? `<p class="start-note">继续会打开存档列表；新游戏会自动使用一个空存档。</p>` : `<p class="start-note">暂无存档，开始新游戏后先选择职业。</p>`}
    </article>
  `;
}

export function renderContinueSlotsMarkup(slots: any[], ctx: StartPanelContext) {
  return `
    <article class="start-hub">
      <header class="start-hero">
        <div>
          <span>继续冒险</span>
          <h2>选择存档</h2>
          <p>选择一个已有存档继续，也可以删除不再需要的记录。</p>
        </div>
        <button type="button" onclick="renderStartScreen()">返回</button>
      </header>
      <div class="save-slot-grid">
        ${slots.length ? slots.map(ctx.saveSlotCard).join("") : `<p class="start-note">暂无可继续的存档。</p>`}
      </div>
    </article>
  `;
}

export function saveSlotCardMarkup(slot: any, ctx: StartPanelContext) {
  const meta = slot.meta;
  const className = escapeHtml(meta?.className || "冒险者");
  if (!meta) {
    return `
      <article class="save-slot empty">
        <div class="save-slot-main">
          <span>${slot.label}</span>
          <b>空存档</b>
          <small>创建一个新的地牢角色。</small>
        </div>
        <button type="button" onclick="newGameInSlot('${slot.id}')">开始</button>
      </article>
    `;
  }
  return `
    <article class="save-slot ${slot.id === ctx.currentSaveSlot ? "active" : ""}">
      <div class="save-slot-main">
        <span>${slot.label} · ${ctx.formatSaveTime(meta.updatedAt)}${slot.id === ctx.currentSaveSlot ? " · 当前" : ""}</span>
        <b>${className} Lv.${meta.level || 1}</b>
        ${meta.endingTitle ? `<small class="save-ending">${escapeHtml(meta.endingTitle)}</small>` : ""}
        <small>第 ${meta.floor || 1} 层 · 金币 ${meta.gold || 0} · HP ${meta.hp || 0}/${meta.maxHp || 0}</small>
      </div>
      <div class="save-slot-actions">
        <button type="button" onclick="continueSavedGame('${slot.id}')">继续</button>
        <button type="button" onclick="confirmDeleteSaveSlot('${slot.id}')">删除</button>
      </div>
    </article>
  `;
}

export function renderClassSelectMarkup(slotId: string) {
  return (
    Object.entries(CLASSES)
      .map(
        ([id, cls]: [string, any]) => `
    <article class="class-card">
      <h2>${cls.name}</h2>
      <small>${cls.role || "职业"} · 主属性 ${cls.primary || "均衡"}</small>
      <p>${cls.desc}</p>
      <div class="class-start-line">开局 ${INITIAL_STAT_POINTS} 属性点 · ${INITIAL_SKILL_POINTS} 技能点 · ${INITIAL_SKILL_DUST} 技能尘</div>
      ${classSummaryMarkup(cls)}
      ${
        cls.passives?.length
          ? `<div class="class-passives">${cls.passives
              .map(
                (passive: any) =>
                  `<span title="${passive.desc}">${passive.name}${passive.tags?.length ? ` · ${passive.tags.join("/")}` : ""}</span>`
              )
              .join("")}</div>`
          : ""
      }
      <button type="button" onclick="chooseClassBuild('${id}', '${slotId}')">选择</button>
    </article>
  `
      )
      .join("") +
    `<article class="class-card class-back-card"><h2>选择职业</h2><p>新角色会保存在一个空存档中。</p><button type="button" onclick="renderStartScreen()">返回</button></article>`
  );
}

export function renderClassBuildChoiceMarkup(classId: string, slotId: string) {
  const cls = CLASSES[classId as keyof typeof CLASSES] as any;
  const presets = INITIAL_BUILD_PRESETS[classId as keyof typeof INITIAL_BUILD_PRESETS] || [];
  const choices = presets.length
    ? presets
        .map(
          (preset) =>
            `<button type="button" onclick="closeModal();startGame('${classId}', '${slotId}', '${preset.id}')"><b>${preset.name}</b><small>${preset.desc}</small></button>`
        )
        .join("")
    : `<button type="button" onclick="closeModal();startGame('${classId}', '${slotId}')"><b>均衡开局</b><small>保留初始属性点，进入地牢后自行分配。</small></button>`;
  return `
    <div class="class-build-modal">
      <div class="class-build-head">
        <span>开局倾向</span>
        <b>${cls?.name || "冒险者"}</b>
        <small>选择一个开局倾向后才会创建角色。</small>
      </div>
      <div class="class-builds class-build-choice">${choices}</div>
    </div>
  `;
}

function classSummaryMarkup(cls: any) {
  const stats = [
    ["生命", cls.hp],
    ["法力", cls.mp],
    ...Object.entries(cls.stats).map(([key, value]) => [STAT_NAMES[key as keyof typeof STAT_NAMES] || key, value])
  ];
  const growth = cls.growth;
  return `
      <div class="class-stat-grid">
        ${stats.map(([name, value]) => `<span><b>${name}</b><i>${value}</i></span>`).join("")}
      </div>
      <div class="class-growth-line">
        <span>成长</span>
        <b>${STAT_NAMES[growth.primary as keyof typeof STAT_NAMES] || growth.primary} / ${growth.primaryEvery}级</b>
        <b>${STAT_NAMES[growth.secondary as keyof typeof STAT_NAMES] || growth.secondary} / ${growth.secondaryEvery}级</b>
      </div>
    `;
}
