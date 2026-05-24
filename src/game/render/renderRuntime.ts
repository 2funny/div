import { CLASSES, RUNES, SLOT_NAMES, isValidMapSize } from "../constants";
import {
  elementMatchLabel,
  elementMultiplier
} from "../combat/elements";
import {
  equipmentRestrictionText,
  isWeaponUsableByClass
} from "../equipment/equipmentRules";
import { effectiveItemStat, itemScore } from "../equipment/equipmentScoring";
import { ensureLoreState } from "../quest/lore";
import {
  assetForClass as assetForClassMarkup,
  badgeForObject as badgeForObjectMarkup,
  iconClassForType as iconClassForTypeMarkup,
  iconSprite as iconSpriteMarkup,
  imageTag as imageTagMarkup,
  mapViewBounds as mapViewBoundsForState,
  minimapMarker as minimapMarkerMarkup,
  minimapObjectIcon as minimapObjectIconMarkup,
  minimapOverviewBounds as minimapOverviewBoundsForState,
  minimapRoomMarkers as minimapRoomMarkersForState,
  objectSprite as objectSpriteMarkup,
  renderLegendMarkup,
  renderMapMarkup,
  renderMinimapMarkup,
  roomDoorLabel as roomDoorLabelForCell,
  shouldShowMapObject as shouldShowMapObjectForCell,
  sprite as spriteMarkup,
  tileLabel as tileLabelForCell
} from "./mapPanel";
import {
  battlePotionGroups as battlePotionGroupsForState,
  currentBattleTurnState as currentBattleTurnStateForPanel,
  renderBattleCommandPanelMarkup,
  renderBattlePotionButtonsMarkup,
  renderSkillActionButtonsMarkup
} from "./battleCommandPanel";
import {
  battleFxClass as battleFxClassMarkup,
  centerFxMarkup as centerBattleFxMarkup,
  combatantFxMarkup as combatantBattleFxMarkup,
  elementBurstMarkup as elementBurstBattleMarkup,
  renderBattleViewMarkup
} from "./battleView";
import {
  battleContextMarkup,
  explorationContextMarkup,
  objectContextMarkup
} from "./contextPanel";
import { enemyDetailMarkup, isEnemyObject } from "./enemyDetail";
import {
  enhanceText as equipmentEnhanceText,
  equipmentDetailMarkup as equipmentDetailMarkupForItem,
  equipmentCompareTextMarkup,
  inventoryEquipmentCompareMarkup,
  equipmentScoreBadgeMarkup as equipmentScoreBadgeMarkupForDelta,
  equipmentSummary as equipmentSummaryMarkup,
  equippedStateBadge as equippedStateBadgeMarkup,
  renderCraftPanelMarkup,
  renderEquipmentPanelMarkup,
  statsText as equipmentStatsText
} from "./equipmentMarkup";
import { heroStatsGridMarkup, renderPaperdollMarkup } from "./heroPanel";
import {
  equipmentFilterControl as inventoryEquipmentFilterControl,
  equipmentFilterRows as inventoryEquipmentFilterRows,
  equipmentInventoryRow as inventoryEquipmentInventoryRow,
  materialRows as inventoryMaterialRows,
  potionRow as inventoryPotionRow,
  renderInventoryGroupMarkup,
  runeRows as inventoryRuneRows
} from "./inventoryPanel";
import {
  openLoreArchive as openLoreArchivePanel,
  renderLoreShortcut as renderLoreShortcutMarkup,
  renderQuestList as renderQuestListMarkup,
  renderTutorialCard as renderTutorialCardMarkup,
  unlockedLoreEntries as unlockedLoreEntriesForState
} from "./questPanel";
import {
  renderClassSelectMarkup,
  renderContinueSlotsMarkup,
  renderStartScreenMarkup,
  saveSlotCardMarkup
} from "./startPanel";
import {
  renderSkillsMarkup,
  skillLoadoutMarkup as skillLoadoutPanelMarkup,
  skillLoadoutModalMarkup
} from "./skillPanel";
import { syncWeatherCanvas } from "./weatherCanvas";
import { escapeHtml } from "./html";

// 渲染运行时集中生成 DOM 字符串和面板状态，不承担战斗、掉落等规则计算。
export function createRenderRuntime(ctx) {
  const { $, ui, api } = ctx;
  const battle = ctx.battle || { inputLockedUntil: 0 };
  let state = ctx.getState();
  let battleUnlockRenderTimer = null;
  const syncState = () => {
    state = ctx.getState();
    return state;
  };

  const addStat = (...args) => api.addStat(...args);
  const autoBattle = (...args) => api.autoBattle(...args);
  const autoBattlePolicy = (...args) => api.autoBattlePolicy(...args);
  const battleRisk = (...args) => api.battleRisk(...args);
  const battleSkills = (...args) => api.battleSkills(...args);
  const battleSkillLimit = api.BATTLE_SKILL_LIMIT || 4;
  const buy = (...args) => api.buy(...args);
  const canLearnSkill = (...args) => api.canLearnSkill(...args);
  const canEnhance = (...args) => api.canEnhance(...args);
  const canUpgradeSkill = (...args) => api.canUpgradeSkill(...args);
  const canUnequipSlot = (...args) => api.canUnequipSlot(...args);
  const classSkills = (...args) => api.classSkills(...args);
  const closeModal = (...args) => api.closeModal(...args);
  const currentStairsDown = (...args) => api.currentStairsDown(...args);
  const deleteSaveSlot = (...args) => api.deleteSaveSlot(...args);
  const effectiveMaxHp = (...args) => api.effectiveMaxHp(...args);
  const effectiveMaxMp = (...args) => api.effectiveMaxMp(...args);
  const enhanceDisabledReason = (...args) => api.enhanceDisabledReason(...args);
  const equipItem = (...args) => api.equipItem(...args);
  const equipmentSellValue = (...args) => api.equipmentSellValue(...args);
  const equipmentSalvageValue = (...args) => api.equipmentSalvageValue(...args);
  const merchantPurchasePreview = (...args) => api.merchantPurchasePreview(...args);
  const enemyAffixText = (...args) => api.enemyAffixText(...args);
  const ensureQuestList = (...args) => api.ensureQuestList(...args);
  const generateFloor = (...args) => api.generateFloor(...args);
  const isDefeatedEnemy = (...args) => api.isDefeatedEnemy(...args);
  const isSkillEquipped = (...args) => api.isSkillEquipped(...args);
  const isSkillLearned = (...args) => api.isSkillLearned(...args);
  const knownTeleportTargets = (...args) => api.knownTeleportTargets(...args);
  const loadGame = (...args) => api.loadGame(...args);
  const move = (...args) => api.move(...args);
  const questLocationText = (...args) => api.questLocationText(...args);
  const questRewardGold = (...args) => api.questRewardGold(...args);
  const roomName = (...args) => api.roomName(...args);
  const runeEffectText = (...args) => api.runeEffectText(...args);
  const saveSlotLabel = (...args) => api.saveSlotLabel(...args);
  const markAutosaveDirty = (...args) => api.markAutosaveDirty(...args);
  const formatSaveTime = (...args) => api.formatSaveTime(...args);
  const saveSlots = (...args) => api.saveSlots(...args);
  const showConfirm = (...args) => api.showConfirm(...args);
  const showEvent = (...args) => api.showEvent(...args);
  const showModal = (...args) => api.showModal(...args);
  const skillById = (...args) => api.skillById(...args);
  const skillLevel = (...args) => api.skillLevel(...args);
  const skillPreviewText = (...args) => api.skillPreviewText(...args);
  const skillRequirementText = (...args) => api.skillRequirementText(...args);
  const skillUpgradeCost = (...args) => api.skillUpgradeCost(...args);
  const startGame = (...args) => api.startGame(...args);
  const syncMusicToGame = (...args) => api.syncMusicToGame(...args);
  const themeForFloor = (...args) => api.themeForFloor(...args);
  const totals = (...args) => api.totals(...args);
  const toggleBattleSkill = (...args) => api.toggleBattleSkill(...args);
  const unequipItem = (...args) => api.unequipItem(...args);
  const updateVisibility = (...args) => api.updateVisibility(...args);
  const upgradedSkill = (...args) => api.upgradedSkill(...args);

  function startPanelContext() {
    return {
      currentSaveSlot: ui.currentSaveSlot,
      formatSaveTime,
      saveSlotCard
    };
  }

  // 渲染开始页，根据存档槽状态决定展示继续入口或新游戏入口。
  function renderStartScreen() {
    const slots = saveSlots();
    $("homeBtn").disabled = true;
    $("classSelect").innerHTML = renderStartScreenMarkup(slots);
  }

  function renderContinueSlots() {
    const slots = saveSlots().filter((slot) => slot.meta);
    $("homeBtn").disabled = false;
    $("classSelect").innerHTML = renderContinueSlotsMarkup(slots, startPanelContext());
  }

  function continueSavedGame(slotId = ui.currentSaveSlot) {
    if (!loadGame(slotId)) return;
    syncState();
    render();
  }

  function saveSlotCard(slot) {
    return saveSlotCardMarkup(slot, startPanelContext());
  }

  function nextNewGameSlot() {
    return saveSlots().find((slot) => !slot.meta)?.id || null;
  }

  function startNewGame(slotId = nextNewGameSlot()) {
    if (!slotId) {
      showModal("存档已满", "<p>所有存档槽都已有记录。请先删除一个存档，再开始新游戏。</p>", [
        { text: "取消", action: closeModal },
        {
          text: "查看存档",
          action: () => {
            closeModal();
            renderContinueSlots();
          }
        }
      ]);
      return;
    }
    closeModal();
    renderClassSelect(slotId);
  }

  function newGameInSlot(slotId) {
    const slot = saveSlots().find((entry) => entry.id === slotId);
    if (slot?.meta) {
      showConfirm(
        "覆盖存档",
        `<p>${escapeHtml(slot.label)} 已有 ${escapeHtml(slot.meta.className || "冒险者")} Lv.${slot.meta.level || 1}，新游戏会覆盖该槽。</p>`,
        "继续创建",
        () => {
          closeModal();
          renderClassSelect(slotId);
        }
      );
      return;
    }
    startNewGame(slotId);
  }

  function confirmDeleteSaveSlot(slotId) {
    const slot = saveSlots().find((entry) => entry.id === slotId);
    if (!slot?.meta) return;
    showConfirm(
      "删除存档",
      `<p>删除 ${escapeHtml(slot.label)} 的 ${escapeHtml(slot.meta.className || "冒险者")} Lv.${slot.meta.level || 1}？此操作不会影响其他存档。</p>`,
      "删除",
      () => {
        deleteSaveSlot(slotId);
        closeModal();
        if (state && ui.currentSaveSlot === slotId) ctx.setState(null);
        render();
        renderContinueSlots();
      }
    );
  }

  // 渲染职业选择卡片，玩家选择后会创建新角色状态。
  function renderClassSelect(slotId = ui.pendingSaveSlot || ui.currentSaveSlot || "slot-1") {
    ui.pendingSaveSlot = slotId;
    saveSlotLabel(slotId);
    $("homeBtn").disabled = false;
    $("classSelect").innerHTML = renderClassSelectMarkup(slotId);
  }

  // 根据当前状态渲染完整 UI，并把快照持久化到 localStorage。
  // 主渲染调度入口：根据是否有角色、是否在战斗选择对应 UI 组合。
  function render() {
    if (!state) {
      applyFloorEffectClass(null);
      $("classSelect").classList.remove("hidden");
      $("gameView").classList.add("hidden");
      $("saveBtn").disabled = true;
      $("homeBtn").disabled = true;
      syncMusicToGame();
      return;
    }
    if (
      !state.map?.cells?.length ||
      !isValidMapSize(state.map.size) ||
      state.map.cells.length !== state.map.size
    )
      generateFloor();
    state.hp = Math.min(state.hp, effectiveMaxHp());
    state.mp = Math.min(state.mp, effectiveMaxMp());
    syncMusicToGame();
    $("classSelect").classList.add("hidden");
    $("gameView").classList.remove("hidden");
    $("saveBtn").disabled = false;
    $("homeBtn").disabled = false;
    renderHero();
    renderMap();
    renderMinimap();
    renderLegend();
    renderBattleView();
    renderContext();
    renderTab();
    renderLog();
    markAutosaveDirty();
  }

  function confirmBuy(kind) {
    const goods = {
      hp: ["小型生命药水", 12],
      mp: ["小型法力药水", 12],
      beacon: ["商路信标", 45],
      universalKey: ["万能钥匙", 58]
    };
    const [name, price] = goods[kind] || goods.hp;
    showConfirm("购买确认", `<p>花费 ${price} 金币购买 ${name}。</p>`, "购买", () => buy(kind));
  }

  // 渲染玩家头像、资源条、属性和纸娃娃装备入口。
  function renderHero() {
    const cls = CLASSES[state.classId];
    const t = totals();
    const hpMax = effectiveMaxHp();
    const mpMax = effectiveMaxMp();
    $("heroAvatar").innerHTML = imageTag(assetForClass(state.classId), cls.name);
    $("heroName").textContent = `${cls.name} Lv.${state.level}`;
    $("hpText").textContent = `${state.hp}/${hpMax}`;
    $("mpText").textContent = `${state.mp}/${mpMax}`;
    $("xpText").textContent = `${state.xp}/${state.xpNext}`;
    $("hpBar").style.width = `${Math.max(0, Math.min(100, (state.hp / hpMax) * 100))}%`;
    $("mpBar").style.width = `${Math.max(0, Math.min(100, (state.mp / mpMax) * 100))}%`;
    $("xpBar").style.width = `${Math.max(0, Math.min(100, (state.xp / state.xpNext) * 100))}%`;
    $("statPoints").textContent = state.statPoints;
    $("skillPointsText").textContent = state.skillPoints || 0;
    $("skillDustText").textContent = state.skillDust || 0;
    $("goldText").textContent = state.gold;
    $("statsGrid").innerHTML = heroStatsGridMarkup(state, t);
    renderPaperdoll();
  }

  function renderPaperdoll() {
    $("paperdoll").innerHTML = renderPaperdollMarkup(state, imageTag, assetForClass);
  }

  // 打开纸娃娃指定装备槽位详情。
  function showEquipmentSlot(slot) {
    const eq = state.equipment[slot];
    const title = SLOT_NAMES[slot] || "装备";
    if (!eq) {
      showEvent(title, `<p>这个部位还没有装备。</p>`, "知道了");
      return;
    }
    const runeText = eq.runeSlots
      ? `${eq.runes.length}/${eq.runeSlots}：${eq.runes.length ? eq.runes.join("、") : "未镶嵌"}`
      : "无";
    showModal(eq.name, equipmentDetailMarkup(eq, title, runeText), [
      { text: "关闭", action: closeModal },
      {
        text: "拆下",
        action: () => {
          closeModal();
          unequipItem(slot);
        }
      }
    ]);
  }

  // 渲染主地牢地图视野范围内的格子。
  // 渲染以玩家为中心的地图窗口，并保留迷雾、已探索和当前选择状态。
  function renderMap() {
    const theme = themeForFloor(state.floor);
    const effect = state.map?.effect || null;
    $("floorText").textContent = `第 ${state.floor} 层`;
    $("themeText").textContent = effect ? `${theme.name} · ${effect.name}` : theme.name;
    $("themeText").title = effect?.desc || "";
    applyFloorEffectClass(effect);
    const map = $("map");
    map.className = `map ${theme.colorClass}`;
    const view = mapViewBounds();
    map.style.setProperty("--size", view.size);
    map.innerHTML = renderMapMarkup(mapPanelContext(), view);
  }

  function mapPanelContext() {
    return {
      enemyAffixText,
      isEnemyObject,
      roomName,
      selectedTile: ui.selectedTile,
      state
    };
  }

  function applyFloorEffectClass(effect) {
    const mapWrap = document.querySelector(".map-wrap");
    const mapStage = document.querySelector(".map-stage");
    const effectClasses = ["effect-rain", "effect-snow", "effect-lava"];
    for (const element of [mapWrap, mapStage]) {
      if (!element) continue;
      element.classList.remove("special-floor", ...effectClasses);
      if (effect?.className) element.classList.add("special-floor", effect.className);
    }
    syncWeatherCanvas(effect);
  }

  // 门格只显示紧凑房间编号，避免长文本压在地图上。
  function roomDoorLabel(cell) {
    return roomDoorLabelForCell(cell, roomName);
  }

  function shouldShowMapObject(cell) {
    return shouldShowMapObjectForCell(cell);
  }

  function mapViewBounds() {
    return mapViewBoundsForState(state);
  }

  // 渲染右上角小地图概览和当前视野框。
  function renderMinimap() {
    const minimap = $("minimap");
    const view = mapViewBounds();
    const overview = minimapOverviewBounds(view);
    minimap.style.setProperty("--size", overview.size);
    minimap.style.setProperty("--view-x", `${overview.viewX}%`);
    minimap.style.setProperty("--view-y", `${overview.viewY}%`);
    minimap.style.setProperty("--view-size", `${overview.viewSize}%`);
    minimap.innerHTML = renderMinimapMarkup(mapPanelContext(), view);
  }

  function minimapOverviewBounds(view) {
    return minimapOverviewBoundsForState(state, view);
  }

  function minimapMarker(cell, isPlayer, roomNumber = "") {
    return minimapMarkerMarkup(cell, isPlayer, roomNumber, state.classId);
  }

  function minimapRoomMarkers() {
    return minimapRoomMarkersForState(state);
  }

  function minimapObjectIcon(obj) {
    return minimapObjectIconMarkup(obj);
  }

  function selectMinimapTile(x, y) {
    ui.selectedTile = { x, y };
    render();
  }

  // 渲染地图下方始终可见的图例说明。
  function renderLegend() {
    $("legend").innerHTML = renderLegendMarkup(state.classId);
  }

  // 有当前敌人时，把中间地图区域切换成战斗面板。
  // 渲染战斗主界面，包括双方状态、技能按钮、药水按钮和飘字效果。
  function renderBattleView() {
    const enemy = state.currentEnemy;
    const mapWrap = document.querySelector(".map-wrap");
    const mapStage = document.querySelector(".map-stage");
    let battleStage = document.getElementById("battleStage");
    if (!mapWrap || !mapStage) return;
    if (!battleStage) {
      battleStage = document.createElement("div");
      battleStage.id = "battleStage";
      battleStage.className = "battle-stage hidden";
      mapWrap.insertBefore(battleStage, mapStage);
    }

    $("gameView").classList.toggle("in-battle", !!enemy);
    [mapStage, $("legend")].forEach((el) => el?.classList.toggle("hidden", !!enemy));
    battleStage.classList.toggle("hidden", !enemy);
    if (!enemy) return;
    if (isDefeatedEnemy(enemy)) {
      state.currentEnemy = null;
      battleStage.classList.add("hidden");
      $("gameView").classList.remove("in-battle");
      [mapStage, $("legend")].forEach((el) => el?.classList.remove("hidden"));
      return;
    }

    const cls = CLASSES[state.classId];
    const hpMax = effectiveMaxHp();
    const mpMax = effectiveMaxMp();
    const hpPct = Math.max(0, Math.min(100, Math.round((state.hp / hpMax) * 100)));
    const mpPct = Math.max(0, Math.min(100, Math.round((state.mp / mpMax) * 100)));
    const enemyPct = Math.max(0, Math.min(100, Math.round((enemy.hp / enemy.maxHp) * 100)));
    $("themeText").textContent = "战斗中";
    battleStage.innerHTML = renderBattleViewMarkup({
      assetForClass,
      cls,
      enemy,
      enemyAffixText,
      enemyPct,
      hpMax,
      hpPct,
      mpMax,
      mpPct,
      objectSprite,
      renderBattleCommandPanel,
      sprite,
      state
    });
  }

  // 渲染战斗命令面板：普通行动、技能、补给和一键战斗。
  function battleCommandPanelContext() {
    return {
      autoBattlePolicy,
      battle,
      battleSkillElementMatchText,
      battleSkills,
      currentBattleTurnState,
      effectiveMaxHp,
      effectiveMaxMp,
      percentScore,
      skillPreviewText,
      state,
      upgradedSkill
    };
  }
  function renderBattleCommandPanel(mpMax = effectiveMaxMp()) {
    const result = renderBattleCommandPanelMarkup(battleCommandPanelContext(), mpMax);
    if (result.locked) scheduleBattleUnlockRender();
    return result.markup;
  }

  function battleStatusPill(label, value, pct, kind, detail = "") {
    return `<div class="battle-status-pill ${kind}" style="--status:${pct}%"><span>${label}</span><b>${value}</b>${detail ? `<small>${detail}</small>` : ""}<i></i></div>`;
  }

  function percentScore(score) {
    return Math.max(0, Math.min(100, Math.round(Number.isFinite(score) ? score * 100 : 0)));
  }

  function isBattleInputLocked() {
    return !!state?.currentEnemy && Date.now() < Number(battle.inputLockedUntil || 0);
  }

  function currentBattleTurnState() {
    return currentBattleTurnStateForPanel(state, battle);
  }

  function scheduleBattleUnlockRender() {
    if (battleUnlockRenderTimer) clearTimeout(battleUnlockRenderTimer);
    const delay = Math.max(0, Number(battle.inputLockedUntil || 0) - Date.now()) + 20;
    battleUnlockRenderTimer = setTimeout(() => {
      battleUnlockRenderTimer = null;
      syncState();
      if (state?.currentEnemy) render();
    }, delay);
  }

  function battlePotionGroups() {
    return battlePotionGroupsForState(state);
  }

  function renderBattlePotionButtons() {
    return renderBattlePotionButtonsMarkup(battleCommandPanelContext());
  }

  function battleSkillElementMatchText(skill) {
    if (!state.currentEnemy || !skill.element) return "";
    const multiplier = elementMultiplier(skill.element, state.currentEnemy, state.classId, {
      pierceResist: !!skill.pierceResist || !!skill.branch?.pierceResist
    });
    const label = elementMatchLabel(multiplier);
    if (!label && multiplier === 1) return "";
    return `${label ? `${label} ` : ""}${Math.round(multiplier * 100)}%`;
  }
  function renderSkillActionButtons(mode = "compact") {
    return renderSkillActionButtonsMarkup(battleCommandPanelContext(), mode);
  }

  function battleFxClass(target) {
    return battleFxClassMarkup(target);
  }

  function combatantFxMarkup(target) {
    return combatantBattleFxMarkup(target);
  }

  function elementBurstMarkup(element) {
    return elementBurstBattleMarkup(element);
  }

  function centerFxMarkup() {
    return centerBattleFxMarkup();
  }


  function objectSprite(obj) {
    return objectSpriteMarkup(obj);
  }

  function enemySprite(enemy) {
    return objectSpriteMarkup(enemy);
  }

  function badgeForObject(type) {
    return badgeForObjectMarkup(type);
  }

  function tileLabel(cell, isPlayer = false, reveal = false) {
    return tileLabelForCell(cell, { state, roomName, enemyAffixText }, isPlayer, reveal);
  }
  function selectedTileText() {
    if (!ui.selectedTile || !state?.map) return "";
    const cell = state.map.cells[ui.selectedTile.y]?.[ui.selectedTile.x];
    if (!cell || !cell.seen) return "";
    const isPlayer = cell.x === state.player.x && cell.y === state.player.y;
    const base = tileLabel(cell, isPlayer);
    if (!isEnemyObject(cell.object)) return base;
    return `${base}<div class="tile-info-actions"><button type="button" onclick="showEnemyDetailAt(${cell.x},${cell.y})">查看属性</button></div>`;
  }

  // 根据职业选择玩家精灵资源。
  function assetForClass(classId) {
    return assetForClassMarkup(classId);
  }

  // 生成地图和面板共用的图片 HTML。
  function imageTag(src, alt) {
    return imageTagMarkup(src, alt);
  }

  // 用对象专属 class 包装图片，方便 CSS 统一控制尺寸和动画。
  function sprite(cls, src, alt) {
    return spriteMarkup(cls, src, alt);
  }

  function iconSprite(cls, alt) {
    return iconSpriteMarkup(cls, alt);
  }

  function iconClassForType(type) {
    return iconClassForTypeMarkup(type);
  }

  // 选中地图格子；如果格子相邻，则直接尝试移动。
  function clickTile(x, y) {
    ui.selectedTile = { x, y };
    const cell = state.map?.cells?.[y]?.[x];
    if (cell?.seen && isEnemyObject(cell.object)) {
      showEnemyDetailAt(x, y);
      return;
    }
    const dx = x - state.player.x;
    const dy = y - state.player.y;
    if (Math.abs(dx) + Math.abs(dy) === 1) move(dx, dy);
    else render();
  }

  function showEnemyDetailAt(x, y) {
    const cell = state.map?.cells?.[y]?.[x];
    if (!cell?.seen || !isEnemyObject(cell.object)) return;
    ui.selectedTile = { x, y };
    showEnemyDetail(cell.object, { mode: "map", cell });
  }

  function showCurrentEnemyDetail() {
    const enemy = state.currentEnemy;
    if (!isEnemyObject(enemy)) return;
    showEnemyDetail(enemy, { mode: "battle" });
  }

  function showEnemyDetail(enemy, options: any = {}) {
    const mode = options.mode || "map";
    const cell = options.cell || null;
    const actions = [{ text: "关闭", action: closeModal }];
    if (cell && isAdjacentToPlayer(cell)) {
      const dx = cell.x - state.player.x;
      const dy = cell.y - state.player.y;
      actions.push({
        text: "进入战斗",
        action: () => {
          closeModal();
          move(dx, dy);
        }
      });
    }
    showModal(
      `${enemy.name} 情报`,
      enemyDetailMarkup(enemy, mode, {
        autoBattlePolicy,
        battleRisk,
        currentEnemy: state.currentEnemy,
        effectiveMaxHp,
        enemyAffixText,
        objectSprite,
        totals
      }),
      actions
    );
  }

  function isAdjacentToPlayer(cell) {
    if (!cell || !state?.player) return false;
    return Math.abs(cell.x - state.player.x) + Math.abs(cell.y - state.player.y) === 1;
  }

  function renderContext() {
    const enemy = state.currentEnemy;
    if (enemy) {
      const panel = battleContextMarkup({
        enemy,
        risk: battleRisk(enemy),
        turn: currentBattleTurnState(),
        renderSkillActionButtons,
        renderLoreShortcut
      });
      $("contextTitle").textContent = panel.title;
      $("contextBody").innerHTML = panel.body;
      return;
    }
    const tutorial = renderTutorialCard();
    const loreShortcut = renderLoreShortcut();
    const cell = state.map.cells[state.player.y][state.player.x];
    const objectPanel = objectContextMarkup(cell.object?.type || "", tutorial, loreShortcut);
    const panel = objectPanel || explorationContextMarkup(tutorial, selectedTileText(), loreShortcut);
    $("contextTitle").textContent = panel.title;
    $("contextBody").innerHTML = panel.body;
  }
  function renderTutorialCard() {
    return renderTutorialCardMarkup(state);
  }

  function renderLoreShortcut() {
    return renderLoreShortcutMarkup(state);
  }

  // 渲染当前侧边栏标签页。
  function renderTab() {
    if (ui.activeTab === "inventory") renderInventory();
    if (ui.activeTab === "skills") renderSkills();
    if (ui.activeTab === "quests") $("tabBody").innerHTML = renderQuestList();
  }

  function renderQuestList() {
    return renderQuestListMarkup(questPanelContext());
  }

  function unlockedLoreEntries() {
    return unlockedLoreEntriesForState(state);
  }

  function openLoreArchive(index = 0) {
    openLoreArchivePanel(index, questPanelContext());
  }

  function questPanelContext() {
    return {
      closeModal,
      ensureQuestList,
      questLocationText,
      questRewardGold,
      showEvent,
      showModal,
      state
    };
  }

  // 渲染背包列表和物品操作按钮。
  function renderInventory() {
    $("tabBody").innerHTML = inventoryGroupMarkup();
  }

  function inventoryGroupMarkup() {
    return renderInventoryGroupMarkup(inventoryPanelContext());
  }

  function inventoryPanelContext() {
    return {
      activeEquipmentFilter: ui.activeEquipmentFilter,
      activeInventoryTab: ui.activeInventoryTab,
      equipmentScoreBadge,
      equipmentSummary,
      isBetterThanEquipped,
      runeEffectText,
      state
    };
  }

  function equipmentFilterRows(equipment) {
    return inventoryEquipmentFilterRows(inventoryPanelContext(), equipment);
  }

  function equipmentFilterControl() {
    return inventoryEquipmentFilterControl(inventoryPanelContext());
  }

  function selectInventoryTab(tab) {
    ui.activeInventoryTab = tab;
    renderInventory();
  }

  function selectEquipmentFilter(filter) {
    ui.activeEquipmentFilter = filter;
    renderInventory();
  }

  function potionRow(entry) {
    return inventoryPotionRow(entry);
  }

  function equipmentInventoryRow(entry) {
    return inventoryEquipmentInventoryRow(inventoryPanelContext(), entry);
  }

  function showInventoryEquipmentCompare(id) {
    const entry = state.inventory.find((item) => item.id === id);
    if (!entry || entry.kind !== "equip") return;
    const current = state.equipment?.[entry.slot];
    if (!current) {
      showInventoryEquipmentDetail(id);
      return;
    }
    const actions = [{ text: "关闭", action: closeModal }];
    if (isWeaponUsableByClass(entry, state.classId)) {
      actions.push({
        text: "装备",
        action: () => {
          closeModal();
          equipItem(id);
        }
      });
    }
    showModal(
      `${entry.name} 对比`,
      inventoryEquipmentCompareMarkup(entry, current, itemScore, equipmentCompareText),
      actions
    );
  }

  function showInventoryEquipmentDetail(id) {
    const entry = state.inventory.find((item) => item.id === id);
    if (!entry || entry.kind !== "equip") return;
    const runeText = entry.runeSlots
      ? `${entry.runes.length}/${entry.runeSlots}：${entry.runes.length ? entry.runes.join("、") : "未镶嵌"}`
      : "无";
    const compare = state.equipment?.[entry.slot]
      ? `<div class="detail-row"><b>对比</b><span>${equipmentCompareText(entry)}</span></div>`
      : "";
    const restriction = equipmentRestrictionText(entry, state.classId);
    const restrictionRow = restriction
      ? `<div class="detail-row"><b>限制</b><span>${restriction}</span></div>`
      : "";
    const actions = [{ text: "关闭", action: closeModal }];
    if (isWeaponUsableByClass(entry, state.classId)) {
      actions.push({
        text: "装备",
        action: () => {
          closeModal();
          equipItem(id);
        }
      });
    }
    showModal(
      entry.name,
      equipmentDetailMarkup(entry, SLOT_NAMES[entry.slot], runeText, `${restrictionRow}${compare}`),
      actions
    );
  }

  function materialRows() {
    return inventoryMaterialRows(state);
  }

  function runeRows() {
    return inventoryRuneRows(inventoryPanelContext());
  }

  // 渲染已装备物品和强化控制。
  function renderEquipment() {
    $("tabBody").innerHTML = renderEquipmentPanelMarkup(equipmentPanelContext());
  }

  // 渲染材料、符文库存和符文合成控制。
  function renderCraft() {
    $("tabBody").innerHTML = renderCraftPanelMarkup(equipmentPanelContext());
  }

  function equipmentPanelContext() {
    return {
      enhanceDisabledReason,
      equippedStateBadge,
      equipmentSummary,
      runeEffectText,
      runeEntries,
      state
    };
  }

  // 渲染职业技能列表和技能升级按钮。
  function skillLoadoutMarkup(equipped = battleSkills(), interactive = true) {
    return skillLoadoutPanelMarkup(skillPanelContext(), equipped, interactive);
  }

  function changeBattleSkillFromModal(skillId) {
    if (!toggleBattleSkill(skillId)) return;
    syncState();
    openSkillLoadout();
  }

  function updateBattleSkillFromList(skillId) {
    syncState();
    if (isSkillEquipped(skillId)) {
      toggleBattleSkill(skillId);
      return;
    }
    const equippedCount = battleSkills().length;
    if (equippedCount < battleSkillLimit) {
      setBattleSkillSlot(equippedCount, skillId);
      return;
    }
    openSkillLoadout();
  }

  function setBattleSkillSlot(slotIndex, skillId) {
    syncState();
    const learnedIds = new Set(classSkills().filter((skill) => isSkillLearned(skill.id)).map((skill) => skill.id));
    const ids = [...(state.equippedSkillIds || [])].filter((id) => learnedIds.has(id)).slice(0, battleSkillLimit);
    const current = ids[slotIndex] || "";
    if (!skillId) {
      if (!current) return;
      if (ids.length <= 1) {
        showEvent("无法移除", "<p>至少需要保留一个战斗技能。</p>", "知道了");
        return;
      }
      ids.splice(slotIndex, 1);
    } else if (learnedIds.has(skillId)) {
      const existingIndex = ids.indexOf(skillId);
      if (existingIndex === slotIndex) return;
      if (existingIndex >= 0) {
        ids.splice(existingIndex, 1);
        if (existingIndex < slotIndex) slotIndex -= 1;
      }
      if (slotIndex >= ids.length) ids.push(skillId);
      else ids[slotIndex] = skillId;
    }
    state.equippedSkillIds = ids.slice(0, battleSkillLimit);
    render();
    openSkillLoadout();
  }

  function openSkillLoadout() {
    syncState();
    const learned = classSkills().filter((skill) => isSkillLearned(skill.id));
    const equipped = battleSkills();
    showModal(
      "调整已装备技能",
      skillLoadoutModalMarkup(skillPanelContext(), learned, equipped),
      [
        {
          text: "完成",
          action: () => {
            closeModal();
            renderSkills();
          }
        }
      ]
    );
  }

  function renderSkills() {
    $("tabBody").innerHTML = renderSkillsMarkup(skillPanelContext());
  }

  function skillPanelContext() {
    return {
      battleSkillLimit,
      battleSkills,
      canLearnSkill,
      canUpgradeSkill,
      classSkills,
      isSkillEquipped,
      isSkillLearned,
      skillPreviewText,
      skillRequirementText,
      skillUpgradeCost,
      state,
      upgradedSkill
    };
  }

  // 格式化装备属性摘要。
  function statsText(eq) {
    return equipmentStatsText(eq);
  }

  function runeEntries() {
    return Object.entries(state.runes || {}) as Array<[string, number]>;
  }

  // 生成装备列表中复用的评分、部位、品质和属性摘要。
  function equipmentSummary(eq, stateLabel = "") {
    return equipmentSummaryMarkup(eq, itemScore(eq), stateLabel);
  }

  function equippedStateBadge() {
    return equippedStateBadgeMarkup();
  }

  // 生成候选装备与当前装备的详细对比文本。
  function equipmentCompareText(item, extraClass = "") {
    return equipmentCompareTextMarkup(
      {
        effectiveItemStat,
        equipmentRestrictionText,
        itemScore,
        state
      },
      item,
      extraClass
    );
  }

  function equipmentScoreBadge(item, extraClass = "") {
    const current = state.equipment?.[item.slot];
    const scoreDelta = itemScore(item) - itemScore(current);
    const direction = scoreDelta >= 0 ? "up" : "down";
    const arrow = scoreDelta >= 0 ? "↑" : "↓";
    const scoreSign = scoreDelta > 0 ? "+" : "";
    return `<small class="equipment-compare score-only-compare ${extraClass}">${equipmentScoreBadgeMarkup(direction, arrow, scoreSign, scoreDelta)}</small>`;
  }

  function equipmentScoreBadgeMarkup(direction, arrow, scoreSign, scoreDelta) {
    return equipmentScoreBadgeMarkupForDelta(direction, arrow, scoreSign, scoreDelta);
  }

  function enhanceText(eq) {
    return equipmentEnhanceText(eq);
  }

  function equipmentDetailMarkup(eq, slotName, runeText, extraRows = "") {
    return equipmentDetailMarkupForItem(eq, slotName, runeText, itemScore(eq), extraRows);
  }

  function isBetterThanEquipped(item) {
    if (item.kind !== "equip") return false;
    if (!isWeaponUsableByClass(item, state.classId)) return false;
    return itemScore(item) > itemScore(state.equipment[item.slot]);
  }

  // 渲染最新的冒险日志。
  function renderLog() {
    $("log").innerHTML = state.log.map((entry) => `<div>${escapeHtml(entry)}</div>`).join("");
  }

  // 追加一条冒险日志，并限制日志长度。
  const withState =
    (fn) =>
    (...args) => {
      syncState();
      return fn(...args);
    };

  return {
    battleFxClass,
    battlePotionGroups: withState(battlePotionGroups),
    battleStatusPill,
    badgeForObject,
    centerFxMarkup,
    changeBattleSkillFromModal: withState(changeBattleSkillFromModal),
    clickTile: withState(clickTile),
    combatantFxMarkup,
    confirmBuy: withState(confirmBuy),
    confirmDeleteSaveSlot: withState(confirmDeleteSaveSlot),
    continueSavedGame: withState(continueSavedGame),
    effectiveItemStat: withState(effectiveItemStat),
    enhanceText,
    equipmentCompareText: withState(equipmentCompareText),
    equipmentDetailMarkup,
    equipmentFilterControl: withState(equipmentFilterControl),
    equipmentFilterRows: withState(equipmentFilterRows),
    equipmentInventoryRow: withState(equipmentInventoryRow),
    equipmentScoreBadge: withState(equipmentScoreBadge),
    equipmentScoreBadgeMarkup,
    equipmentSummary: withState(equipmentSummary),
    equippedStateBadge: withState(equippedStateBadge),
    iconClassForType,
    iconSprite,
    imageTag,
    inventoryGroupMarkup: withState(inventoryGroupMarkup),
    isBetterThanEquipped: withState(isBetterThanEquipped),
    itemScore: withState(itemScore),
    mapViewBounds: withState(mapViewBounds),
    materialRows: withState(materialRows),
    minimapMarker,
    minimapObjectIcon,
    minimapOverviewBounds,
    newGameInSlot: withState(newGameInSlot),
    nextNewGameSlot: withState(nextNewGameSlot),
    objectSprite,
    openLoreArchive: withState(openLoreArchive),
    openSkillLoadout: withState(openSkillLoadout),
    percentScore,
    potionRow: withState(potionRow),
    render: withState(render),
    renderBattleCommandPanel: withState(renderBattleCommandPanel),
    renderBattlePotionButtons: withState(renderBattlePotionButtons),
    renderBattleView: withState(renderBattleView),
    renderClassSelect: withState(renderClassSelect),
    renderContext: withState(renderContext),
    renderContinueSlots: withState(renderContinueSlots),
    renderCraft: withState(renderCraft),
    renderEquipment: withState(renderEquipment),
    renderHero: withState(renderHero),
    renderInventory: withState(renderInventory),
    renderLegend,
    renderLog: withState(renderLog),
    renderMap: withState(renderMap),
    renderMinimap: withState(renderMinimap),
    renderPaperdoll: withState(renderPaperdoll),
    renderQuestList: withState(renderQuestList),
    renderSkillActionButtons: withState(renderSkillActionButtons),
    renderSkills: withState(renderSkills),
    renderStartScreen: withState(renderStartScreen),
    renderTab: withState(renderTab),
    roomDoorLabel: withState(roomDoorLabel),
    runeRows: withState(runeRows),
    saveSlotCard: withState(saveSlotCard),
    selectEquipmentFilter: withState(selectEquipmentFilter),
    selectInventoryTab: withState(selectInventoryTab),
    selectMinimapTile: withState(selectMinimapTile),
    selectedTileText: withState(selectedTileText),
    setBattleSkillSlot: withState(setBattleSkillSlot),
    shouldShowMapObject: withState(shouldShowMapObject),
    showCurrentEnemyDetail: withState(showCurrentEnemyDetail),
    showEnemyDetailAt: withState(showEnemyDetailAt),
    showEquipmentSlot: withState(showEquipmentSlot),
    showInventoryEquipmentCompare: withState(showInventoryEquipmentCompare),
    showInventoryEquipmentDetail: withState(showInventoryEquipmentDetail),
    sprite,
    startNewGame: withState(startNewGame),
    statsText,
    tileLabel: withState(tileLabel),
    updateBattleSkillFromList: withState(updateBattleSkillFromList)
  };
}
