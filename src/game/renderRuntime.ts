// @ts-nocheck
import {
  ASSETS,
  CLASSES,
  DEFAULT_CLASS_ID,
  LEGEND_ITEMS,
  MAP_VIEW_SIZE,
  RUNES,
  SLOT_NAMES,
  SLOTS,
  STAT_NAMES,
  isValidMapSize
} from "./data";
import { getBattleFx } from "./combatFx";
import { cellsWithin, distance } from "./mapGeometry";
import { QUEST_DEFS } from "./quests";
import { syncWeatherCanvas } from "./weatherCanvas";

// 渲染运行时集中生成 DOM 字符串和面板状态，不承担战斗、掉落等规则计算。
export function createRenderRuntime(ctx) {
  const { $, ui, api } = ctx;
  let state = ctx.getState();
  const syncState = () => {
    state = ctx.getState();
    return state;
  };

  const addStat = (...args) => api.addStat(...args);
  const autoBattle = (...args) => api.autoBattle(...args);
  const autoBattlePolicy = (...args) => api.autoBattlePolicy(...args);
  const battleRisk = (...args) => api.battleRisk(...args);
  const buy = (...args) => api.buy(...args);
  const canEnhance = (...args) => api.canEnhance(...args);
  const canSellEquipmentHere = (...args) => api.canSellEquipmentHere(...args);
  const canUpgradeSkill = (...args) => api.canUpgradeSkill(...args);
  const canUnequipSlot = (...args) => api.canUnequipSlot(...args);
  const closeModal = (...args) => api.closeModal(...args);
  const currentStairsDown = (...args) => api.currentStairsDown(...args);
  const deleteSaveSlot = (...args) => api.deleteSaveSlot(...args);
  const effectiveMaxHp = (...args) => api.effectiveMaxHp(...args);
  const effectiveMaxMp = (...args) => api.effectiveMaxMp(...args);
  const enhanceDisabledReason = (...args) => api.enhanceDisabledReason(...args);
  const equipItem = (...args) => api.equipItem(...args);
  const equipmentSellValue = (...args) => api.equipmentSellValue(...args);
  const equipmentSalvageValue = (...args) => api.equipmentSalvageValue(...args);
  const enemyAffixText = (...args) => api.enemyAffixText(...args);
  const ensureQuestList = (...args) => api.ensureQuestList(...args);
  const generateFloor = (...args) => api.generateFloor(...args);
  const isDefeatedEnemy = (...args) => api.isDefeatedEnemy(...args);
  const knownTeleportTargets = (...args) => api.knownTeleportTargets(...args);
  const loadGame = (...args) => api.loadGame(...args);
  const move = (...args) => api.move(...args);
  const questLocationText = (...args) => api.questLocationText(...args);
  const questRewardGold = (...args) => api.questRewardGold(...args);
  const roomName = (...args) => api.roomName(...args);
  const runeEffectText = (...args) => api.runeEffectText(...args);
  const saveSlotLabel = (...args) => api.saveSlotLabel(...args);
  const saveGame = (...args) => api.saveGame(...args);
  const formatSaveTime = (...args) => api.formatSaveTime(...args);
  const saveSlots = (...args) => api.saveSlots(...args);
  const sellEquipment = (...args) => api.sellEquipment(...args);
  const showConfirm = (...args) => api.showConfirm(...args);
  const showEvent = (...args) => api.showEvent(...args);
  const showModal = (...args) => api.showModal(...args);
  const skillById = (...args) => api.skillById(...args);
  const skillLevel = (...args) => api.skillLevel(...args);
  const skillPreviewText = (...args) => api.skillPreviewText(...args);
  const skillUpgradeCost = (...args) => api.skillUpgradeCost(...args);
  const startGame = (...args) => api.startGame(...args);
  const syncMusicToGame = (...args) => api.syncMusicToGame(...args);
  const themeForFloor = (...args) => api.themeForFloor(...args);
  const totals = (...args) => api.totals(...args);
  const unequipItem = (...args) => api.unequipItem(...args);
  const updateVisibility = (...args) => api.updateVisibility(...args);
  const upgradedSkill = (...args) => api.upgradedSkill(...args);

  // 渲染开始页，根据存档槽状态决定展示继续入口或新游戏入口。
  function renderStartScreen() {
    const slots = saveSlots();
    const occupied = slots.filter((slot) => slot.meta);
    $("classSelect").innerHTML = `
    <article class="start-hub">
      <header class="start-hero">
        <div>
          <span>冒险入口</span>
          <h2>符文地牢</h2>
          <p>开启一局新的地牢探索，或从已有存档继续。</p>
        </div>
      </header>
      <div class="start-actions">
        <button type="button" onclick="startNewGame()">新游戏</button>
        <button type="button" ${occupied.length ? "" : "disabled"} onclick="renderContinueSlots()">继续</button>
      </div>
      ${occupied.length ? `<p class="start-note">继续会打开存档列表；新游戏会自动创建一个新存档。</p>` : `<p class="start-note">暂无存档，直接开始就是新游戏。</p>`}
    </article>
  `;
  }

  function renderContinueSlots() {
    const slots = saveSlots().filter((slot) => slot.meta);
    $("classSelect").innerHTML = `
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
        ${slots.map(saveSlotCard).join("")}
      </div>
    </article>
  `;
  }

  function continueSavedGame(slotId = ui.currentSaveSlot) {
    if (!loadGame(slotId)) return;
    syncState();
    render();
  }

  function saveSlotCard(slot) {
    const meta = slot.meta;
    if (!meta) {
      return `
      <article class="save-slot empty">
        <div class="save-slot-main">
          <span>${slot.label}</span>
          <b>空存档</b>
          <small>创建一个新的地牢角色。</small>
        </div>
        <button type="button" onclick="newGameInSlot('${slot.id}')">创建</button>
      </article>
    `;
    }
    return `
    <article class="save-slot ${slot.id === ui.currentSaveSlot ? "active" : ""}">
      <div class="save-slot-main">
        <span>${slot.label} · ${formatSaveTime(meta.updatedAt)}${slot.id === ui.currentSaveSlot ? " · 当前" : ""}</span>
        <b>${meta.className || "冒险者"} Lv.${meta.level || 1}</b>
        <small>第 ${meta.floor || 1} 层 · 金币 ${meta.gold || 0} · HP ${meta.hp || 0}/${meta.maxHp || 0}</small>
      </div>
      <div class="save-slot-actions">
        <button type="button" onclick="continueSavedGame('${slot.id}')">继续</button>
        <button type="button" onclick="confirmDeleteSaveSlot('${slot.id}')">删除</button>
      </div>
    </article>
  `;
  }

  function nextNewGameSlot() {
    return saveSlots().find((slot) => !slot.meta)?.id || null;
  }

  function startNewGame(slotId = nextNewGameSlot()) {
    if (!slotId) {
      showModal("存档已满", "<p>四个存档槽都已有记录。请先删除一个旧存档，再开始新游戏。</p>", [
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
    startGame(DEFAULT_CLASS_ID, slotId);
  }

  function newGameInSlot(slotId) {
    const slot = saveSlots().find((entry) => entry.id === slotId);
    if (slot?.meta) {
      showConfirm(
        "覆盖存档",
        `<p>${slot.label} 已有 ${slot.meta.className || "冒险者"} Lv.${slot.meta.level || 1}，新游戏会覆盖该槽。</p>`,
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
      `<p>删除 ${slot.label} 的 ${slot.meta.className || "冒险者"} Lv.${slot.meta.level || 1}？此操作不会影响其他存档。</p>`,
      "删除",
      () => {
        deleteSaveSlot(slotId);
        closeModal();
        if (state && ui.currentSaveSlot === slotId) ctx.setState(null);
        renderStartScreen();
        render();
      }
    );
  }

  // 渲染职业选择卡片，玩家选择后会创建新角色状态。
  function renderClassSelect(slotId = ui.pendingSaveSlot || ui.currentSaveSlot || "slot-1") {
    ui.pendingSaveSlot = slotId;
    const slotLabel = saveSlotLabel(slotId);
    $("classSelect").innerHTML =
      Object.entries(CLASSES)
        .map(
          ([id, cls]) => `
    <article class="class-card">
      <h2>${cls.name}</h2>
      <small>${cls.role || "职业"} · 主属性 ${cls.primary || "均衡"}</small>
      <p>${cls.desc}</p>
      <ul>${cls.skills.map((skill) => `<li>${skill.name}：${skill.desc}</li>`).join("")}</ul>
      <button type="button" onclick="startGame('${id}', '${slotId}')">写入${slotLabel}</button>
    </article>
  `
        )
        .join("") +
      `<article class="class-card class-back-card"><h2>${slotLabel}</h2><p>返回存档列表可以切换槽位，或选择其他存档继续。</p><button type="button" onclick="renderStartScreen()">返回存档</button></article>`;
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
    saveGame(false);
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
    $("statsGrid").innerHTML = Object.entries(STAT_NAMES)
      .map(
        ([key, name]) => `
    <div class="stat">
      <span>${name} ${t[key]}</span>
      <button type="button" ${state.statPoints ? "" : "disabled"} onclick="confirmAddStat('${key}')">+</button>
    </div>
  `
      )
      .join("");
    renderPaperdoll();
  }

  function renderPaperdoll() {
    const slots = [
      ["weapon", "weapon"],
      ["armor", "armor"],
      ["boots", "boots"],
      ["ring", "ring"],
      ["amulet", "amulet"]
    ];
    $("paperdoll").innerHTML = `
    <div class="paperdoll-figure">${imageTag(assetForClass(state.classId), CLASSES[state.classId].name)}</div>
    ${slots
      .map(([slot, cls]) => {
        const eq = state.equipment[slot];
        return `<button class="gear-slot gear-${cls} ${eq ? "equipped" : ""}" type="button" onclick="showEquipmentSlot('${slot}')" title="${eq ? eq.name : SLOT_NAMES[slot]}">
        <span>${SLOT_NAMES[slot]}</span>
        <small>${eq ? `+${eq.level}` : "空"}</small>
      </button>`;
      })
      .join("")}
  `;
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
    const cells = [];
    for (let y = view.y; y < view.y + view.size; y++) {
      for (let x = view.x; x < view.x + view.size; x++) {
        const cell = state.map.cells[y][x];
        if (!cell.seen) {
          cells.push(`<button class="tile unseen" type="button" aria-label="未知"></button>`);
          continue;
        }
        const terrain = ["wall", "door", "fence", "lava"].includes(cell.terrain)
          ? cell.terrain
          : "floor";
        const isPlayer = cell.x === state.player.x && cell.y === state.player.y;
        const isSelected = ui.selectedTile?.x === cell.x && ui.selectedTile?.y === cell.y;
        const showObject = shouldShowMapObject(cell);
        const tileSprite = isPlayer
          ? sprite(
              `player facing-${state.facing || "down"}`,
              assetForClass(state.classId),
              CLASSES[state.classId].name
            )
          : showObject
            ? objectSprite(cell.object)
            : "";
        const objectBadge = showObject ? badgeForObject(cell.object.type) : "";
        const roomLabel = roomDoorLabel(cell);
        const roomBadge = roomLabel ? `<span class="room-label">${roomLabel}</span>` : "";
        const label = tileLabel(cell, isPlayer);
        const showHint =
          isPlayer ||
          showObject ||
          ["wall", "door", "fence", "lava"].includes(cell.terrain) ||
          roomLabel;
        const hint = showHint ? `<span class="tile-hint">${label}</span>` : "";
        const title = "";
        const flags = [
          terrain,
          isPlayer ? " current" : "",
          "",
          isSelected ? " selected" : "",
          cell.object ? ` object object-${cell.object.type}` : ""
        ].join("");
        cells.push(
          `<button class="tile ${flags}" type="button"${title} aria-label="${label}" onclick="clickTile(${cell.x},${cell.y})">${tileSprite}${objectBadge}${roomBadge}${hint}</button>`
        );
      }
    }
    map.innerHTML = cells.join("");
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
    if (cell.terrain !== "door" || !cell.roomId) return "";
    const number = roomName(cell.roomId).match(/\d+/)?.[0];
    if (!number) return "";
    return `${number}`;
  }

  function shouldShowMapObject(cell) {
    return !!cell.object && cell.seen && cell.object.type !== "trap";
  }

  function mapViewBounds() {
    const preferred = typeof MAP_VIEW_SIZE === "number" ? MAP_VIEW_SIZE : state.map.size;
    const size = Math.min(preferred, state.map.size);
    const half = Math.floor(size / 2);
    const max = state.map.size - size;
    return {
      x: Math.max(0, Math.min(max, state.player.x - half)),
      y: Math.max(0, Math.min(max, state.player.y - half)),
      size
    };
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
    const cells = [];
    const roomMarkers = minimapRoomMarkers();
    for (let y = 0; y < state.map.size; y++) {
      for (let x = 0; x < state.map.size; x++) {
        const cell = state.map.cells[y][x];
        const isPlayer = cell.x === state.player.x && cell.y === state.player.y;
        const marker = minimapMarker(cell, isPlayer, roomMarkers.get(`${cell.x},${cell.y}`));
        const inView =
          cell.x >= view.x &&
          cell.x < view.x + view.size &&
          cell.y >= view.y &&
          cell.y < view.y + view.size;
        const classes = [
          "mini-cell",
          cell.seen ? "seen" : "unknown",
          cell.terrain === "lava"
            ? "mini-lava"
            : ["wall", "fence"].includes(cell.terrain)
              ? "mini-wall"
              : "mini-floor",
          cell.seen && cell.object ? `obj-${cell.object.type}` : "",
          inView ? "in-view" : "",
          isPlayer ? "mini-player" : ""
        ].join(" ");
        cells.push(
          `<button class="${classes}" type="button" title="${tileLabel(cell, isPlayer)}" onclick="selectMinimapTile(${cell.x},${cell.y})">${marker}</button>`
        );
      }
    }
    minimap.innerHTML = `<div class="mini-grid">${cells.join("")}<span class="mini-view-frame"></span></div>`;
  }

  function minimapOverviewBounds(view) {
    const size = state.map.size;
    return {
      size,
      viewX: (view.x / size) * 100,
      viewY: (view.y / size) * 100,
      viewSize: (view.size / size) * 100
    };
  }

  function minimapMarker(cell, isPlayer, roomNumber = "") {
    if (isPlayer) {
      return `<span class="mini-dot mini-player-dot" aria-label="${CLASSES[state.classId].name}"></span>`;
    }
    if (!cell.seen) return "";
    if (cell.object) {
      if (cell.object.type === "trap") return "";
      const icon = minimapObjectIcon(cell.object);
      return `<span class="mini-dot mini-${icon.cls}" aria-label="${icon.alt}"></span>`;
    }
    if (cell.terrain === "door")
      return `<span class="mini-dot mini-door" aria-label="房门"></span>`;
    if (roomNumber)
      return `<span class="mini-room-label" aria-label="${roomNumber}号房">${roomNumber}</span>`;
    return "";
  }

  function minimapRoomMarkers() {
    const markers = new Map();
    for (const room of state.map.rooms || []) {
      const number = room.name.match(/\d+/)?.[0];
      if (!number) continue;
      const cells = state.map.cells
        .flat()
        .filter(
          (cell) => cell.roomId === room.id && cell.seen && cell.terrain === "floor" && !cell.object
        );
      if (!cells.length) continue;
      const center = roomCenter(cells);
      const best = cells.sort((a, b) => distance(a, center) - distance(b, center))[0];
      if (best) markers.set(`${best.x},${best.y}`, number);
    }
    return markers;
  }

  function roomCenter(cells) {
    const total = cells.reduce((sum, cell) => ({ x: sum.x + cell.x, y: sum.y + cell.y }), {
      x: 0,
      y: 0
    });
    return { x: total.x / cells.length, y: total.y / cells.length };
  }

  function minimapObjectIcon(obj) {
    if (["monster", "elite", "boss"].includes(obj.type)) {
      const variants = {
        slime: ["monster", ASSETS.monster, "怪物"],
        rat: ["monster", ASSETS.monsterRat, "洞穴鼠"],
        bat: ["monster", ASSETS.monsterBat, "矿洞蝙蝠"],
        wolf: ["monster", ASSETS.monsterWolf, "冰霜狼"],
        elite: ["elite", ASSETS.elite, "精英怪"],
        boss: ["boss", ASSETS.boss, "Boss"]
      };
      const fallback = obj.type === "boss" ? "boss" : obj.type === "elite" ? "elite" : "slime";
      const [cls, src, alt] = variants[obj.variant || fallback] || variants[fallback];
      return { cls, src, alt };
    }
    const icons = {
      chest: { cls: "chest", src: ASSETS.chest, alt: "宝箱" },
      lockedChest: { cls: "locked-chest", src: ASSETS.chest, alt: "上锁宝箱" },
      altar: { cls: "altar", src: ASSETS.altar, alt: "祭坛" },
      forge: { cls: "forge", src: ASSETS.forge, alt: "合成台" },
      shop: { cls: "merchant", src: ASSETS.shop, alt: "商人" },
      questNpc: { cls: "quest-npc", src: ASSETS.questNpc, alt: "委托人" },
      rescueNpc: { cls: "quest-npc", src: ASSETS.questNpc, alt: "被困者" },
      lockedDoor: { cls: "locked-door", src: null, alt: "上锁房门" },
      fenceGate: { cls: "fence-gate", src: ASSETS.fenceGate, alt: "门栅" },
      trap: { cls: "trap", src: ASSETS.trap, alt: "陷阱" },
      portal: { cls: "portal", src: ASSETS.portal, alt: "传送门" },
      stairsDown: { cls: "stairs-down", src: null, alt: "下行楼梯" },
      stairsUp: { cls: "stairs-up", src: null, alt: "上行楼梯" }
    };
    return icons[obj.type] || { cls: "unknown", src: null, alt: "未知" };
  }

  function selectMinimapTile(x, y) {
    ui.selectedTile = { x, y };
    render();
  }

  // 渲染地图下方始终可见的图例说明。
  function renderLegend() {
    const legendItems = LEGEND_ITEMS.filter(([type]) => type !== "portal").concat([
      ["stairsDown", "下层", "进入下一层"],
      ["stairsUp", "上层", "返回上一层"]
    ]);
    $("legend").innerHTML = legendItems
      .map(([type, label, desc]) => {
        const src = type === "player" ? assetForClass(state.classId) : ASSETS[type];
        return `
      <div class="legend-item" title="${desc}">
        ${src ? `<img src="${src}" alt="${label}" draggable="false">` : iconSprite(iconClassForType(type), label)}
        <span>${label}</span>
      </div>
    `;
      })
      .join("");
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
    battleStage.innerHTML = `
    <div class="battle-board">
      <div class="combatant hero-combatant ${battleFxClass("hero")}">
        <div class="battle-sprite">${sprite("player", assetForClass(state.classId), cls.name)}</div>
        ${combatantFxMarkup("hero")}
        <h2>${cls.name}</h2>
        <div class="battle-meter"><span style="width:${hpPct}%"></span><b>${Math.ceil(state.hp)}/${hpMax} HP</b></div>
        <div class="battle-meter mp"><span style="width:${mpPct}%"></span><b>${Math.ceil(state.mp)}/${mpMax} MP</b></div>
      </div>
      <div class="battle-center">
        <strong>VS</strong>
        ${centerFxMarkup()}
      </div>
      <div class="combatant enemy-combatant ${battleFxClass("enemy")}">
        <div class="battle-sprite">${objectSprite(enemy)}</div>
        ${combatantFxMarkup("enemy")}
        <h2>${enemy.name}</h2>
        ${enemy.affix ? `<small class="enemy-affix">${enemyAffixText(enemy)}</small>` : ""}
        <div class="battle-meter enemy"><span style="width:${enemyPct}%"></span><b>${Math.max(0, Math.round(enemy.hp))}/${enemy.maxHp} HP</b></div>
        <p>攻击 ${enemy.atk} · 防御 ${enemy.def}</p>
      </div>
    </div>
    ${renderBattleCommandPanel(mpMax)}
  `;
  }

  // 渲染战斗命令面板：普通行动、技能、补给和一键战斗。
  function renderBattleCommandPanel(mpMax = effectiveMaxMp()) {
    const policy = state.currentEnemy ? autoBattlePolicy(state.currentEnemy) : null;
    const winRate = policy ? percentScore(policy.score) : null;
    return `
    <div class="battle-command-panel">
      <div class="battle-command-layout">
        <div class="battle-basic-actions battle-command-section">
          <div class="battle-panel-title">
            <span>行动</span>
            <small>本回合</small>
          </div>
          <div class="battle-action-grid">
            <button class="battle-action battle-action-attack" type="button" onclick="attackEnemy('attack')">
              <span class="battle-action-mark" aria-hidden="true">攻</span>
              <span class="battle-action-copy"><b>普通攻击</b><small>稳定造成武器伤害</small></span>
            </button>
            <button class="battle-action battle-action-guard" type="button" onclick="attackEnemy('defend')">
              <span class="battle-action-mark" aria-hidden="true">守</span>
              <span class="battle-action-copy"><b>防御</b><small>本回合减少伤害</small></span>
            </button>
          </div>
        </div>
        <div class="battle-skill-panel battle-command-section">
          <div class="battle-panel-title">
            <span>技能</span>
            <small>MP ${Math.ceil(state.mp)}/${mpMax}</small>
          </div>
          <div class="battle-skill-grid">
            ${renderSkillActionButtons("battle")}
          </div>
        </div>
        <div class="battle-command-side">
          <div class="battle-consumable-panel battle-command-section">
            <div class="battle-panel-title">
              <b>补给</b>
              <small>消耗行动</small>
            </div>
            <div class="battle-consumable-grid">
              ${renderBattlePotionButtons()}
            </div>
          </div>
          <div class="battle-auto-panel battle-command-section">
            <div class="battle-panel-title">
              <span>战术</span>
              ${policy ? `<small>${policy.label}</small>` : "<small>评估</small>"}
            </div>
            <button class="battle-action auto" type="button" ${policy?.allowed ? "" : "disabled"} onclick="autoBattle()">
              <span class="battle-action-head"><b>一键战斗</b>${policy ? `<i class="battle-win-rate">胜率 ${winRate}%</i>` : ""}</span>
              <small>${policy?.allowed ? "低风险普通怪可自动结算 3 回合" : policy?.reason || "需要评估"}</small>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  }

  function battleStatusPill(label, value, pct, kind, detail = "") {
    return `<div class="battle-status-pill ${kind}" style="--status:${pct}%"><span>${label}</span><b>${value}</b>${detail ? `<small>${detail}</small>` : ""}<i></i></div>`;
  }

  function percentScore(score) {
    return Math.max(0, Math.min(100, Math.round(Number.isFinite(score) ? score * 100 : 0)));
  }

  function battlePotionGroups() {
    const groups = new Map();
    for (const entry of state.inventory || []) {
      if (entry.kind !== "potion") continue;
      const key = `${entry.name}|${entry.effect}|${entry.amount}`;
      const group = groups.get(key) || { ...entry, count: 0 };
      group.count += 1;
      groups.set(key, group);
    }
    return [...groups.values()];
  }

  // 把背包药水按名称和效果分组，生成战斗中可用的补给按钮。
  function renderBattlePotionButtons() {
    const potions = battlePotionGroups();
    if (!potions.length) return `<p class="battle-empty-supplies">暂无药剂</p>`;
    return potions
      .slice(0, 4)
      .map((entry) => {
        const isHp = entry.effect === "hp";
        const cap = isHp ? effectiveMaxHp() : effectiveMaxMp();
        const current = isHp ? state.hp : state.mp;
        const disabled = current >= cap ? "disabled" : "";
        const effectText = `${isHp ? "HP" : "MP"} +${entry.amount}`;
        const note = disabled ? "已满" : "立即恢复";
        return `<button class="battle-consumable" type="button" ${disabled} onclick="useBattlePotion('${entry.id}')"><span class="battle-card-head"><b>${entry.name}</b><i>x${entry.count}</i></span><span class="battle-effect-text">${effectText}</span><small>${note}</small></button>`;
      })
      .join("");
  }

  // 根据当前模式生成技能按钮，战斗模式会展示更完整的资源信息。
  function renderSkillActionButtons(mode = "compact") {
    return CLASSES[state.classId].skills
      .map((skill) => {
        const upgraded = upgradedSkill(skill);
        const level = upgraded.level ? ` Lv.${upgraded.level}` : "";
        const hasMp = state.mp >= upgraded.mp;
        const disabled = hasMp ? "" : "disabled";
        if (mode === "battle") {
          const mpText = hasMp ? `${upgraded.mp} MP` : `${upgraded.mp} MP · MP不足`;
          return `<button class="battle-skill-card" type="button" ${disabled} onclick="attackEnemy('skill', skillById('${skill.id}'))"><span class="battle-card-head"><b>${skill.name}${level}</b><i>${mpText}</i></span><span class="skill-preview">${skillPreviewText(upgraded)}</span><small>${skill.desc}</small></button>`;
        }
        return `<button type="button" ${disabled} onclick="attackEnemy('skill', skillById('${skill.id}'))">${skill.name}${level} · ${skillPreviewText(upgraded)} · ${upgraded.mp} MP</button>`;
      })
      .join("");
  }

  function battleFxClass(target) {
    const fx = getBattleFx()?.[target];
    if (!fx) return "";
    return `fx-${fx.type}`;
  }

  function combatantFxMarkup(target) {
    const fx = getBattleFx()?.[target];
    if (!fx) return "";
    return `<span class="combat-fx combat-fx-${fx.type}" style="--fx-key:${fx.seq}"><b>${fx.text}</b><small>${fx.label}</small></span>`;
  }

  function centerFxMarkup() {
    const fx = getBattleFx()?.center;
    if (!fx) return "";
    return `<span class="center-fx center-fx-${fx.type}">${fx.text}</span>`;
  }

  // 将地图物件转换成对应的精灵 HTML。
  function objectSprite(obj) {
    if (["monster", "elite", "boss"].includes(obj.type)) return enemySprite(obj);
    const map = {
      monster: ["monster", ASSETS.monster, "怪物"],
      elite: ["elite", ASSETS.elite, "精英怪"],
      boss: ["boss", ASSETS.boss, "Boss"],
      chest: ["chest", ASSETS.chest, "宝箱"],
      lockedChest: ["locked-chest", ASSETS.chest, "上锁宝箱"],
      altar: ["altar", ASSETS.altar, "祭坛"],
      forge: ["forge", ASSETS.forge, "合成台"],
      shop: ["merchant", ASSETS.shop, "商人"],
      questNpc: ["quest-npc", ASSETS.questNpc, "委托人"],
      rescueNpc: ["quest-npc", ASSETS.questNpc, "被困者"],
      lockedDoor: ["locked-door", null, "上锁房门"],
      fenceGate: ["fence-gate", ASSETS.fenceGate, "门栅"],
      trap: ["trap", ASSETS.trap, "陷阱"],
      portal: ["portal", ASSETS.portal, "传送门"],
      stairsDown: ["stairs-down", null, "下行楼梯"],
      stairsUp: ["stairs-up", null, "上行楼梯"]
    };
    const [cls, src, alt] = map[obj.type] || ["monster", ASSETS.monster, "怪物"];
    return src ? sprite(cls, src, alt) : iconSprite(cls, alt);
  }

  function enemySprite(enemy) {
    const variants = {
      slime: ["monster", ASSETS.monster, "史莱姆"],
      rat: ["monster rat", ASSETS.monsterRat, "洞窟鼠"],
      bat: ["monster bat", ASSETS.monsterBat, "矿洞蝙蝠"],
      wolf: ["monster wolf", ASSETS.monsterWolf, "冰霜狼"],
      elite: ["elite", ASSETS.elite, "精英怪"],
      boss: ["boss", ASSETS.boss, "Boss"]
    };
    const fallback = enemy.type === "boss" ? "boss" : enemy.type === "elite" ? "elite" : "slime";
    const [cls, src, alt] = variants[enemy.variant || fallback] || variants[fallback];
    return sprite(cls, src, alt);
  }

  // 为地图物件添加短标签，帮助小尺寸格子快速识别对象。
  function badgeForObject(type) {
    const labels = {
      monster: "怪",
      elite: "精",
      boss: "王",
      chest: "箱",
      lockedChest: "锁",
      altar: "坛",
      forge: "锻",
      shop: "商",
      questNpc: "托",
      rescueNpc: "救",
      lockedDoor: "锁",
      fenceGate: "栅",
      trap: "陷",
      portal: "门",
      stairsDown: "下",
      stairsUp: "上"
    };
    return labels[type] ? `<span class="tile-badge badge-${type}">${labels[type]}</span>` : "";
  }

  // 生成地图格子的可读描述，用于 aria-label 和选中格提示。
  function tileLabel(cell, isPlayer = false, reveal = false) {
    if (!reveal && !cell.seen) return "未知区域";
    if (isPlayer) return `你的位置：${CLASSES[state.classId].name}`;
    if (cell.terrain === "wall") return "墙壁：无法通行";
    if (cell.terrain === "fence") return "铁栅栏：围住宝箱，寻找门栅入口";
    if (cell.terrain === "lava") return "岩浆：无法通行";
    if (cell.object?.type === "lockedDoor")
      return `${cell.object.roomName || "上锁房门"}：需要${cell.object.keyName || "指定钥匙"}，或消耗 1 把万能钥匙`;
    if (cell.terrain === "door") return "房间门：进入封闭房间";
    if (!cell.object) return "地面：可通行";
    if (cell.object.type === "trap") return "地面：可通行";
    const labels = {
      monster: "普通怪物：接触后进入战斗",
      elite: `精英怪：更危险，掉落更好${cell.object.affix ? `；${enemyAffixText(cell.object)}` : ""}`,
      boss: "Boss：本层首领",
      chest: "宝箱：可能获得装备、符文或金币",
      lockedChest: "上锁宝箱：需要符文钥匙。钥匙可以从附近钥匙守卫、Boss或中立委托人处获得",
      altar: "符文祭坛：恢复生命和法力",
      forge: "合成台：强化装备或合成符文",
      shop: "商人：购买药水和补给",
      questNpc: cell.object.npcName
        ? `${cell.object.npcName}：提供${cell.object.roomName || roomName(cell.object.roomId)}相关委托`
        : "中立委托人：完成任务获得钥匙和金币",
      rescueNpc: `${cell.object.npcName || "被困者"}：清理${roomName(cell.object.roomId)}后确认救援`,
      lockedDoor: `${cell.object.roomName || "上锁房门"}：需要${cell.object.keyName || "指定钥匙"}或万能钥匙`,
      fenceGate: "符文门栅：有钥匙后可打开围栏入口",
      trap: "陷阱：触发后受到伤害",
      portal: "传送门：进入下一层",
      stairsDown: cell.object.locked
        ? `封印楼梯：击败${cell.object.seal?.targetName || "封印守卫"}后才能进入下一层`
        : "下行楼梯：进入下一层",
      stairsUp: "上行楼梯：返回上一层"
    };
    return labels[cell.object.type] || "未知物体";
  }

  // 返回最近选中地图格子的描述文本。
  function selectedTileText() {
    if (!ui.selectedTile || !state?.map) return "";
    const cell = state.map.cells[ui.selectedTile.y]?.[ui.selectedTile.x];
    if (!cell || !cell.seen) return "";
    const isPlayer = cell.x === state.player.x && cell.y === state.player.y;
    return tileLabel(cell, isPlayer);
  }

  // 根据职业选择玩家精灵资源。
  function assetForClass(classId) {
    if (classId === "mage") return ASSETS.mage;
    if (classId === "ranger") return ASSETS.ranger;
    return ASSETS.warrior;
  }

  // 生成地图和面板共用的图片 HTML。
  function imageTag(src, alt) {
    return `<img src="${src}" alt="${alt}" draggable="false">`;
  }

  // 用对象专属 class 包装图片，方便 CSS 统一控制尺寸和动画。
  function sprite(cls, src, alt) {
    return `<span class="sprite ${cls}">${imageTag(src, alt)}</span>`;
  }

  function iconSprite(cls, alt) {
    return `<span class="sprite icon-sprite ${cls}" aria-label="${alt}"></span>`;
  }

  function iconClassForType(type) {
    if (type === "stairsDown") return "stairs-down";
    if (type === "stairsUp") return "stairs-up";
    if (type === "lockedDoor") return "locked-door";
    return type;
  }

  // 选中地图格子；如果格子相邻，则直接尝试移动。
  function clickTile(x, y) {
    ui.selectedTile = { x, y };
    const dx = x - state.player.x;
    const dy = y - state.player.y;
    if (Math.abs(dx) + Math.abs(dy) === 1) move(dx, dy);
    else render();
  }

  // 渲染右侧上下文操作区：战斗、商店、合成台或移动提示。
  function renderContext() {
    const enemy = state.currentEnemy;
    if (enemy) {
      const risk = battleRisk(enemy);
      $("contextTitle").textContent =
        `${enemy.name} ${Math.max(0, Math.round(enemy.hp))}/${enemy.maxHp}`;
      $("contextBody").innerHTML = `
      <div class="item-row"><div>一键战斗评估<small>${risk.label}，胜率估算 ${Math.round(risk.score * 100)}%</small></div><button type="button" onclick="autoBattle()">一键战斗</button></div>
      <button type="button" onclick="attackEnemy('attack')">普通攻击</button>
      ${renderSkillActionButtons()}
      <button type="button" onclick="attackEnemy('defend')">防御</button>
    `;
      return;
    }
    const cell = state.map.cells[state.player.y][state.player.x];
    if (cell.object?.type === "shop") {
      $("contextTitle").textContent = "商人";
      $("contextBody").innerHTML = `
      <div class="tile-info">商人会打开交易弹窗，补给不会挤在右侧面板里。</div>
      <button type="button" onclick="openMerchant()">打开商店</button>
    `;
    } else if (cell.object?.type === "forge") {
      $("contextTitle").textContent = "合成台";
      $("contextBody").innerHTML = `
      <div class="tile-info">合成台用于强化已装备的装备。消耗金币和强化石，不在商人或祭坛处强化。</div>
      <button type="button" onclick="openForge()">打开合成台</button>
    `;
    } else {
      $("contextTitle").textContent = "行动";
      const selected = selectedTileText();
      $("contextBody").innerHTML = `
      ${selected ? `<div class="tile-info">${selected}</div>` : ""}
      <p>点击相邻格或使用方向键移动。探索宝箱、祭坛、商人和传送门。</p>
    `;
    }
  }

  // 渲染当前侧边栏标签页。
  function renderTab() {
    if (ui.activeTab === "inventory") renderInventory();
    if (ui.activeTab === "skills") renderSkills();
    if (ui.activeTab === "quests") $("tabBody").innerHTML = renderQuestList();
  }

  function renderQuestList() {
    const quests = ensureQuestList();
    if (!quests.length) {
      return `<section class="quest-list"><p>暂无任务。和商人或委托人交谈后，可以在这里追踪目标。</p></section>`;
    }
    const rows = quests
      .map((quest) => {
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
        const location = questLocationText(quest);
        const stateText = quest.claimed
          ? "已领取"
          : quest.completed
            ? "可领取"
            : quest.roomCleared
              ? "待救援"
              : "进行中";
        const rewardGold = questRewardGold(def, quest.floor);
        const rewards = [
          def.rewardKeys ? `钥匙 +${def.rewardKeys}` : "",
          rewardGold ? `金币 +${rewardGold}` : "",
          def.rewardPotion ? "药水 +1" : ""
        ]
          .filter(Boolean)
          .join(" · ");
        return `
      <article class="quest-row inventory-card ${quest.completed && !quest.claimed ? "ready" : ""}">
        <div class="item-main">
          <span class="item-kicker">${def.giverName}</span>
          <b>${def.title}</b>
          <small>${def.desc}</small>
          <span class="item-tags"><i>目标${location}</i><i>${quest.kills}/${quest.target}</i>${rewards ? `<i>${rewards}</i>` : ""}</span>
        </div>
        <span class="quest-state">${stateText}</span>
      </article>
    `;
      })
      .join("");
    return `<section class="quest-list">${rows}</section>`;
  }

  // 渲染背包列表和物品操作按钮。
  function renderInventory() {
    $("tabBody").innerHTML = inventoryGroupMarkup();
  }

  function inventoryGroupMarkup() {
    const potions = inventoryConsumableGroups();
    const allEquipment = state.inventory
      .filter((entry) => entry.kind === "equip")
      .sort((a, b) => itemScore(b) - itemScore(a));
    const equipment = equipmentFilterRows(allEquipment);
    const groups = {
      potions: inventoryGroup(
        "potions",
        "药剂",
        potions.length ? potions.map(potionRow).join("") : `<p>暂无药剂。</p>`
      ),
      equipment: inventoryGroup(
        "equipment",
        "装备",
        `${equipmentFilterControl()}${equipment.length ? equipment.map(equipmentInventoryRow).join("") : `<p>暂无符合筛选的装备。</p>`}`
      ),
      materials: inventoryGroup("materials", "材料", materialRows()),
      runes: inventoryGroup("runes", "符文", runeRows())
    };
    return `${inventorySubtabs()}${groups[ui.activeInventoryTab] || groups.equipment}`;
  }

  function equipmentFilterRows(equipment) {
    if (ui.activeEquipmentFilter === "all") return equipment;
    return equipment.filter((entry) => entry.slot === ui.activeEquipmentFilter);
  }

  function equipmentFilterControl() {
    const options = [["all", "全部"], ...SLOTS.map((slot) => [slot, SLOT_NAMES[slot]])];
    return `
    <label class="inventory-filter">
      <span>类型</span>
      <select onchange="selectEquipmentFilter(this.value)">
        ${options.map(([value, label]) => `<option value="${value}" ${ui.activeEquipmentFilter === value ? "selected" : ""}>${label}</option>`).join("")}
      </select>
    </label>
  `;
  }

  function inventorySubtabs() {
    const tabs = [
      ["potions", "药剂"],
      ["equipment", "装备"],
      ["materials", "材料"],
      ["runes", "符文"]
    ];
    return `<div class="inventory-subtabs">${tabs.map(([id, label]) => `<button type="button" data-inventory-tab="${id}" class="${ui.activeInventoryTab === id ? "active" : ""}" onclick="selectInventoryTab('${id}')">${label}</button>`).join("")}</div>`;
  }

  function selectInventoryTab(tab) {
    ui.activeInventoryTab = tab;
    renderInventory();
  }

  function selectEquipmentFilter(filter) {
    ui.activeEquipmentFilter = filter;
    renderInventory();
  }

  function inventoryGroup(type, title, body) {
    return `<section class="inventory-group inventory-group-${type}"><h3>${title}</h3>${body}</section>`;
  }

  function inventoryConsumableGroups() {
    const groups = new Map();
    for (const entry of state.inventory || []) {
      if (!["potion", "teleport"].includes(entry.kind)) continue;
      const key =
        entry.kind === "potion"
          ? `${entry.kind}|${entry.name}|${entry.effect}|${entry.amount}`
          : `${entry.kind}|${entry.name}`;
      const group = groups.get(key) || { ...entry, count: 0 };
      group.count += 1;
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => itemScore(b) - itemScore(a));
  }

  function potionRow(entry) {
    const count = entry.count || 1;
    if (entry.kind === "teleport") {
      return `<div class="item-row consumable-row inventory-card"><div class="item-main"><span class="item-kicker">传送</span><b>${entry.name}</b><small>传送到已探索楼层的商人、委托人或合成台附近</small></div><div class="item-side"><span class="item-quantity">x${count}</span><div class="item-actions"><button type="button" onclick="confirmUseItem('${entry.id}')">使用</button></div></div></div>`;
    }
    return `<div class="item-row consumable-row inventory-card"><div class="item-main"><span class="item-kicker">${entry.effect === "hp" ? "生命药剂" : "法力药剂"}</span><b>${entry.name}</b><span class="item-tags"><i>恢复 ${entry.amount} ${entry.effect === "hp" ? "生命" : "法力"}</i><i>评分 ${itemScore(entry)}</i></span></div><div class="item-side"><span class="item-quantity">x${count}</span><div class="item-actions"><button type="button" onclick="confirmUseItem('${entry.id}')">使用</button></div></div></div>`;
  }

  function equipmentInventoryRow(entry) {
    const better = isBetterThanEquipped(entry);
    const hasCurrent = !!state.equipment?.[entry.slot];
    const compare = hasCurrent ? equipmentScoreBadge(entry, "inline-equipment-compare") : "";
    const sellDisabled = canSellEquipmentHere() ? "" : `disabled title="需要在商人身边售出"`;
    return `<div class="item-row equip-row equipment-card inventory-card ${better ? "better-equipment" : ""}">
    <div class="item-main"><span class="item-kicker">${SLOT_NAMES[entry.slot]} · ${entry.quality}</span><b>${entry.name}</b>${equipmentSummary(entry)}</div>
    <div class="item-side">
      ${compare ? `<div class="equipment-compare-corner">${compare}</div>` : ""}
      <div class="equipment-actions inventory-equipment-actions">
        <button type="button" onclick="showInventoryEquipmentDetail('${entry.id}')">详情</button>
        <button type="button" onclick="confirmEquipItem('${entry.id}')">装备</button>
        <button type="button" ${sellDisabled} onclick="confirmSellEquipment('${entry.id}')">售出</button>
      </div>
    </div>
  </div>`;
  }

  function showInventoryEquipmentCompare(id) {
    const entry = state.inventory.find((item) => item.id === id);
    if (!entry || entry.kind !== "equip") return;
    const current = state.equipment?.[entry.slot];
    if (!current) {
      showInventoryEquipmentDetail(id);
      return;
    }
    showModal(
      `${entry.name} 对比`,
      `
    <div class="equipment-detail">
      <div class="detail-row"><b>候选装备</b><span>${entry.name} · 评分 ${itemScore(entry)}</span></div>
      <div class="detail-row"><b>当前装备</b><span>${current.name} · 评分 ${itemScore(current)}</span></div>
      <div class="detail-row"><b>差值</b><span>${equipmentCompareText(entry)}</span></div>
    </div>
  `,
      [
        { text: "关闭", action: closeModal },
        {
          text: "装备",
          action: () => {
            closeModal();
            equipItem(id);
          }
        }
      ]
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
    const actions = [
      { text: "关闭", action: closeModal },
      {
        text: "装备",
        action: () => {
          closeModal();
          equipItem(id);
        }
      }
    ];
    if (canSellEquipmentHere())
      actions.splice(2, 0, {
        text: "售出",
        action: () => {
          closeModal();
          sellEquipment(id);
        }
      });
    showModal(
      entry.name,
      equipmentDetailMarkup(entry, SLOT_NAMES[entry.slot], runeText, compare),
      actions
    );
  }

  function materialRows() {
    const materials = Object.entries(state.materials || {}).filter(([, count]) => count > 0);
    if ((state.keys || 0) > 0) materials.unshift(["符文钥匙", state.keys]);
    if ((state.universalKeys || 0) > 0) materials.unshift(["万能钥匙", state.universalKeys]);
    for (const [keyId, count] of Object.entries(state.doorKeys || {})) {
      if (count > 0) materials.unshift([state.doorKeyNames?.[keyId] || "房门钥匙", count]);
    }
    return materials.length
      ? materials
          .map(
            ([name, count]) =>
              `<div class="item-row inventory-card"><div class="item-main"><span class="item-kicker">材料</span><b>${name}</b></div><div class="item-side"><span class="item-quantity">x${count}</span></div></div>`
          )
          .join("")
      : `<p>暂无材料。</p>`;
  }

  function runeRows() {
    const runes = Object.entries(state.runes || {}).filter(([, count]) => count > 0);
    return runes.length
      ? runes
          .map(
            ([name, count]) =>
              `<div class="item-row rune-row inventory-card"><div class="item-main"><span class="item-kicker">符文</span><b>${name}符文</b><small>${runeEffectText(name)}。需要镶嵌到带符文槽的装备上才生效。</small><span class="item-tags"><i>3 合 1 升级</i></span></div><div class="item-side"><span class="item-quantity">x${count}</span><div class="item-actions"><button type="button" ${count >= 3 ? "" : "disabled"} onclick="confirmCraftRune('${name}')">合成</button></div></div></div>`
          )
          .join("")
      : `<p>暂无符文。</p>`;
  }

  // 渲染已装备物品和强化控制。
  function renderEquipment() {
    $("tabBody").innerHTML = SLOTS.map((slot) => {
      const eq = state.equipment[slot];
      const disabledReason = enhanceDisabledReason(slot);
      const actions = eq
        ? `<button type="button" ${disabledReason ? "disabled" : ""} title="${disabledReason || "强化"}" onclick="confirmEnhance('${slot}')">强化</button><button type="button" onclick="confirmUnequip('${slot}')">拆下</button>`
        : `<button type="button" disabled>空位</button>`;
      return `<div class="item-row equipment-card equipped-row inventory-card"><div class="item-main"><span class="item-kicker">${SLOT_NAMES[slot]}${eq ? equippedStateBadge() : ""}</span>${eq ? `<b class="equipment-name">${eq.name}</b>${equipmentSummary(eq, disabledReason ? "不可强化" : "")}` : `<b>空位</b><small>未装备</small>`}</div><div class="item-side equipment-actions">${actions}</div></div>`;
    }).join("");
  }

  // 渲染材料、符文库存和符文合成控制。
  function renderCraft() {
    const runes = Object.entries(state.runes).filter(([, count]) => count > 0);
    $("tabBody").innerHTML = `
    <div class="item-row"><div>材料<small>强化石 ${state.materials["强化石"] || 0}，魔尘 ${state.materials["魔尘"] || 0}</small></div></div>
    ${runes.length ? runes.map(([name, count]) => `<div class="item-row"><div>${name}符文<small>3 合 1 升级</small></div><button type="button" ${count >= 3 ? "" : "disabled"} onclick="confirmCraftRune('${name}')">合成</button><span class="item-quantity">x${count}</span></div>`).join("") : "<p>暂无符文。</p>"}
  `;
  }

  // 渲染职业技能列表和技能升级按钮。
  function renderSkills() {
    const skills = CLASSES[state.classId].skills;
    $("tabBody").innerHTML = `
    <div class="item-row"><div>技能资源<small>技能点 ${state.skillPoints || 0}，技能尘 ${state.skillDust || 0}</small></div></div>
    ${skills
      .map((skill) => {
        const upgraded = upgradedSkill(skill);
        const cost = skillUpgradeCost(skill.id);
        const disabled = canUpgradeSkill(skill.id) ? "" : "disabled";
        return `<div class="item-row skill-row inventory-card"><div class="item-main"><span class="item-kicker">职业技能</span><b>${skill.name} Lv.${upgraded.level}</b><small>${skill.desc}</small><span class="item-tags"><i>${skillPreviewText(upgraded)}</i><i>${upgraded.mp} MP</i><i>升级 ${cost.points} 点 / ${cost.dust} 尘</i></span></div><div class="item-actions"><button type="button" ${disabled} onclick="confirmUpgradeSkill('${skill.id}')">升级</button></div></div>`;
      })
      .join("")}
  `;
  }

  // 格式化装备属性摘要。
  function statsText(eq) {
    return Object.entries(eq.stats)
      .map(([key, value]) => {
        const enhance = eq.level ? `(+${eq.level})` : "";
        return `${STAT_NAMES[key] || key}+${value}${enhance}`;
      })
      .join(" ");
  }

  // 生成装备列表中复用的评分、部位、品质和属性摘要。
  function equipmentSummary(eq, stateLabel = "") {
    return `
    <span class="equipment-meta">
      <span>评分 ${itemScore(eq)}</span>
      <span>${SLOT_NAMES[eq.slot]}</span>
      <span class="quality-${eq.quality}">${eq.quality}</span>
      <span>强化 +${eq.level}</span>
      ${stateLabel ? `<span class="state-muted">${stateLabel}</span>` : ""}
    </span>
    <small class="equipment-stats">${statsText(eq) || "无属性"}</small>
  `;
  }

  function equippedStateBadge() {
    return `<span class="equipped-badge">已装备</span>`;
  }

  // 生成候选装备与当前装备的详细对比文本。
  function equipmentCompareText(item, extraClass = "") {
    if (!item || item.kind !== "equip") return "";
    const current = state.equipment[item.slot];
    const scoreDelta = itemScore(item) - itemScore(current);
    const direction = scoreDelta >= 0 ? "up" : "down";
    const arrow = scoreDelta >= 0 ? "↑" : "↓";
    const statKeys = Array.from(
      new Set([...Object.keys(current?.stats || {}), ...Object.keys(item.stats || {})])
    );
    const statDeltas = statKeys
      .map((key) => {
        const delta = effectiveItemStat(item, key) - effectiveItemStat(current, key);
        if (!delta) return "";
        const sign = delta > 0 ? "+" : "";
        return `<span class="${delta > 0 ? "compare-up" : "compare-down"}">${STAT_NAMES[key] || key}差 ${sign}${delta}</span>`;
      })
      .filter(Boolean);
    const scoreClass = scoreDelta >= 0 ? "compare-up" : "compare-down";
    const scoreSign = scoreDelta > 0 ? "+" : "";
    return `
    <small class="equipment-compare ${extraClass}">
      ${equipmentScoreBadgeMarkup(direction, arrow, scoreSign, scoreDelta)}
      <span class="compare-title">装备对比</span>
      <span class="${scoreClass}">评分差 ${scoreSign}${scoreDelta}</span>
      ${statDeltas.join("")}
    </small>
  `;
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
    return `
    <span class="compare-badge compare-badge-${direction}" aria-label="${scoreDelta >= 0 ? "更好" : "更坏"}">
      <span class="compare-arrow">${arrow}</span>
      <span>${scoreSign}${scoreDelta}</span>
    </span>
  `;
  }

  function effectiveItemStat(item, key) {
    if (!item) return 0;
    return (item.stats?.[key] || 0) + (item.stats?.[key] ? item.level || 0 : 0);
  }

  function enhanceText(eq) {
    return Object.keys(eq.stats)
      .map((key) => `${STAT_NAMES[key] || key}+${eq.level}`)
      .join(" ");
  }

  function equipmentDetailMarkup(eq, slotName, runeText, extraRows = "") {
    return `
    <div class="equipment-detail">
      <div class="equipment-meta">
        <span>评分 ${itemScore(eq)}</span>
        <span>${slotName}</span>
        <span class="quality-${eq.quality}">${eq.quality}</span>
        <span>强化 +${eq.level}</span>
      </div>
      <div class="detail-row"><b>属性</b><span>${statsText(eq) || "无属性"}</span></div>
      ${eq.level ? `<div class="detail-row"><b>强化提升</b><span>${enhanceText(eq)}</span></div>` : ""}
      <div class="detail-row"><b>符文槽</b><span>${runeText}</span></div>
      ${extraRows}
    </div>
  `;
  }

  // 根据属性权重、品质、符文槽和强化等级估算物品评分。
  function itemScore(item) {
    if (!item) return 0;
    if (item.kind === "potion") return item.amount || 0;
    if (item.kind === "teleport") return 35;
    if (item.kind !== "equip") return 0;
    const weights = { atk: 11, mag: 11, def: 9, res: 8, spd: 8, luk: 7, hp: 1.2, mp: 1.1 };
    const statScore = Object.entries(item.stats).reduce((sum, [key, value]) => {
      return sum + (weights[key] || 5) * (value + item.level);
    }, 0);
    const qualityScore = { 普通: 0, 优秀: 8, 稀有: 18, 史诗: 32, 传说: 50 }[item.quality] || 0;
    const slotScore = (item.runeSlots || 0) * 6 + (item.runes?.length || 0) * 4;
    return Math.round(statScore + qualityScore + slotScore);
  }

  function isBetterThanEquipped(item) {
    if (item.kind !== "equip") return false;
    return itemScore(item) > itemScore(state.equipment[item.slot]);
  }

  // 渲染最新的冒险日志。
  function renderLog() {
    $("log").innerHTML = state.log.map((entry) => `<div>${entry}</div>`).join("");
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
    inventoryConsumableGroups: withState(inventoryConsumableGroups),
    inventoryGroup,
    inventoryGroupMarkup: withState(inventoryGroupMarkup),
    inventorySubtabs: withState(inventorySubtabs),
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
    shouldShowMapObject: withState(shouldShowMapObject),
    showEquipmentSlot: withState(showEquipmentSlot),
    showInventoryEquipmentCompare: withState(showInventoryEquipmentCompare),
    showInventoryEquipmentDetail: withState(showInventoryEquipmentDetail),
    sprite,
    startNewGame: withState(startNewGame),
    statsText,
    tileLabel: withState(tileLabel)
  };
}
