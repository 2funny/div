import { RUNES, VISION_RADIUS } from "../constants";
import { cellsWithin, distance } from "../floor/mapGeometry";
import { choice, rand, random } from "../random";
import { clearBattleFx } from "../combat/combatFx";
import { roomEventById, roomEventMetaText } from "../events/roomEvents";
import { discoverLorePage } from "../quest/lore";
import { adjustRelation, markNarrativeFlag, recordEventChoice, relationLabel } from "../quest/narrative";
import { advanceTutorial } from "../tutorial/tutorial";

// 交互运行时负责玩家移动、视野刷新和地图物件触发，不直接生成 UI 标记。
export function createInteractionRuntime(ctx) {
  const { api, battle, ui } = ctx;
  let state = ctx.getState();
  const syncState = () => {
    state = ctx.getState();
    return state;
  };

  const closeModal = (...args) => api.closeModal(...args);
  const currentStairsDown = (...args) => api.currentStairsDown(...args);
  const enemyTurn = (...args) => api.enemyTurn(...args);
  const getAudioEnabled = (...args) => api.getAudioEnabled(...args);
  const initAudio = (...args) => api.initAudio(...args);
  const isBlockingInteraction = (...args) => api.isBlockingInteraction(...args);
  const log = (...args) => api.log(...args);
  const nextFloor = (...args) => api.nextFloor(...args);
  const openForge = (...args) => api.openForge(...args);
  const openMerchant = (...args) => api.openMerchant(...args);
  const openQuestNpc = (...args) => api.openQuestNpc(...args);
  const openRescueNpc = (...args) => api.openRescueNpc(...args);
  const placeGuardNear = (...args) => api.placeGuardNear(...args);
  const playSound = (...args) => api.playSound(...args);
  const previousFloor = (...args) => api.previousFloor(...args);
  const randomEquipment = (...args) => api.randomEquipment(...args);
  const render = (...args) => api.render(...args);
  const showEvent = (...args) => api.showEvent(...args);
  const showModal = (...args) => api.showModal(...args);
  const syncMusicToGame = (...args) => api.syncMusicToGame(...args);
  const totals = (...args) => api.totals(...args);
  const useAltar = (...args) => api.useAltar(...args);

  // 以玩家为中心刷新可见格，同时把见过的格子永久标记为已探索。
  function updateVisibility() {
    for (const row of state.map.cells) {
      for (const cell of row) {
        const dx = Math.abs(cell.x - state.player.x);
        const dy = Math.abs(cell.y - state.player.y);
        cell.visible = Math.max(dx, dy) <= VISION_RADIUS;
        if (cell.visible) cell.seen = true;
      }
    }
  }

  // 让玩家移动一格，并处理目标格子的地形、怪物和交互物。
  function move(dx, dy) {
    if (getAudioEnabled()) initAudio();
    if (state.currentEnemy) {
      if (isDefeatedEnemy(state.currentEnemy)) state.currentEnemy = null;
      else return;
    }
    if (dx < 0) state.facing = "left";
    else if (dx > 0) state.facing = "right";
    else if (!["left", "right"].includes(state.facing)) {
      if (dy < 0) state.facing = "up";
      if (dy > 0) state.facing = "down";
    }
    const nx = state.player.x + dx;
    const ny = state.player.y + dy;
    const cell = state.map.cells[ny]?.[nx];
    if (!cell || ["wall", "fence", "lava"].includes(cell.terrain)) {
      render();
      return;
    }
    if (isDefeatedEnemy(cell.object)) cell.object = null;
    if (isDangerousEnemy(cell.object)) {
      ui.selectedTile = null;
      promptDangerousEnemy(cell.object, { x: nx, y: ny });
      render();
      return;
    }
    if (isBlockingInteraction(cell.object)) {
      ui.selectedTile = null;
      resolveCell(cell);
      render();
      return;
    }
    state.player = { x: nx, y: ny };
    playSound("step");
    ui.selectedTile = null;
    updateVisibility();
    advanceTutorial(state, "move");
    resolveCell(cell);
    render();
  }

  // 触发玩家所在格子的物件逻辑。
  function resolveCell(cell) {
    if (!cell.object) return;
    const obj = cell.object;
    if (["monster", "elite", "boss"].includes(obj.type)) {
      if (isDefeatedEnemy(obj)) {
        cell.object = null;
        return;
      }
      handleEnemyEncounter(obj, cell);
      return;
    }
    if (obj.type === "chest") {
      openChest(cell);
    } else if (obj.type === "lockedChest") {
      openLockedChest(cell);
    } else if (obj.type === "trap") {
      triggerTrap(cell);
    } else if (obj.type === "altar") {
      useAltar(cell);
    } else if (obj.type === "roomEvent") {
      openRoomEvent(cell);
    } else if (obj.type === "shop") {
      openMerchant();
    } else if (obj.type === "forge") {
      openForge();
    } else if (obj.type === "questNpc") {
      openQuestNpc(obj);
    } else if (obj.type === "rescueNpc") {
      openRescueNpc(obj);
    } else if (obj.type === "lockedDoor") {
      openLockedDoor(cell);
    } else if (obj.type === "fenceGate") {
      openFenceGate(cell);
    } else if (obj.type === "stairsDown" || obj.type === "portal") {
      nextFloor();
    } else if (obj.type === "stairsUp") {
      previousFloor();
    }
  }

  // 处理踩到敌人后的进入战斗或危险确认流程。
  function handleEnemyEncounter(enemy, sourceCell = null) {
    if (isDefeatedEnemy(enemy)) return;
    log(`遭遇${enemy.name}。`);
    if (!isDangerousEnemy(enemy)) {
      enterBattle(enemy, sourceCell);
      return;
    }
    promptDangerousEnemy(enemy, null, sourceCell);
  }

  // 只有首领、钥匙守卫、房间首领这类特殊敌人才需要确认，普通怪和普通精英直接开战。
  function isDangerousEnemy(obj) {
    if (!obj) return false;
    if (isDefeatedEnemy(obj)) return false;
    if (obj.type === "boss") return true;
    return !!(obj.roomBoss || obj.dropsKey || obj.rare);
  }

  function isDefeatedEnemy(obj) {
    return !!obj && ["monster", "elite", "boss"].includes(obj.type) && Number(obj.hp) <= 0;
  }

  // 对危险敌人展示确认弹窗，避免玩家误触进入高风险战斗。
  function promptDangerousEnemy(enemy, destination = null, sourceCell = null) {
    const title = enemy.type === "boss" ? "危险首领" : "危险精英";
    showModal(
      title,
      `<p>${enemy.name}散发出危险气息。</p><p>确认进入战斗后将无法移动，建议先检查生命、法力和药水。</p>`,
      [
        { text: "暂不交战", action: closeModal },
        {
          text: "进入战斗",
          action: () => {
            closeModal();
            if (destination) {
              state.player = destination;
              updateVisibility();
            }
            enterBattle(enemy, sourceCell);
          }
        }
      ]
    );
  }

  // 将敌人设置为当前战斗目标，并切换到战斗视图。
  function enterBattle(enemy, sourceCell = null) {
    if (isDefeatedEnemy(enemy)) {
      state.currentEnemy = null;
      delete state._battleCell;
      setBattlePhase("idle");
      render();
      return;
    }
    state.currentEnemy = enemy;
    if (sourceCell?.x != null && sourceCell?.y != null) {
      state._battleCell = { x: sourceCell.x, y: sourceCell.y };
    } else {
      delete state._battleCell;
    }
    syncMusicToGame();
    clearBattleFx();
    state._guard = 0;
    state._evade = false;
    state.skillCooldowns = {};
    battle.inputLockedUntil = Date.now() + 350;
    const playerSpeed = totals().spd || 0;
    const enemySpeed = Number(enemy.spd || 0);
    if (enemySpeed > playerSpeed) {
      setBattlePhase("enemy-turn", `${enemy.name}抢先行动`, "enemy");
      enemyTurn(enemy);
      if (state.currentEnemy && state.hp > 0) setBattlePhase("player-turn", "你的回合", "hero");
    } else {
      setBattlePhase("player-turn", "你的回合", "hero");
    }
    const activeElement = document.activeElement as (Element & { blur?: () => void }) | null;
    activeElement?.blur?.();
    playSound("encounter");
    render();
  }

  function setBattlePhase(phase, message = "", actor = "") {
    battle.phase = phase;
    battle.message = message;
    battle.actor = actor;
  }

  // 触发陷阱伤害，并可能惊动附近守卫进入战斗。
  function triggerTrap(cell) {
    playSound("danger");
    const damage = rand(3, 6) + Math.ceil(state.floor * 0.8);
    const alerted = placeGuardNear(state.map.cells, cell.x, cell.y, state.floor >= 4);
    state.hp = Math.max(1, state.hp - damage);
    cell.object = null;
    const guard = alerted ? nearestGuardForTrap(state.map.cells, cell.x, cell.y) : null;
    if (guard) enterBattle(guard.object, guard);
    log(`触发隐藏机关，受到 ${damage} 点伤害${alerted ? "，并惊动了守卫" : ""}。`);
    showEvent(
      "触发机关",
      `<p>地面机关突然弹起，你受到 ${damage} 点伤害。</p>${alerted ? "<p>机关的响动惊动了附近守卫。</p>" : ""}`,
      "继续探索"
    );
  }

  // 查找陷阱附近最近的守卫，用于机关警报后的追击。
  function nearestGuardForTrap(map, x, y) {
    return (
      cellsWithin(map, x, y, 2)
        .filter((nearby) => ["monster", "elite"].includes(nearby.object?.type))
        .sort((a, b) => distance(a, { x, y }) - distance(b, { x, y }))[0] || null
    );
  }

  // 结算普通宝箱奖励：装备、符文或材料金币。
  function openChest(cell) {
    playSound("chest");
    const roll = random();
    let message = "";
    const reward = floorEffectReward();
    if (roll < 0.42) {
      const loot = randomEquipment();
      state.inventory.push(loot);
      log(`打开宝箱，获得${loot.name}。`);
      message = `获得装备：${loot.name}`;
    } else if (roll < 0.72) {
      const rune = choice(RUNES) + "1";
      state.runes[rune] = (state.runes[rune] || 0) + 1;
      log(`打开宝箱，获得${rune}符文。`);
      message = `获得符文：${rune}`;
    } else {
      state.materials["强化石"] = (state.materials["强化石"] || 0) + 1;
      const gold = scaledReward(rand(15, 40));
      state.gold += gold;
      log("打开宝箱，获得金币和强化石。");
      message = `获得金币 +${gold} 和强化石`;
    }
    if (reward > 1 && random() < 0.18) {
      state.materials["强化石"] = (state.materials["强化石"] || 0) + 1;
      message += "<br>特殊楼层奖励：强化石 +1";
    }
    if (random() < universalKeyChance()) {
      state.universalKeys = (state.universalKeys || 0) + 1;
      message += "<br>额外发现：万能钥匙 +1";
      log("宝箱夹层里藏着一把万能钥匙。");
    }
    const lore = discoverChestLore("chest");
    if (lore) message += `<br>发现残页：${lore.title}`;
    cell.object = null;
    advanceTutorial(state, "loot");
    showEvent("打开宝箱", `<p>${message}</p>`, "收下");
  }

  function openLockedChest(cell) {
    state.keys = state.keys || 0;
    if (state.keys <= 0) {
      log("发现上锁宝箱，需要符文钥匙。");
      showEvent("上锁宝箱", "<p>锁孔里有符文光纹，需要先击败钥匙守卫取得符文钥匙。</p>", "知道了");
      return;
    }
    state.keys--;
    playSound("chest");
    const loot = randomEquipment();
    const rune = choice(RUNES) + "1";
    const gold = scaledReward(rand(8, 18));
    state.inventory.push(loot);
    state.runes[rune] = (state.runes[rune] || 0) + 1;
    state.gold += gold;
    const lore = discoverChestLore("lockedChest");
    cell.object = null;
    advanceTutorial(state, "loot");
    log(`打开上锁宝箱，获得${loot.name}、${rune}符文和 ${gold} 金币。`);
    showEvent(
      "打开上锁宝箱",
      `<p>消耗 1 把符文钥匙。</p><p>获得装备：${loot.name}<br>获得符文：${rune}<br>金币 +${gold}${lore ? `<br>发现残页：${lore.title}` : ""}</p>`,
      "收下"
    );
  }

  function discoverChestLore(source) {
    const page = discoverLorePage(state, source);
    if (page) log(`发现地牢残页：${page.title}。`);
    return page;
  }

  function openLockedDoor(cell) {
    const lock = cell.object;
    if (!lock || lock.type !== "lockedDoor") return;
    state.doorKeys = state.doorKeys || {};
    state.doorKeyNames = state.doorKeyNames || {};
    state.universalKeys = state.universalKeys || 0;
    const keyId = lock.keyId;
    const hasSpecificKey = keyId && (state.doorKeys[keyId] || 0) > 0;
    const hasUniversalKey = state.universalKeys > 0;
    if (!hasSpecificKey && !hasUniversalKey) {
      log(`发现${lock.roomName || "上锁房门"}，需要${lock.keyName || "指定钥匙"}或万能钥匙。`);
      showEvent(
        "上锁房门",
        `<p>${lock.roomName || "这道门"}被符文锁扣住了。</p><p>完成钥匙保管人的委托可获得${lock.keyName || "指定钥匙"}；运气好的商人或宝箱也可能提供万能钥匙。</p>`,
        "知道了"
      );
      return;
    }
    let used = lock.keyName || "房门钥匙";
    if (hasSpecificKey) {
      state.doorKeys[keyId]--;
      if (state.doorKeys[keyId] <= 0) delete state.doorKeys[keyId];
    } else {
      state.universalKeys--;
      used = "万能钥匙";
    }
    cell.object = null;
    playSound("chest");
    log(`使用${used}打开了${lock.roomName || "上锁房门"}。`);
    showEvent("房门已开", `<p>你使用${used}解开了门上的符文锁。</p>`, "进入房间");
  }

  function floorEffectReward() {
    return state?.map?.effect?.reward || 1;
  }

  function scaledReward(value) {
    return Math.max(1, Math.round(value * floorEffectReward()));
  }

  function universalKeyChance() {
    return Math.min(0.18, 0.08 + state.floor * 0.004);
  }

  function openRoomEvent(cell) {
    const event = roomEventById(String(cell.object?.eventId || ""));
    if (!event) {
      cell.object = null;
      render();
      return;
    }
    const context = {
      state,
      randomEquipment,
      randomRune: () => `${choice(RUNES)}1`,
      scaledReward
    };
    const choices = event.choices.filter((entry) => !entry.canChoose || entry.canChoose(context));
    const body = `
      <div class="quest-panel">
        <b>${event.title}</b>
        <div class="event-tags"><span>${roomEventMetaText(event)}</span><span>最早 ${event.minFloor} 层</span></div>
        <p>${event.summary}</p>
        <small class="event-choice-summary">${choices.map((entry) => `${entry.text}：${entry.desc}`).join("<br>")}</small>
      </div>
    `;
    showModal(event.title, body, [
      ...choices.map((entry) => ({
        text: entry.text,
        action: () => {
          const result = entry.apply(context);
          const consequence = applyRoomEventConsequence(event.id, entry);
          cell.object = null;
          log(`${result.log}${consequence ? ` ${consequence}` : ""}`);
          playSound("quest");
          render();
          showEvent(event.title, `${result.body}${consequence ? `<p>${consequence}</p>` : ""}`, "继续探索");
        }
      })),
      { text: "暂不处理", action: closeModal }
    ]);
  }

  function applyRoomEventConsequence(eventId, choice) {
    recordEventChoice(state, eventId, choice.id);
    if (choice.flag) markNarrativeFlag(state, choice.flag);
    if (!choice.relation) return "";
    const score = adjustRelation(state, choice.relation.id, choice.relation.delta);
    const sign = choice.relation.delta > 0 ? "+" : "";
    return `${relationLabel(state, choice.relation.id)}（${sign}${choice.relation.delta}，当前 ${score}）。`;
  }

  // 使用符文钥匙打开围住宝箱的门栅。
  function openFenceGate(cell) {
    state.keys = state.keys || 0;
    if (state.keys <= 0) {
      log("门栅被符文锁住了，附近守卫或委托人可能知道钥匙线索。");
      showEvent(
        "符文门栅",
        "<p>铁栅栏围住了宝箱，锁孔里有符文光。先击败钥匙守卫，或向中立委托人完成请求来获得钥匙。</p>",
        "知道了"
      );
      return;
    }
    cell.object = null;
    cell.terrain = "floor";
    log("符文钥匙照亮门栅，通往宝箱的入口打开了。");
    showEvent(
      "门栅打开",
      "<p>钥匙的光没有被消耗，真正的锁还在宝箱上。现在可以进入围栏内开箱。</p>",
      "继续探索"
    );
  }

  // 打开当前位置的委托人交互。
  const withState =
    (fn) =>
    (...args) => {
      syncState();
      return fn(...args);
    };

  return {
    enterBattle: withState(enterBattle),
    handleEnemyEncounter: withState(handleEnemyEncounter),
    isDangerousEnemy: withState(isDangerousEnemy),
    isDefeatedEnemy,
    move: withState(move),
    nearestGuardForTrap,
    openChest: withState(openChest),
    openFenceGate: withState(openFenceGate),
    openLockedDoor: withState(openLockedDoor),
    openLockedChest: withState(openLockedChest),
    promptDangerousEnemy: withState(promptDangerousEnemy),
    resolveCell: withState(resolveCell),
    triggerTrap: withState(triggerTrap),
    updateVisibility: withState(updateVisibility)
  };
}
