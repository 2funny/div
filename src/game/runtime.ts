// @ts-nocheck
import {
  ASSETS,
  CLASSES,
  LEGEND_ITEMS,
  FLOOR_EFFECTS,
  MAP_SIZE,
  MAP_VIEW_SIZE,
  DEFAULT_CLASS_ID,
  MAX_FLOOR,
  RUNES,
  SAVE_KEY,
  SLOT_NAMES,
  SLOTS,
  STAT_NAMES,
  THEMES,
  VISION_RADIUS
} from "./data";
import { ENEMY_AFFIXES } from "./enemies";
import { ELEMENT_IDS, elementName } from "./elements";
import { WEAPON_TYPES, randomWeaponTypeForClass, weaponPrimaryStat, weaponTypeName } from "./equipmentRules";
import { QUEST_DEFS } from "./quests";
import { choice, rand, uid } from "./random";
import {
  SAVE_SLOT_LIMIT,
  saveSlotKey,
  saveSlotLabel,
  formatSaveTime,
  readSaveIndex,
  writeSaveIndex
} from "./save";
import { clearBattleFx, getBattleFx, resetBattleFx, setBattleFx } from "./combatFx";
import {
  discoverLorePage,
  ensureLoreState,
  unlockLoreChaptersForFloor
} from "./lore";
import {
  emptyEquipment,
  item,
  potion,
  starterEquipment,
  starterInventory,
  teleportBeacon
} from "./inventory";
import { cardinalNeighbors, cellsWithin, distance, floorNeighborCount, validRoomDoor } from "./map";
import { requiredById } from "../ui/dom";
import { createAudioRuntime } from "./audioRuntime";
import { createModalRuntime } from "./modalRuntime";
import { createFloorRuntime } from "./floorRuntime";
import { createRenderRuntime } from "./renderRuntime";
import { createCombatRuntime } from "./combatRuntime";
import { createInventoryRuntime } from "./inventoryRuntime";
import { createSaveRuntime } from "./saveRuntime";
import { createQuestRuntime } from "./questRuntime";
import { createInteractionRuntime } from "./interactionRuntime";
import type { GameState } from "./types";

let state: GameState | null = null;
let activeTab = "inventory";
let activeInventoryTab = "equipment";
let activeEquipmentFilter = "all";
let selectedTile = null;
let statDraft = null;
let battleInputLockedUntil = 0;
let currentSaveSlot = localStorage.getItem(`${SAVE_KEY}-current`) || "slot-1";
let pendingSaveSlot = currentSaveSlot;

const $ = requiredById;

// 主运行时持有跨模块共享状态，并把可变 UI 状态包装成 getter/setter 传给子运行时。
const battleState = {
  get inputLockedUntil() {
    return battleInputLockedUntil;
  },
  set inputLockedUntil(value) {
    battleInputLockedUntil = value;
  }
};

const uiState = {
  get activeTab() {
    return activeTab;
  },
  set activeTab(value) {
    activeTab = value;
  },
  get activeInventoryTab() {
    return activeInventoryTab;
  },
  set activeInventoryTab(value) {
    activeInventoryTab = value;
  },
  get activeEquipmentFilter() {
    return activeEquipmentFilter;
  },
  set activeEquipmentFilter(value) {
    activeEquipmentFilter = value;
  },
  get selectedTile() {
    return selectedTile;
  },
  set selectedTile(value) {
    selectedTile = value;
  },
  get currentSaveSlot() {
    return currentSaveSlot;
  },
  set currentSaveSlot(value) {
    currentSaveSlot = value;
  },
  get pendingSaveSlot() {
    return pendingSaveSlot;
  },
  set pendingSaveSlot(value) {
    pendingSaveSlot = value;
  },
  get current() {
    return currentSaveSlot;
  },
  set current(value) {
    currentSaveSlot = value;
  },
  get pending() {
    return pendingSaveSlot;
  },
  set pending(value) {
    pendingSaveSlot = value;
  }
};

// 各领域运行时通过 api 回调协作，避免直接互相 import 造成环形依赖扩大。
const audioRuntime = createAudioRuntime({
  $,
  getState: () => state,
  isDefeatedEnemy: (...args) => isDefeatedEnemy(...args)
});
const { initAudio, playSound, syncMusicToGame, toggleAudio, updateSoundButton } = audioRuntime;

const { closeModal, modalAction, showConfirm, showEvent, showModal, showToast } =
  createModalRuntime({
    $,
    initAudio,
    resetStatDraft: () => {
      statDraft = null;
    }
  });

// 初始化 Web Audio 上下文，并在浏览器允许播放后启动地牢氛围声。
function startGame(classId, slotId = pendingSaveSlot || currentSaveSlot || "slot-1") {
  currentSaveSlot = slotId;
  pendingSaveSlot = slotId;
  localStorage.setItem(`${SAVE_KEY}-current`, currentSaveSlot);
  const cls = CLASSES[classId];
  state = {
    classId,
    floor: 1,
    level: 1,
    xp: 0,
    xpNext: 16,
    gold: 12,
    hp: cls.hp,
    maxHp: cls.hp,
    mp: cls.mp,
    maxMp: cls.mp,
    stats: { ...cls.stats },
    statPoints: 0,
    skillPoints: 0,
    skillDust: 0,
    keys: 0,
    universalKeys: 0,
    doorKeys: {},
    doorKeyNames: {},
    quest: null,
    quests: [],
    lore: { chapters: [], pages: [] },
    skillLevels: Object.fromEntries(cls.skills.map((skill) => [skill.id, 0])),
    skillBranches: {},
    inventory: [
      potion("小型生命药水", "hp", 18),
      potion("小型法力药水", "mp", 12),
      ...starterInventory(classId)
    ],
    materials: { 强化石: 1, 魔尘: 0 },
    runes: { 火焰1: 1, 守护1: 1 },
    equipment: emptyEquipment(),
    floorStates: {},
    map: null,
    player: { x: 1, y: 1 },
    facing: "down",
    currentEnemy: null,
    log: []
  };
  state.hp = effectiveMaxHp();
  state.mp = effectiveMaxMp();
  generateFloor();
  announceLoreUnlocks(unlockLoreChaptersForFloor(state));
  log(`你作为${cls.name}踏入了符文地牢。`);
  saveGame(false);
  render();
}

// 楼层、房间和怪物生成逻辑拆在独立模块，主 runtime 保留交互编排。
const floorRuntime = createFloorRuntime({
  getState: () => state,
  updateVisibility: (...args) => updateVisibility(...args),
  ensureQuestList: (...args) => ensureQuestList(...args)
});
const {
  enemyAffixText,
  generateFloor,
  makeEnemy,
  makeEnemyWithVariant,
  placeGuardNear,
  placeTreasureEncounters,
  roomName,
  roomThreat,
  floorEffectReward,
  themeForFloor
} = floorRuntime;
// 任务、交互、战斗等模块存在互相调用，先创建 api 容器，底部再统一注入 runtimeApi。
const questApi = {};
const questRuntime = createQuestRuntime({
  api: questApi,
  getState: () => state
});
const {
  acceptQuest,
  claimQuestReward,
  createQuestState,
  currentQuestSource,
  ensureQuest,
  ensureQuestList,
  openQuestFromGiver,
  openQuestNpc,
  openRescueNpc,
  questDefFromSource,
  questDefinitionsForGiver,
  questLocationText,
  questRewardGold,
  questState
} = questRuntime;
// 标记玩家附近当前可见的格子，并把它们永久记为已探索。
const interactionApi = {};
const interactionRuntime = createInteractionRuntime({
  api: interactionApi,
  battle: battleState,
  getState: () => state,
  ui: uiState
});
const {
  enterBattle,
  handleEnemyEncounter,
  isDangerousEnemy,
  isDefeatedEnemy,
  move,
  nearestGuardForTrap,
  openChest,
  openFenceGate,
  openLockedDoor,
  openLockedChest,
  promptDangerousEnemy,
  resolveCell,
  triggerTrap,
  updateVisibility
} = interactionRuntime;
function randomEquipment() {
  const slot = choice(SLOTS);
  const quality = qualityRoll();
  const weaponType = slot === "weapon" ? randomWeaponTypeForClass(state.classId || "warrior") : "";
  const prefix =
    slot === "weapon"
      ? weaponTypeName(weaponType)
      : { armor: "守望", boots: "疾行", ring: "秘银", amulet: "星纹" }[slot];
  const main =
    slot === "weapon"
      ? weaponPrimaryStat(weaponType)
      : slot === "armor"
        ? "def"
        : slot === "boots"
          ? "spd"
          : slot === "ring"
            ? "luk"
            : "res";
  const bonus = qualityBonus(quality) + Math.floor(state.floor / 4);
  const stats = { [main]: bonus };
  if (slot === "armor") stats.hp = 4 + state.floor;
  const equipment = item(
    `${quality}${prefix}${SLOT_NAMES[slot]}`,
    slot,
    quality,
    stats,
    quality === "普通" ? 0 : quality === "优秀" ? 1 : 2
  );
  if (weaponType) equipment.weaponType = weaponType;
  if (slot === "weapon" && (state.floor >= 4 || quality !== "普通") && Math.random() < weaponElementChance(quality)) {
    equipment.element = choice(ELEMENT_IDS);
    equipment.name = `${elementName(equipment.element)}纹${equipment.name}`;
  }
  if (slot !== "weapon" && state.floor >= 4 && Math.random() < elementResistanceChance(quality)) {
    const resistance = choice(ELEMENT_IDS);
    equipment.elementResistances = [resistance];
    equipment.name = `${elementName(resistance)}抗${equipment.name}`;
  }
  return equipment;
}

function weaponElementChance(quality) {
  return { 普通: 0.08, 优秀: 0.18, 稀有: 0.32, 史诗: 0.48, 传说: 0.7 }[quality] || 0.18;
}

function elementResistanceChance(quality) {
  return { 普通: 0.08, 优秀: 0.16, 稀有: 0.28, 史诗: 0.42, 传说: 0.58 }[quality] || 0.16;
}

// 抽取装备品质，幸运值和楼层会略微提高高品质概率。
function qualityRoll() {
  const r = Math.random() + state.stats.luk * 0.004 + Math.min(0.12, state.floor * 0.012);
  if (r > 0.96) return "传说";
  if (r > 0.86) return "史诗";
  if (r > 0.68) return "稀有";
  if (r > 0.38) return "优秀";
  return "普通";
}

// 把装备品质转换成基础属性预算。
function qualityBonus(quality) {
  return { 普通: 1, 优秀: 2, 稀有: 3, 史诗: 4, 传说: 6 }[quality];
}

// 消耗祭坛格子，恢复玩家部分生命和法力。
function useAltar(cell) {
  playSound("altar");
  const heal = Math.floor(state.maxHp * 0.24);
  state.hp = Math.min(effectiveMaxHp(), state.hp + heal);
  state.mp = Math.min(effectiveMaxMp(), state.mp + 4);
  cell.object = null;
  log(`符文祭坛恢复了 ${heal} 点生命和少量法力。`);
  showEvent("符文祭坛", `<p>祭坛亮起微光，恢复 ${heal} 点生命和少量法力。</p>`, "继续");
}

// 进入下一层，并恢复少量资源。
function nextFloor() {
  if (state.floor >= MAX_FLOOR) return;
  const stair = currentStairsDown();
  if (stair?.locked) {
    showEvent(
      "楼梯封印",
      `<p>下行楼梯被符文封住了。</p><p>解除条件：击败第 ${stair.seal?.targetFloor || state.floor} 层的${stair.seal?.targetName || "封印守卫"}。</p>`,
      "继续探索"
    );
    return;
  }
  saveCurrentFloor();
  state.floor++;
  state.facing = "down";
  enterFloor("down");
  state.hp = Math.min(effectiveMaxHp(), state.hp + 5);
  state.mp = Math.min(effectiveMaxMp(), state.mp + 3);
  log(`进入第 ${state.floor} 层。`);
  announceLoreUnlocks(unlockLoreChaptersForFloor(state));
  saveGame(false);
  showToast(`<p>你沿着下行楼梯抵达第 ${state.floor} 层。</p>`);
}

// 获取玩家当前脚下的下行楼梯对象。
function currentStairsDown() {
  const cell = state?.map?.cells?.[state.player?.y]?.[state.player?.x];
  return cell?.object?.type === "stairsDown" ? cell.object : null;
}

// 返回上一层，并从楼层缓存恢复地图状态。
function previousFloor() {
  if (state.floor <= 1) return;
  saveCurrentFloor();
  state.floor--;
  state.facing = "up";
  enterFloor("up");
  updateVisibility();
  state.hp = Math.min(effectiveMaxHp(), state.hp + 3);
  state.mp = Math.min(effectiveMaxMp(), state.mp + 1);
  log(`返回第 ${state.floor} 层。`);
  unlockLoreChaptersForFloor(state);
  saveGame(false);
  showToast(`<p>你沿着上行楼梯回到第 ${state.floor} 层。</p>`);
}

function announceLoreUnlocks(chapters = []) {
  for (const chapter of chapters) log(`主线解锁：${chapter.title}。`);
}

// 保存当前楼层地图、玩家位置和朝向，供上下楼后恢复。
function saveCurrentFloor() {
  if (!state?.map) return;
  state.floorStates = state.floorStates || {};
  state.floorStates[state.floor] = {
    map: cloneFloorMap(state.map),
    player: { ...state.player },
    facing: state.facing
  };
}

// 进入指定楼层：优先读取缓存，没有缓存时重新生成。
// 切换楼层时保存当前楼层快照，再恢复目标楼层或生成新楼层。
function enterFloor(direction) {
  state.floorStates = state.floorStates || {};
  const saved = state.floorStates[state.floor];
  if (saved?.map) {
    state.map = cloneFloorMap(saved.map);
    state.player = entryPositionForDirection(direction);
    updateVisibility();
    return;
  }
  generateFloor();
  state.player = entryPositionForDirection(direction);
  updateVisibility();
}

// 深拷贝楼层地图，避免缓存和当前地图互相引用。
function cloneFloorMap(map) {
  return JSON.parse(JSON.stringify(map));
}

// 根据上下楼方向选择玩家进入楼层时的出生点。
function entryPositionForDirection(direction) {
  const target = direction === "up" ? state.map?.stairsDown : state.map?.stairsUp;
  const fallback = direction === "up" ? findMapObject("stairsDown") : findMapObject("stairsUp");
  const cell = target || fallback || { x: 1, y: 1 };
  return { x: cell.x, y: cell.y };
}

// 在当前地图中查找指定物件所在位置。
function findMapObject(type) {
  return state?.map?.cells?.flat().find((cell) => cell.object?.type === type) || null;
}

// 汇总基础属性、装备属性、强化等级和符文效果。
// 汇总基础属性、装备、强化和符文效果；战斗和 UI 都以这里为准。
function totals() {
  const total = { ...state.stats, hp: 0, mp: 0 };
  for (const eq of Object.values(state.equipment || {})) {
    if (!eq) continue;
    for (const [key, value] of Object.entries(eq.stats))
      total[key] = (total[key] || 0) + value + eq.level;
    for (const rune of eq.runes) applyRune(total, rune);
  }
  return total;
}

// 计算装备加成后的当前生命上限。
function effectiveMaxHp() {
  return state.maxHp + (totals().hp || 0);
}

// 计算装备加成后的当前法力上限。
function effectiveMaxMp() {
  return state.maxMp + (totals().mp || 0);
}

// 把符文效果写入汇总属性对象。
function applyRune(total, rune) {
  const level = Number(rune.match(/\d+$/)?.[0] || 1);
  const value = 2 * level;
  if (rune.startsWith("火焰")) total.atk += value;
  if (rune.startsWith("寒冰")) total.res += value;
  if (rune.startsWith("雷霆")) total.mag += value;
  if (rune.startsWith("吸血")) total.luk += 1;
  if (rune.startsWith("守护")) total.def += value;
  if (rune.startsWith("迅捷")) total.spd += value;
}

function runeEffectText(rune) {
  const level = Number(rune.match(/\d+$/)?.[0] || 1);
  const value = 2 * level;
  if (rune.startsWith("火焰")) return `镶嵌后攻击 +${value}`;
  if (rune.startsWith("寒冰")) return `镶嵌后抗性 +${value}`;
  if (rune.startsWith("雷霆")) return `镶嵌后法强 +${value}`;
  if (rune.startsWith("吸血")) return `镶嵌后幸运 +${level}`;
  if (rune.startsWith("守护")) return `镶嵌后防御 +${value}`;
  if (rune.startsWith("迅捷")) return `镶嵌后速度 +${value}`;
  return "镶嵌到装备后生效";
}

function openAdminPanel() {
  if (!state) {
    showToast("没有活动游戏，先开始或读取一个存档。");
    return;
  }
  const currentEffect = state.map?.effect?.id || "none";
  const difficulty = Number(state.map?.effect?.difficulty || 1).toFixed(2);
  const reward = Number(state.map?.effect?.reward || 1).toFixed(2);
  const effectOptions = [
    `<option value="none"${currentEffect === "none" ? " selected" : ""}>无特殊效果</option>`,
    ...FLOOR_EFFECTS.map(
      (effect) =>
        `<option value="${effect.id}"${currentEffect === effect.id ? " selected" : ""}>${effect.name}</option>`
    )
  ].join("");
  const runeOptions = RUNES.map((name) => `<option value="${name}1">${name}1</option>`).join("");
  const weapon = state?.equipment?.weapon || null;
  const weaponElement = weapon?.element || "none";
  const weaponType = weapon?.weaponType || "none";
  const weaponElementOptions = [
    `<option value="none"${weaponElement === "none" ? " selected" : ""}>无元素</option>`,
    ...ELEMENT_IDS.map(
      (element) =>
        `<option value="${element}"${weaponElement === element ? " selected" : ""}>${elementName(element)}</option>`
    )
  ].join("");
  const weaponTypeOptions = [
    `<option value="none"${weaponType === "none" ? " selected" : ""}>无限制</option>`,
    ...Object.entries(WEAPON_TYPES).map(
      ([type, def]) =>
        `<option value="${type}"${weaponType === type ? " selected" : ""}>${def.name}</option>`
    )
  ].join("");
  showModal(
    "管理员模式",
    `
    <div class="admin-panel">
      <section>
        <h3>当前地图</h3>
        <label>楼层效果
          <select id="adminEffect">${effectOptions}</select>
        </label>
        <div class="admin-grid">
          <label>难度倍率
            <input id="adminDifficulty" type="number" min="0.80" max="1.50" step="0.01" value="${difficulty}">
          </label>
          <label>奖励倍率
            <input id="adminReward" type="number" min="0.80" max="2.00" step="0.01" value="${reward}">
          </label>
        </div>
        <button type="button" onclick="adminApplyFloorEffect()">应用到当前地图</button>
      </section>
      <section>
        <h3>资源</h3>
        <div class="admin-actions">
          <button type="button" onclick="adminAddGold(100)">金币 +100</button>
          <button type="button" onclick="adminAddKeys(3)">钥匙 +3</button>
          <button type="button" onclick="adminAddMaterial('强化石', 5)">强化石 +5</button>
          <button type="button" onclick="adminAddSkillDust(5)">技能尘 +5</button>
          <button type="button" onclick="adminHeal()">回满生命/法力</button>
        </div>
      </section>
      <section>
        <h3>物品</h3>
        <div class="admin-actions">
          <button type="button" onclick="adminAddItem('equipment')">随机装备</button>
          <button type="button" onclick="adminAddItem('hp')">生命药水</button>
          <button type="button" onclick="adminAddItem('mp')">法力药水</button>
          <button type="button" onclick="adminAddItem('beacon')">商路信标</button>
        </div>
        <label>符文
          <select id="adminRune">${runeOptions}</select>
        </label>
        <button type="button" onclick="adminAddSelectedRune()">添加符文</button>
      </section>
      <section>
        <h3>当前武器</h3>
        <p class="admin-note">${
          weapon
            ? `${weapon.name} · ${weapon.element ? `${elementName(weapon.element)}属性` : "无元素"} · ${
                weapon.weaponType ? weaponTypeName(weapon.weaponType) : "无限制"
              }`
            : "未装备武器，先在背包装备一把武器。"
        }</p>
        <div class="admin-grid">
          <label>元素特效
            <select id="adminWeaponElement" ${weapon ? "" : "disabled"}>${weaponElementOptions}</select>
          </label>
          <label>武器类型
            <select id="adminWeaponType" ${weapon ? "" : "disabled"}>${weaponTypeOptions}</select>
          </label>
        </div>
        <button type="button" ${weapon ? "" : "disabled"} onclick="adminApplyWeaponDebug()">应用到当前武器</button>
      </section>
    </div>
  `,
    [{ text: "关闭", action: closeModal }]
  );
}

function adminApplyFloorEffect() {
  if (!state?.map) return;
  const effectId = document.getElementById("adminEffect")?.value || "none";
  const difficulty = clampAdminNumber(
    document.getElementById("adminDifficulty")?.value,
    0.8,
    1.5,
    1
  );
  const reward = clampAdminNumber(document.getElementById("adminReward")?.value, 0.8, 2, 1);
  if (effectId === "none") {
    state.map.effect = null;
    applyAdminEffectTerrain();
  } else {
    const base = FLOOR_EFFECTS.find((effect) => effect.id === effectId) || FLOOR_EFFECTS[0];
    state.map.effect = { ...base, difficulty, reward };
    applyAdminEffectTerrain();
  }
  showToast(state.map.effect ? `已切换为${state.map.effect.name}` : "已清除楼层效果");
  render();
  openAdminPanel();
}

function applyAdminEffectTerrain() {
  if (!state?.map?.cells) return;
  for (const cell of state.map.cells.flat()) {
    if (cell.terrain === "lava") cell.terrain = "floor";
  }
  if (state.map.effect?.id !== "lava") return;
  const floorCells = state.map.cells.flat().filter((cell) => cell.terrain === "floor");
  const target = Math.max(4, Math.floor(floorCells.length * 0.035));
  let placed = 0;
  const candidates = floorCells
    .filter((cell) => !cell.object && !cell.roomId && !cell.mainPath)
    .filter((cell) => distance(cell, state.player || { x: 1, y: 1 }) > 4)
    .sort(() => Math.random() - 0.5);
  for (const cell of candidates) {
    if (placed >= target) break;
    cell.terrain = "lava";
    if (adminPlayableAreaIsConnected()) placed++;
    else cell.terrain = "floor";
  }
}

function adminPlayableAreaIsConnected() {
  const map = state?.map?.cells;
  if (!map?.length) return false;
  const passable = (cell) => ["floor", "door"].includes(cell.terrain);
  const start = map[state.player?.y || 1]?.[state.player?.x || 1] || map[1]?.[1];
  const total = map.flat().filter(passable).length;
  if (!start || !passable(start) || total <= 0) return false;
  const key = (cell) => `${cell.x},${cell.y}`;
  const visited = new Set([key(start)]);
  const queue = [start];
  while (queue.length) {
    const cell = queue.shift();
    for (const next of cardinalNeighbors(map, cell.x, cell.y)) {
      if (!passable(next) || visited.has(key(next))) continue;
      visited.add(key(next));
      queue.push(next);
    }
  }
  return visited.size === total;
}

function clampAdminNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function adminAddGold(amount = 100) {
  if (!state) return;
  state.gold = (state.gold || 0) + amount;
  showToast(`金币 +${amount}`);
  render();
}

function adminAddKeys(amount = 1) {
  if (!state) return;
  state.keys = (state.keys || 0) + amount;
  showToast(`符文钥匙 +${amount}`);
  render();
}

function adminAddMaterial(name, amount = 1) {
  if (!state) return;
  state.materials = state.materials || {};
  state.materials[name] = (state.materials[name] || 0) + amount;
  showToast(`${name} +${amount}`);
  render();
}

function adminAddSkillDust(amount = 1) {
  if (!state) return;
  state.skillDust = (state.skillDust || 0) + amount;
  showToast(`技能尘 +${amount}`);
  render();
}

function adminHeal() {
  if (!state) return;
  state.hp = effectiveMaxHp();
  state.mp = effectiveMaxMp();
  showToast("生命和法力已回满");
  render();
}

function adminAddItem(kind) {
  if (!state) return;
  state.inventory = state.inventory || [];
  let label = "";
  if (kind === "equipment") {
    const loot = randomEquipment();
    state.inventory.push(loot);
    label = loot.name;
  } else if (kind === "hp") {
    state.inventory.push(potion("小型生命药水", "hp", 18));
    label = "小型生命药水";
  } else if (kind === "mp") {
    state.inventory.push(potion("小型法力药水", "mp", 12));
    label = "小型法力药水";
  } else if (kind === "beacon") {
    state.inventory.push(teleportBeacon());
    label = "商路信标";
  }
  if (label) showToast(`已添加：${label}`);
  render();
}

function adminAddSelectedRune() {
  const rune = document.getElementById("adminRune")?.value || "火焰1";
  adminAddRune(rune, 1);
}

function adminAddRune(rune, amount = 1) {
  if (!state) return;
  state.runes = state.runes || {};
  state.runes[rune] = (state.runes[rune] || 0) + amount;
  showToast(`${rune} +${amount}`);
  render();
}

function adminApplyWeaponDebug() {
  const weapon = state?.equipment?.weapon;
  if (!weapon) {
    showToast("当前没有已装备武器");
    return;
  }
  const element = document.getElementById("adminWeaponElement")?.value || "none";
  const weaponType = document.getElementById("adminWeaponType")?.value || "none";
  if (element === "none") delete weapon.element;
  else weapon.element = element;
  if (weaponType === "none") delete weapon.weaponType;
  else weapon.weaponType = weaponType;
  showToast(
    `已更新${weapon.name}：${weapon.element ? `${elementName(weapon.element)}属性` : "无元素"} / ${
      weapon.weaponType ? weaponTypeName(weapon.weaponType) : "无限制"
    }`
  );
  render();
  openAdminPanel();
}

// 结算玩家一次战斗行动，然后触发敌人回合或胜利流程。
const combatApi = {};
const combatRuntime = createCombatRuntime({
  api: combatApi,
  battle: battleState,
  getState: () => state
});
const {
  applyClassLevelGrowth,
  attackEnemy,
  autoBattle,
  autoBattlePolicy,
  battleResultList,
  battleRisk,
  canUpgradeSkill,
  castSkill,
  completeStairSeal,
  dealDamage,
  death,
  enemyTurn,
  executeAutoBattle,
  levelUp,
  maybeDrop,
  recordQuestKill,
  safeEffectiveMaxHp,
  safeEffectiveMaxMp,
  skillById,
  skillLevel,
  skillPreviewText,
  skillUpgradeCost,
  upgradedSkill,
  useBattlePotion,
  winBattle
} = combatRuntime;
const statDraftRef = {
  get value() {
    return statDraft;
  },
  set value(next) {
    statDraft = next;
  }
};

const inventoryApi = {};
const inventoryRuntime = createInventoryRuntime({
  api: inventoryApi,
  draft: statDraftRef,
  getState: () => state
});
const {
  addStat,
  adjustStatDraft,
  adjustVitalsForMaxChange,
  buy,
  canEnhance,
  canSellEquipmentHere,
  canUnequipSlot,
  clampVital,
  confirmAddStat,
  confirmCraftRune,
  confirmDisassembleEquipment,
  confirmEnhance,
  confirmEquipItem,
  confirmSellEquipment,
  confirmUnequip,
  confirmUpgradeSkill,
  confirmUseItem,
  craftRune,
  disassembleEquipment,
  enhance,
  enhanceDisabledReason,
  equipItem,
  equipmentSalvageValue,
  equipmentSellValue,
  isBlockingInteraction,
  knownTeleportTargets,
  landingNear,
  merchantSalvageRows,
  openForge,
  openMerchant,
  openMerchantShop,
  openStatAllocator,
  openTeleportBeacon,
  renderStatAllocator,
  roomNameFromMap,
  sellEquipment,
  teleportAction,
  teleportTargetLabel,
  teleportToTarget,
  unequipItem,
  upgradeSkill,
  useItem
} = inventoryRuntime;

const renderApi = {};
const renderRuntime = createRenderRuntime({
  $,
  api: renderApi,
  getState: () => state,
  setState: (nextState) => {
    state = nextState;
  },
  ui: uiState
});
const {
  battleFxClass,
  battlePotionGroups,
  battleStatusPill,
  badgeForObject,
  centerFxMarkup,
  clickTile,
  combatantFxMarkup,
  confirmBuy,
  confirmDeleteSaveSlot,
  continueSavedGame,
  effectiveItemStat,
  enhanceText,
  equipmentCompareText,
  equipmentDetailMarkup,
  equipmentFilterControl,
  equipmentFilterRows,
  equipmentInventoryRow,
  equipmentScoreBadge,
  equipmentScoreBadgeMarkup,
  equipmentSummary,
  equippedStateBadge,
  iconClassForType,
  iconSprite,
  imageTag,
  inventoryConsumableGroups,
  inventoryGroup,
  inventoryGroupMarkup,
  inventorySubtabs,
  isBetterThanEquipped,
  itemScore,
  mapViewBounds,
  materialRows,
  minimapMarker,
  minimapObjectIcon,
  minimapOverviewBounds,
  newGameInSlot,
  nextNewGameSlot,
  objectSprite,
  percentScore,
  potionRow,
  render,
  renderBattleCommandPanel,
  renderBattlePotionButtons,
  renderBattleView,
  renderClassSelect,
  renderContext,
  renderContinueSlots,
  renderCraft,
  renderEquipment,
  renderHero,
  renderInventory,
  renderLegend,
  renderLog,
  renderMap,
  renderMinimap,
  renderPaperdoll,
  renderQuestList,
  renderSkillActionButtons,
  renderSkills,
  renderStartScreen,
  renderTab,
  roomDoorLabel,
  runeRows,
  saveSlotCard,
  selectEquipmentFilter,
  selectInventoryTab,
  selectMinimapTile,
  selectedTileText,
  shouldShowMapObject,
  showEquipmentSlot,
  showInventoryEquipmentCompare,
  showInventoryEquipmentDetail,
  sprite,
  startNewGame,
  statsText,
  tileLabel
} = renderRuntime;

const saveApi = {};
const saveRuntime = createSaveRuntime({
  api: saveApi,
  getState: () => state,
  setState: (nextState) => {
    state = nextState;
  },
  slots: uiState
});
const {
  deleteSaveSlot,
  loadGame,
  log,
  migrateLegacySave,
  newGamePrompt,
  openSaveSlotPicker,
  resetExploration,
  returnHome,
  saveGame,
  saveGameToSlot,
  saveMetaFromState,
  savePickerSlotCard,
  saveSlots,
  updateSaveSlotMeta
} = saveRuntime;

Object.assign(renderApi, {
  addStat,
  autoBattle,
  autoBattlePolicy,
  battleRisk,
  buy,
  canEnhance,
  canSellEquipmentHere,
  canUpgradeSkill,
  canUnequipSlot,
  closeModal,
  currentStairsDown,
  deleteSaveSlot,
  effectiveMaxHp,
  effectiveMaxMp,
  enhanceDisabledReason,
  equipItem,
  equipmentSellValue,
  equipmentSalvageValue,
  enemyAffixText,
  ensureQuestList,
  formatSaveTime,
  generateFloor,
  isDefeatedEnemy,
  knownTeleportTargets,
  loadGame,
  move,
  questLocationText,
  questRewardGold,
  roomName,
  roomThreat,
  runeEffectText,
  saveGame,
  saveSlotLabel,
  saveSlots,
  sellEquipment,
  showConfirm,
  showEvent,
  showModal,
  skillById,
  skillLevel,
  skillPreviewText,
  skillUpgradeCost,
  startGame,
  syncMusicToGame,
  themeForFloor,
  totals,
  unequipItem,
  updateVisibility,
  upgradedSkill
});

Object.assign(combatApi, {
  closeModal,
  effectiveMaxHp,
  effectiveMaxMp,
  enemyAffixText,
  ensureQuestList,
  enterFloor,
  equipmentSummary,
  generateFloor,
  itemScore,
  log,
  openStatAllocator,
  playSound,
  questState,
  randomEquipment,
  render,
  renderBattleView,
  saveGame,
  showEvent,
  showModal,
  syncMusicToGame,
  totals,
  roomName,
  useItem
});

Object.assign(inventoryApi, {
  canUpgradeSkill,
  closeModal,
  effectiveMaxHp,
  effectiveMaxMp,
  equipmentCompareText,
  equipmentDetailMarkup,
  equipmentSummary,
  itemScore,
  cloneFloorMap,
  log,
  openQuestFromGiver,
  playSound,
  potion,
  questDefinitionsForGiver,
  render,
  renderCraft,
  renderEquipment,
  renderInventory,
  renderSkills,
  runeEffectText,
  showConfirm,
  showEvent,
  showModal,
  showToast,
  saveCurrentFloor,
  skillById,
  skillLevel,
  skillUpgradeCost,
  sprite,
  statsText,
  teleportBeacon,
  upgradedSkill,
  updateVisibility
});

Object.assign(saveApi, {
  closeModal,
  emptyEquipment,
  generateFloor,
  render,
  renderLog,
  renderStartScreen,
  showConfirm,
  showModal,
  showToast,
  updateVisibility
});

Object.assign(questApi, {
  closeModal,
  log,
  playSound,
  potion,
  render,
  roomName,
  showEvent,
  showModal
});

Object.assign(interactionApi, {
  battleRisk,
  closeModal,
  currentStairsDown,
  getAudioEnabled,
  initAudio,
  isBlockingInteraction,
  log,
  nextFloor,
  openForge,
  openMerchant,
  openQuestNpc,
  openRescueNpc,
  placeGuardNear,
  playSound,
  previousFloor,
  randomEquipment,
  render,
  showEvent,
  showModal,
  syncMusicToGame,
  useAltar
});

export function getState() {
  return state;
}

export function setState(nextState) {
  state = nextState;
}

export function getAudioEnabled() {
  return audioRuntime.getAudioEnabled();
}

export function setAudioEnabledForRuntime(enabled) {
  audioRuntime.setAudioEnabledForRuntime(enabled);
}

export function getCurrentSaveSlot() {
  return currentSaveSlot;
}

export function setCurrentSaveSlot(slotId) {
  currentSaveSlot = slotId;
  pendingSaveSlot = slotId;
}

export function getActiveInventoryTab() {
  return activeInventoryTab;
}

export function setActiveInventoryTab(tab) {
  activeInventoryTab = tab;
}

export function getActiveEquipmentFilter() {
  return activeEquipmentFilter;
}

export function setActiveEquipmentFilter(filter) {
  activeEquipmentFilter = filter;
}

export function setActiveTab(tab) {
  activeTab = tab;
}

const runtimeApi = {
  addStat,
  applyClassLevelGrowth,
  attackEnemy,
  autoBattle,
  buy,
  cardinalNeighbors,
  canUnequipSlot,
  cellsWithin,
  clickTile,
  closeModal,
  completeStairSeal,
  confirmAddStat,
  confirmBuy,
  confirmCraftRune,
  confirmDeleteSaveSlot,
  confirmDisassembleEquipment,
  confirmEnhance,
  confirmEquipItem,
  confirmSellEquipment,
  confirmUnequip,
  confirmUpgradeSkill,
  confirmUseItem,
  continueSavedGame,
  craftRune,
  dealDamage,
  deleteSaveSlot,
  discoverLorePage,
  disassembleEquipment,
  distance,
  effectiveMaxHp,
  effectiveMaxMp,
  emptyEquipment,
  enhance,
  ensureLoreState,
  enterBattle,
  enterFloor,
  enemyAffixText,
  equipmentCompareText,
  equippedStateBadge,
  equipItem,
  exposeRuntime,
  floorEffectReward,
  floorNeighborCount,
  generateFloor,
  getActiveEquipmentFilter,
  getActiveInventoryTab,
  getAudioEnabled,
  getCurrentSaveSlot,
  getState,
  initAudio,
  inventoryGroupMarkup,
  isDefeatedEnemy,
  item,
  levelUp,
  loadGame,
  makeEnemy,
  makeEnemyWithVariant,
  maybeDrop,
  modalAction,
  move,
  nextFloor,
  newGameInSlot,
  newGamePrompt,
  openForge,
  openFenceGate,
  openLockedDoor,
  openLockedChest,
  openMerchant,
  openMerchantShop,
  openQuestNpc,
  openRescueNpc,
  openSaveSlotPicker,
  openStatAllocator,
  placeTreasureEncounters,
  potion,
  recordQuestKill,
  render,
  renderBattleView,
  renderBattleCommandPanel,
  renderClassSelect,
  renderContext,
  renderContinueSlots,
  renderCraft,
  renderEquipment,
  renderHero,
  renderInventory,
  renderLegend,
  renderLog,
  renderMap,
  renderMinimap,
  renderPaperdoll,
  renderQuestList,
  renderSkills,
  renderSkillActionButtons,
  skillById,
  renderStartScreen,
  renderTab,
  resolveCell,
  returnHome,
  roomDoorLabel,
  runeEffectText,
  saveCurrentFloor,
  saveGame,
  saveGameToSlot,
  saveSlots,
  saveSlotCard,
  selectEquipmentFilter,
  selectInventoryTab,
  sellEquipment,
  setActiveTab,
  setActiveEquipmentFilter,
  setActiveInventoryTab,
  setAudioEnabledForRuntime,
  setCurrentSaveSlot,
  setState,
  showConfirm,
  showEquipmentSlot,
  showEvent,
  showInventoryEquipmentCompare,
  showInventoryEquipmentDetail,
  showModal,
  showToast,
  startGame,
  startNewGame,
  starterEquipment,
  starterInventory,
  shouldShowMapObject,
  tileLabel,
  toggleAudio,
  teleportToTarget,
  triggerTrap,
  unequipItem,
  updateSoundButton,
  updateVisibility,
  unlockLoreChaptersForFloor,
  upgradeSkill,
  useBattlePotion,
  useItem,
  validRoomDoor,
  knownTeleportTargets,
  mapViewBounds,
  minimapOverviewBounds,
  objectSprite
};

if (import.meta.env.DEV) {
  Object.assign(runtimeApi, {
    adminAddGold,
    adminAddItem,
    adminAddKeys,
    adminAddMaterial,
    adminAddRune,
    adminAddSelectedRune,
    adminAddSkillDust,
    adminApplyFloorEffect,
    adminApplyWeaponDebug,
    adminHeal,
    openAdminPanel
  });
}

export {
  addStat,
  applyClassLevelGrowth,
  attackEnemy,
  acceptQuest,
  autoBattle,
  autoBattlePolicy,
  buy,
  cardinalNeighbors,
  canUnequipSlot,
  cellsWithin,
  clickTile,
  closeModal,
  completeStairSeal,
  confirmAddStat,
  confirmBuy,
  confirmCraftRune,
  confirmDeleteSaveSlot,
  confirmDisassembleEquipment,
  confirmEnhance,
  confirmEquipItem,
  confirmSellEquipment,
  confirmUnequip,
  confirmUpgradeSkill,
  confirmUseItem,
  continueSavedGame,
  craftRune,
  dealDamage,
  deleteSaveSlot,
  discoverLorePage,
  disassembleEquipment,
  distance,
  effectiveMaxHp,
  effectiveMaxMp,
  emptyEquipment,
  enhance,
  ensureLoreState,
  enterBattle,
  enterFloor,
  enemyAffixText,
  equipmentCompareText,
  equippedStateBadge,
  equipItem,
  floorEffectReward,
  floorNeighborCount,
  generateFloor,
  inventoryGroupMarkup,
  initAudio,
  isDefeatedEnemy,
  item,
  knownTeleportTargets,
  levelUp,
  loadGame,
  makeEnemy,
  makeEnemyWithVariant,
  maybeDrop,
  mapViewBounds,
  modalAction,
  move,
  minimapOverviewBounds,
  nextFloor,
  newGameInSlot,
  newGamePrompt,
  objectSprite,
  openFenceGate,
  openForge,
  openLockedDoor,
  openLockedChest,
  openMerchant,
  openMerchantShop,
  openQuestNpc,
  openRescueNpc,
  openSaveSlotPicker,
  openStatAllocator,
  placeTreasureEncounters,
  potion,
  recordQuestKill,
  render,
  renderBattleCommandPanel,
  renderBattleView,
  renderClassSelect,
  renderContext,
  renderContinueSlots,
  renderCraft,
  renderEquipment,
  renderHero,
  renderInventory,
  renderLegend,
  renderLog,
  renderMap,
  renderMinimap,
  renderPaperdoll,
  renderQuestList,
  renderSkillActionButtons,
  renderSkills,
  renderStartScreen,
  renderTab,
  resolveCell,
  returnHome,
  roomDoorLabel,
  runeEffectText,
  saveCurrentFloor,
  saveGame,
  saveGameToSlot,
  saveSlots,
  saveSlotCard,
  sellEquipment,
  selectEquipmentFilter,
  selectInventoryTab,
  shouldShowMapObject,
  showConfirm,
  showEquipmentSlot,
  showEvent,
  showInventoryEquipmentCompare,
  showInventoryEquipmentDetail,
  showModal,
  showToast,
  startGame,
  startNewGame,
  starterEquipment,
  starterInventory,
  tileLabel,
  toggleAudio,
  teleportToTarget,
  triggerTrap,
  unequipItem,
  updateSoundButton,
  updateVisibility,
  unlockLoreChaptersForFloor,
  upgradeSkill,
  useBattlePotion,
  useItem,
  validRoomDoor
};

export function exposeRuntime() {
  Object.assign(window, runtimeApi);
  window.__runeDungeon = {
    getState,
    setState
  };
}
