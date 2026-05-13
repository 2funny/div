let state = null;
let activeTab = "inventory";
let activeInventoryTab = "equipment";
let activeEquipmentFilter = "all";
let selectedTile = null;
let battleFx = null;
let statDraft = null;
let audioState = null;
let audioEnabled = localStorage.getItem("rune-dungeon-audio") === "on";

const $ = (id) => document.getElementById(id);

const QUEST_DEFS = {
  rescueRoom: {
    id: "rescueRoom",
    giver: "questNpc",
    title: "房间救援",
    giverName: "救援斥候卡尔",
    desc: "清理指定房间的怪物，救出被困的冒险者。",
    target: 2,
    rewardGold: (floor) => 45 + floor * 8,
    rewardKeys: 1,
    type: "rescueRoom"
  },
  wardenErrand: {
    id: "wardenErrand",
    giver: "questNpc",
    title: "巡夜人委托",
    giverName: "巡夜人",
    desc: "清掉本层游荡怪物，换取打开符文锁的钥匙。",
    target: 2,
    rewardGold: (floor) => 30 + floor * 5,
    rewardKeys: 1
  },
  merchantRoute: {
    id: "merchantRoute",
    giver: "shop",
    title: "商路清理",
    giverName: "流动商队",
    desc: "帮商人扫清附近怪物，换取补给和金币。",
    target: 2,
    rewardGold: (floor) => 20 + floor * 6,
    rewardPotion: "hp"
  }
};

const ENEMY_AFFIXES = [
  { id: "armored", name: "坚甲", desc: "防御提高，普通攻击效率降低" },
  { id: "shatter", name: "破盾", desc: "防御姿态减伤降低" },
  { id: "drain", name: "汲取", desc: "造成伤害后恢复生命" },
  { id: "swift", name: "迅捷", desc: "更容易避开攻击" }
];

// 随机数和 ID 工具，供地图生成、掉落和物品创建复用。
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choice(list) {
  return list[rand(0, list.length - 1)];
}

function uid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// 重置本回合战斗表现状态，用于驱动攻击、防御和治疗的短动画。
function resetBattleFx(kind = "action") {
  battleFx = { kind, hero: null, enemy: null, center: null, seq: Date.now() };
}

// 记录指定战斗对象的表现数据，渲染层据此显示飘字和状态反馈。
function setBattleFx(target, data) {
  if (!battleFx) resetBattleFx();
  battleFx[target] = { ...data, seq: `${battleFx.seq}-${target}` };
}

// 初始化 Web Audio 上下文，并在浏览器允许播放后启动地牢氛围声。
function initAudio(playReady = false) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!audioState) {
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = audioEnabled ? .85 : 0;
    master.connect(ctx.destination);
    audioState = { ctx, master, music: null, ambienceTimer: null };
  }
  const start = () => {
    startDungeonMusic();
    if (playReady || !audioState.unlocked) {
      audioState.unlocked = true;
      playSound("ready", false);
    }
    updateSoundButton();
  };
  if (audioState.ctx.state === "suspended") audioState.ctx.resume().then(start).catch(() => updateSoundButton());
  else start();
  return audioState;
}

function toggleAudio() {
  setAudioEnabled(!audioEnabled, true);
}

// 切换全局音频开关，持久化到 localStorage 并平滑调整主音量。
function setAudioEnabled(enabled, playReady = false) {
  audioEnabled = enabled;
  localStorage.setItem("rune-dungeon-audio", enabled ? "on" : "off");
  if (audioState?.master) {
    const now = audioState.ctx.currentTime;
    audioState.master.gain.cancelScheduledValues(now);
    audioState.master.gain.setTargetAtTime(enabled ? .85 : 0, now, .035);
  }
  updateSoundButton();
  if (enabled) initAudio(playReady);
}

function updateSoundButton() {
  const button = $("soundBtn");
  if (!button) return;
  button.textContent = audioEnabled ? "声音：开" : "声音：关";
  button.setAttribute("aria-pressed", audioEnabled ? "true" : "false");
  button.classList.toggle("muted", !audioEnabled);
}

// 启动低音量循环氛围声；只创建一次，避免重复叠加音轨。
function startDungeonMusic() {
  if (!audioState || audioState.music) return;
  const { ctx, master } = audioState;
  const music = ctx.createGain();
  music.gain.value = .055;
  music.connect(master);
  audioState.music = music;
  playAmbientTone(.055);
  scheduleDungeonAmbience();
}

function scheduleDungeonAmbience() {
  if (!audioState?.music) return;
  const delay = rand(3600, 6800);
  audioState.ambienceTimer = setTimeout(() => {
    playAmbientTone();
    scheduleDungeonAmbience();
  }, delay);
}

// 播放一段低频环境音，制造地牢背景氛围。
function playAmbientTone(volume = .045) {
  if (!audioState?.music) return;
  const { ctx, music } = audioState;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  const notes = [55, 61.74, 73.42, 82.41, 98];
  osc.type = "sine";
  osc.frequency.value = choice(notes);
  filter.type = "lowpass";
  filter.frequency.value = 360;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + .8);
  gain.gain.exponentialRampToValueAtTime(.0001, now + 4.8);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(music);
  osc.start(now);
  osc.stop(now + 5);
}

// 播放一次短音效，按事件类型选择音色、频率和持续时间。
function playSound(kind, ensure = true) {
  if (!audioEnabled) return;
  const audio = ensure ? initAudio() : audioState;
  if (!audio) return;
  const { ctx, master } = audio;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  const osc = ctx.createOscillator();
  const tones = {
    ready: ["sine", 523, 262, .32, .42],
    step: ["triangle", 130, 82, .08, .2],
    chest: ["sine", 392, 784, .34, .38],
    hit: ["square", 170, 54, .16, .36],
    cast: ["sawtooth", 300, 168, .24, .32],
    altar: ["sine", 262, 524, .4, .34],
    quest: ["triangle", 247, 370, .34, .3],
    sell: ["triangle", 620, 410, .22, .3],
    danger: ["sawtooth", 110, 40, .42, .32]
  };
  const [type, start, end, duration, volume] = tones[kind] || tones.step;
  osc.type = type;
  osc.frequency.setValueAtTime(start, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), now + duration);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + .015);
  gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + duration + .02);
}

// 创建新的角色持久化状态，并进入第一层地牢。
function startGame(classId) {
  const cls = CLASSES[classId];
  state = {
    classId,
    floor: 1,
    level: 1,
    xp: 0,
    xpNext: 24,
    gold: 30,
    hp: cls.hp,
    maxHp: cls.hp,
    mp: cls.mp,
    maxMp: cls.mp,
    stats: { ...cls.stats },
    statPoints: 0,
    skillPoints: 0,
    skillDust: 0,
    keys: 0,
    quest: null,
    quests: [],
    skillLevels: Object.fromEntries(cls.skills.map((skill) => [skill.id, 0])),
    inventory: [
      potion("小型生命药水", "hp", 40),
      potion("小型法力药水", "mp", 25),
      ...starterInventory(classId)
    ],
    materials: { "强化石": 1, "魔尘": 0 },
    runes: { "火焰1": 1, "守护1": 1 },
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
  log(`你作为${cls.name}踏入了符文地牢。`);
  saveGame(false);
  render();
}

// 按所选职业构造初始装备组合。
function starterEquipment(classId) {
  const weapon = classId === "mage"
    ? item("学徒法杖", "weapon", "普通", { mag: 4 })
    : classId === "ranger"
      ? item("短弓", "weapon", "普通", { atk: 4, spd: 1 })
      : item("铁剑", "weapon", "普通", { atk: 5 });
  return {
    weapon,
    armor: item("旧皮甲", "armor", "普通", { def: 3, hp: 12 }),
    boots: null,
    ring: null,
    amulet: null
  };
}

function starterInventory(classId) {
  return Object.values(starterEquipment(classId)).filter(Boolean);
}

// 创建空装备栏对象，所有装备槽初始都为空。
function emptyEquipment() {
  return Object.fromEntries(SLOTS.map((slot) => [slot, null]));
}

// 创建消耗品物品数据。
function potion(name, kind, amount) {
  return { id: uid(), kind: "potion", name, effect: kind, amount };
}

// 创建可传送到已探索商人或 NPC 附近的消耗道具。
function teleportBeacon() {
  return { id: uid(), kind: "teleport", name: "商路信标" };
}

// 创建装备物品数据，包含部位、品质、属性、符文槽和强化等级。
function item(name, slot, quality, stats, runeSlots = 0, runes = []) {
  return { id: uid(), kind: "equip", name, slot, quality, stats, runeSlots, runes, level: 0 };
}

// 根据楼层取得视觉主题和地图生成参数。
function themeForFloor(floor) {
  const exact = THEMES.find((theme) => theme.floors.includes(floor));
  if (exact) return exact;
  if (floor >= MAX_FLOOR - 2) return THEMES[THEMES.length - 1];
  const index = Math.min(THEMES.length - 2, Math.floor((floor - 1) / Math.ceil((MAX_FLOOR - 3) / (THEMES.length - 1))));
  return THEMES[Math.max(0, index)];
}

// 生成半随机大地图，并保证入口到出口一定可达。
function generateFloor() {
  const size = MAP_SIZE;
  const theme = themeForFloor(state.floor);
  const map = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => ({
      x, y,
      terrain: "wall",
      object: null,
      seen: false,
      visible: false
    }))
  );

  if (isFinalFloor()) {
    const center = Math.floor(size / 2);
    carvePath(map, 1, 1, center, center);
    for (let y = center - 3; y <= center + 3; y++) {
      for (let x = center - 3; x <= center + 3; x++) map[y][x].terrain = "floor";
    }
    map[center][center].object = makeEnemy(true);
    map[center - 3][center - 3].object = { type: "altar" };
    map[center - 3][center + 3].object = { type: "forge" };
    const stairs = placeFloorStairs(map, false);
    state.map = { size, theme: theme.id, cells: map, rooms: [], stairsUp: stairs.up, stairsDown: null, explorationVersion: 2 };
  } else {
    const mainPath = carveMainRoute(map, 1, 1, size - 2, size - 2);
    widenMainRoute(map, mainPath);
    carveSideRooms(map, mainPath, 22 + state.floor);
    carveStructuredRooms(map, mainPath, 7);
    pruneDisconnectedFloors(map);
    const rooms = assignRoomLabels(map);
    placeTreasureEncounters(map, 5);
    scatter(map, "monster", 12 + Math.floor(state.floor * 1.2), { preferRooms: true, minObjectDistance: 2, rooms });
    const rescueQuest = placeRescueQuest(map, rooms);
    scatter(map, "trap", state.floor >= 4 ? 5 : 3, { minObjectDistance: 3 });
    scatter(map, "altar", 2, { preferRooms: true, minObjectDistance: 6 });
    if (state.floor % 3 === 1) scatter(map, "shop", 1, { minObjectDistance: 5 });
    if (state.floor % 3 === 2) scatter(map, "forge", 1, { minObjectDistance: 5 });
    if (!rescueQuest) placeQuestNpc(map);
    resolveOutdoorFeatureCrowding(map);
    const stairs = placeFloorStairs(map, true);
    state.map = { size, theme: theme.id, cells: map, rooms, rescueQuest, stairsUp: stairs.up, stairsDown: stairs.down, explorationVersion: 2 };
    state.player = { x: 1, y: 1 };
    state.facing = state.facing || "down";
    updateVisibility();
    return;
  }

  state.player = { x: 1, y: 1 };
  state.facing = state.facing || "down";
  updateVisibility();
}

// 判断当前楼层是否为最终 Boss 层。
function isFinalFloor(floor = state.floor) {
  return floor >= MAX_FLOOR;
}

// 在当前楼层放置上下楼梯，下楼梯优先选择远处房间或路线尽头。
function placeFloorStairs(map, includeDownstairs = true) {
  const upCell = state.floor > 1 ? chooseStairCell(map, "up", { x: 1, y: 1 }) : null;
  if (upCell) upCell.object = { type: "stairsUp" };
  const downCell = includeDownstairs ? chooseStairCell(map, "down", { x: 1, y: 1 }, upCell) : null;
  if (downCell) {
    downCell.object = { type: "stairsDown" };
    maybeSealDownstairs(map, downCell);
  }
  return {
    up: upCell ? { x: upCell.x, y: upCell.y } : null,
    down: downCell ? { x: downCell.x, y: downCell.y } : null
  };
}

// 从可通行空格中选择楼梯位置，避免固定角落并控制与入口的距离。
function chooseStairCell(map, kind, origin, otherStair = null) {
  const minDistance = kind === "down" ? Math.max(10, Math.floor(map.length * .42)) : 4;
  const candidates = interiorCells(map)
    .filter((cell) => ["floor", "door"].includes(cell.terrain) && !cell.object)
    .filter((cell) => !(cell.x === 1 && cell.y === 1))
    .filter((cell) => kind !== "down" || !(cell.x === map.length - 2 && cell.y === map.length - 2))
    .filter((cell) => !otherStair || distance(cell, otherStair) >= 5)
    .filter((cell) => distance(cell, origin) >= minDistance);
  const endpointOrRoom = kind === "down"
    ? candidates.filter((cell) => cell.roomId || floorNeighborCount(map, cell.x, cell.y) <= 1)
    : candidates;
  const pool = endpointOrRoom.length ? endpointOrRoom : candidates;
  return pool
    .sort((a, b) => stairScore(map, b, origin, kind) - stairScore(map, a, origin, kind))[0] || null;
}

// 计算楼梯候选点分数：越远、越像房间或尽头越优先。
function stairScore(map, cell, origin, kind) {
  const endpoint = floorNeighborCount(map, cell.x, cell.y) <= 1 ? 28 : 0;
  const room = cell.roomId ? 22 : 0;
  const door = cell.terrain === "door" ? 8 : 0;
  const mainPathPenalty = cell.mainPath && kind === "down" ? -10 : 0;
  return distance(cell, origin) * 2 + endpoint + room + door + mainPathPenalty + Math.random();
}

// 偶尔给下楼梯添加封印，并在附近生成封印守卫作为解锁目标。
function maybeSealDownstairs(map, stairCell) {
  if (state.floor < 4 || state.floor >= MAX_FLOOR || state.floor % 4 !== 0) return;
  const guardianCell = cellsWithin(map, stairCell.x, stairCell.y, 5)
    .filter((cell) => cell !== stairCell && cell.terrain === "floor" && !cell.object)
    .sort((a, b) => distance(a, stairCell) - distance(b, stairCell))[0];
  if (!guardianCell) return;
  const sealId = `seal-${state.floor}-${stairCell.x}-${stairCell.y}`;
  const guardian = makeEnemyWithVariant(true);
  guardian.type = "elite";
  guardian.variant = "elite";
  guardian.name = "封印守卫";
  guardian.roomBoss = true;
  guardian.sealId = sealId;
  guardianCell.object = guardian;
  stairCell.object.locked = true;
  stairCell.object.sealId = sealId;
  stairCell.object.seal = { type: "guardian", targetName: guardian.name, targetFloor: state.floor };
}

// 挖出一条简单保底路线，避免随机墙体导致楼层无法通关。
function carvePath(map, sx, sy, tx, ty) {
  let x = sx;
  let y = sy;
  while (x !== tx || y !== ty) {
    map[y][x].terrain = "floor";
    if (x !== tx && (y === ty || Math.random() > .45)) x += Math.sign(tx - x);
    else if (y !== ty) y += Math.sign(ty - y);
  }
  map[ty][tx].terrain = "floor";
}

function carveMainRoute(map, sx, sy, tx, ty) {
  const path = [];
  let x = sx;
  let y = sy;
  let horizontalBias = Math.random() > .5;
  while (x !== tx || y !== ty) {
    carveMainCell(map, x, y, path);
    if (x !== tx && y !== ty) {
      if (Math.random() < .22) horizontalBias = !horizontalBias;
      if (horizontalBias) x += Math.sign(tx - x);
      else y += Math.sign(ty - y);
    } else if (x !== tx) {
      x += Math.sign(tx - x);
    } else {
      y += Math.sign(ty - y);
    }
  }
  carveMainCell(map, tx, ty, path);
  return path;
}

// 将主路线上的格子标记为地面，并记录到主路数组。
function carveMainCell(map, x, y, path) {
  const cell = map[y]?.[x];
  if (!cell) return;
  cell.terrain = "floor";
  cell.mainPath = true;
  path.push(cell);
}

// 扩宽主路线，让地图不会只是一格宽的细长通道。
function widenMainRoute(map, mainPath) {
  for (const cell of mainPath) {
    for (const next of cardinalNeighbors(map, cell.x, cell.y)) {
      if (next.x > 0 && next.y > 0 && next.x < map.length - 1 && next.y < map.length - 1) {
        next.terrain = "floor";
      }
    }
  }
}

// 从主路线向两侧挖出分支房间，增加探索空间和遭遇点。
function carveSideRooms(map, mainPath, count) {
  const anchors = mainPath.filter((cell) => cell.x > 3 && cell.y > 3 && cell.x < map.length - 4 && cell.y < map.length - 4);
  const trunkRooms = Math.min(8, Math.floor(count / 2), anchors.length);
  for (let i = 0; i < trunkRooms; i++) {
    const anchor = anchors[Math.floor((i + 1) * anchors.length / (trunkRooms + 1))];
    carveRoom(map, anchor.x, anchor.y, 2, `side-${state.floor}-trunk-${i}`);
  }
  let placed = 0;
  let attempts = 0;
  const branchTarget = count - trunkRooms;
  while (placed < branchTarget && anchors.length && attempts < count * 10) {
    attempts++;
    const offset = Math.floor((placed + 1) * anchors.length / (branchTarget + 1));
    const anchor = anchors[(offset + attempts) % anchors.length];
    const dirs = shuffledDirections();
    for (const dir of dirs) {
      if (carveBranchRoom(map, anchor, dir, `side-${state.floor}-branch-${placed}`)) {
        placed++;
        break;
      }
    }
  }
}

// 沿指定方向挖一段走廊，并在末端尝试生成分支房间。
function carveBranchRoom(map, anchor, dir, roomId = null) {
  let x = anchor.x;
  let y = anchor.y;
  const length = rand(2, 5);
  const corridor = [];
  for (let i = 0; i < length; i++) {
    x += dir.x;
    y += dir.y;
    if (x <= 2 || y <= 2 || x >= map.length - 3 || y >= map.length - 3) return false;
    corridor.push(map[y][x]);
  }
  for (const cell of corridor) cell.terrain = "floor";
  return carveRoom(map, x, y, 2, roomId);
}

// 返回随机排序的四向方向，用于让房间分布更自然。
function shuffledDirections() {
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ];
  return dirs.sort(() => Math.random() - .5);
}

// 生成带门和房间编号的结构化房间，供任务和宝藏使用。
function carveStructuredRooms(map, mainPath, count) {
  const anchors = mainPath.filter((cell) => cell.x > 5 && cell.y > 5 && cell.x < map.length - 6 && cell.y < map.length - 6);
  let placed = 0;
  let attempts = 0;
  while (placed < count && anchors.length && attempts < count * 18) {
    attempts++;
    const anchor = anchors[(placed * 7 + attempts) % anchors.length];
    for (const dir of shuffledDirections()) {
      if (carveStructuredRoom(map, anchor, dir, `room-${state.floor}-${placed}`)) {
        placed++;
        break;
      }
    }
  }
}

// 在主路旁构造一个有墙、有门的封闭房间。
function carveStructuredRoom(map, anchor, dir, roomId) {
  const doorX = anchor.x + dir.x;
  const doorY = anchor.y + dir.y;
  const cx = anchor.x + dir.x * 5;
  const cy = anchor.y + dir.y * 5;
  const radius = 2;
  if (cx - radius <= 0 || cy - radius <= 0 || cx + radius >= map.length - 1 || cy + radius >= map.length - 1) return false;
  const cells = [];
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const cell = map[y]?.[x];
      if (!cell || cell.object || cell.mainPath) return false;
      cells.push(cell);
    }
  }
  for (let i = 1; i <= 3; i++) {
    const cell = map[anchor.y + dir.y * i]?.[anchor.x + dir.x * i];
    if (!cell || cell.object) return false;
  }
  for (const cell of cells) {
    const edge = cell.x === cx - radius || cell.x === cx + radius || cell.y === cy - radius || cell.y === cy + radius;
    cell.terrain = edge ? "wall" : "floor";
    cell.roomId = roomId;
  }
  for (let i = 1; i <= 3; i++) {
    const cell = map[anchor.y + dir.y * i][anchor.x + dir.x * i];
    cell.terrain = i === 3 ? "door" : "floor";
    cell.roomId = roomId;
  }
  map[doorY][doorX].terrain = "floor";
  return true;
}

// 为所有房间统计可通行格子数量，并生成展示用房间名。
function assignRoomLabels(map) {
  const rooms = {};
  for (const cell of map.flat()) {
    if (!cell.roomId || cell.terrain === "wall") continue;
    rooms[cell.roomId] = rooms[cell.roomId] || { id: cell.roomId, cells: 0 };
    rooms[cell.roomId].cells++;
  }
  return Object.values(rooms)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((room, index) => ({ ...room, name: `${index + 1}号房`, threat: roomThreatForIndex(index) }));
}

// 给房间分配轻量威胁等级，门牌会显示对应标记。
function roomThreatForIndex(index) {
  if ((index + state.floor) % 7 === 0) return "sealed";
  if ((index + state.floor) % 4 === 0) return "danger";
  if ((index + state.floor) % 5 === 0) return "treasure";
  return "quiet";
}

// 移除入口不可达的地面，防止随机生成出孤岛区域。
function pruneDisconnectedFloors(map) {
  const start = map[1]?.[1];
  if (!start) return;
  const passable = (cell) => ["floor", "door"].includes(cell.terrain);
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
  for (const cell of map.flat()) {
    if (!passable(cell) || visited.has(key(cell))) continue;
    cell.terrain = "wall";
    cell.object = null;
    delete cell.roomId;
  }
}

function roomName(roomId) {
  return state?.map?.rooms?.find((room) => room.id === roomId)?.name || "未知房间";
}

// 读取房间威胁等级。
function roomThreat(roomId) {
  return state?.map?.rooms?.find((room) => room.id === roomId)?.threat || "quiet";
}

// 从指定房间列表读取威胁等级，供地图生成阶段使用。
function roomThreatFromRooms(rooms, roomId) {
  if (!roomId) return "quiet";
  return rooms?.find((room) => room.id === roomId)?.threat || "quiet";
}

// 在空地面上散布怪物或地图物件，并按规则控制密度。
function scatter(map, type, count, options = {}) {
  let placed = 0;
  let attempts = 0;
  const max = map.length - 2;
  while (placed < count && attempts < count * 80) {
    attempts++;
    const x = rand(1, max);
    const y = rand(1, max);
    const cell = map[y][x];
    if (cell.terrain === "floor" && !cell.object && !(x === 1 && y === 1) && !isObjectCrowded(map, cell, options)) {
      const threat = roomThreatFromRooms(options.rooms, cell.roomId);
      const eliteChance = ["danger", "sealed"].includes(threat) ? .36 : .18;
      const object = type === "monster" ? makeEnemyWithVariant(Math.random() < eliteChance) : { type };
      if (cell.roomId) object.roomId = cell.roomId;
      cell.object = object;
      placed++;
    }
  }
}

function isObjectCrowded(map, cell, options = {}) {
  if (options.preferRooms && !cell.roomId && Math.random() < .72) return true;
  const minDistance = options.minObjectDistance || 0;
  if (!minDistance) return false;
  return cellsWithin(map, cell.x, cell.y, minDistance)
    .some((nearby) => nearby !== cell && nearby.object && !["stairsDown", "stairsUp"].includes(nearby.object.type));
}

// 判断一个物件是否属于室外特征，用于后续调整过近的散布点。
function isOutdoorFeature(cell) {
  return !cell.roomId && ["monster", "elite", "chest", "lockedChest", "altar"].includes(cell.object?.type);
}

// 重新摆放过于拥挤的室外物件，避免怪物、宝箱和祭坛堆在一起。
function resolveOutdoorFeatureCrowding(map) {
  const kept = [];
  for (const cell of map.flat().filter(isOutdoorFeature)) {
    const crowded = kept.some((other) => distance(cell, other) <= 1);
    if (!crowded) {
      kept.push(cell);
      continue;
    }
    const object = cell.object;
    cell.object = null;
    const target = findOutdoorFeatureSlot(map, kept);
    if (!target) continue;
    delete object.roomId;
    target.object = object;
    kept.push(target);
  }
}

// 为被挤开的室外物件寻找新的空地位置。
function findOutdoorFeatureSlot(map, kept) {
  return interiorCells(map)
    .filter((cell) => cell.terrain === "floor" && !cell.object && !cell.roomId)
    .filter((cell) => !(cell.x === 1 && cell.y === 1) && !(cell.x === map.length - 2 && cell.y === map.length - 2))
    .filter((cell) => kept.every((other) => distance(cell, other) > 1))
    .filter((cell) => !cellsWithin(map, cell.x, cell.y, 1).some((nearby) => isOutdoorFeature(nearby)))
    .sort((a, b) => floorNeighborCount(map, a.x, a.y) - floorNeighborCount(map, b.x, b.y))[0];
}

// 组合生成宝藏遭遇：上锁宝箱、守卫宝箱和死路宝箱。
function placeTreasureEncounters(map, count) {
  let placed = 0;
  if (count > 1 && placeLockedTreasureRoom(map)) placed++;
  const roomCount = Math.min(3, count);
  for (let i = 0; i < roomCount; i++) {
    if (placeTreasureRoom(map)) placed++;
  }
  while (placed < count) {
    if (placeDeadEndTreasure(map) || placeGuardedTreasure(map)) placed++;
    else break;
  }
}

// 为没有房间编号的遭遇点生成临时区域编号。
function encounterRoomId(cell) {
  return cell.roomId || `encounter-${state.floor}-${cell.x}-${cell.y}`;
}

// 标记宝藏附近区域，便于任务、守卫和房间提示共享同一 roomId。
function markEncounterArea(map, x, y, radius = 1) {
  const id = encounterRoomId(map[y][x]);
  for (const cell of cellsWithin(map, x, y, radius)) {
    if (cell.terrain === "floor" || cell.terrain === "door") cell.roomId = cell.roomId || id;
  }
  return id;
}

// 生成带门栅、钥匙守卫和额外守卫的上锁宝藏房。
function placeLockedTreasureRoom(map) {
  const candidates = interiorCells(map)
    .filter((cell) => canUseTreasureCell(map, cell.x, cell.y))
    .sort((a, b) => treasureScore(map, b) - treasureScore(map, a));
  for (const center of candidates.slice(0, 36)) {
    if (!carveRoom(map, center.x, center.y, 2, encounterRoomId(center))) continue;
    center.object = { type: "lockedChest" };
    placeFenceRing(map, center.x, center.y);
    placeKeyGuardianNear(map, center.x, center.y);
    placeGuardNear(map, center.x, center.y, false);
    return true;
  }
  return false;
}

// 在宝箱周围放置围栏，并留一个可交互门栅。
function placeFenceRing(map, x, y) {
  const gate = choice(cardinalNeighbors(map, x, y).filter((cell) => cell.terrain === "floor" && !cell.object));
  for (const cell of cardinalNeighbors(map, x, y)) {
    if (cell.object) continue;
    if (gate && cell.x === gate.x && cell.y === gate.y) {
      cell.object = { type: "fenceGate" };
    } else {
      cell.terrain = "fence";
    }
  }
}

// 生成普通宝藏房，并在附近布置守卫。
function placeTreasureRoom(map) {
  const candidates = interiorCells(map)
    .filter((cell) => canUseTreasureCell(map, cell.x, cell.y))
    .sort((a, b) => treasureScore(map, b) - treasureScore(map, a));
  for (const center of candidates.slice(0, 32)) {
    if (!carveRoom(map, center.x, center.y, 2, encounterRoomId(center))) continue;
    center.object = { type: "chest" };
    placeGuardNear(map, center.x, center.y, true);
    placeGuardNear(map, center.x, center.y, false);
    return true;
  }
  return false;
}

// 在死路位置放置宝箱，鼓励玩家探索分支。
function placeDeadEndTreasure(map) {
  const candidates = interiorCells(map)
    .filter((cell) => canUseTreasureCell(map, cell.x, cell.y) && floorNeighborCount(map, cell.x, cell.y) <= 1)
    .sort((a, b) => treasureScore(map, b) - treasureScore(map, a));
  const cell = candidates[0];
  if (!cell) return false;
  markEncounterArea(map, cell.x, cell.y, 1);
  cell.object = { type: "chest" };
  placeGuardNear(map, cell.x, cell.y, true);
  return true;
}

// 在合适位置放置有守卫保护的宝箱。
function placeGuardedTreasure(map) {
  const candidates = interiorCells(map)
    .filter((cell) => canUseTreasureCell(map, cell.x, cell.y))
    .sort((a, b) => treasureScore(map, b) - treasureScore(map, a));
  const cell = candidates[0];
  if (!cell) return false;
  markEncounterArea(map, cell.x, cell.y, 1);
  cell.object = { type: "chest" };
  placeGuardNear(map, cell.x, cell.y, true);
  return true;
}

// 挖出指定半径的普通房间，可选择绑定 roomId。
function carveRoom(map, cx, cy, radius, roomId = null) {
  if (cx - radius <= 0 || cy - radius <= 0 || cx + radius >= map.length - 1 || cy + radius >= map.length - 1) return false;
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (map[y][x].object) return false;
    }
  }
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      map[y][x].terrain = "floor";
      if (roomId) map[y][x].roomId = roomId;
    }
  }
  return true;
}

// 在目标点附近生成守卫，精英概率由调用方控制。
function placeGuardNear(map, x, y, eliteChance = false) {
  const candidates = cellsWithin(map, x, y, 2)
    .filter((cell) => cell.terrain === "floor" && !cell.object && (cell.x !== x || cell.y !== y))
    .sort((a, b) => distance(a, { x, y }) - distance(b, { x, y }));
  const guard = candidates[0];
  if (!guard) return false;
  guard.object = makeEnemyWithVariant(eliteChance && Math.random() < .35);
  if (guard.roomId) guard.object.roomId = guard.roomId;
  return true;
}

// 在上锁宝箱附近生成必掉钥匙的精英守卫。
function placeKeyGuardianNear(map, x, y) {
  const candidates = cellsWithin(map, x, y, 2)
    .filter((cell) => cell.terrain === "floor" && !cell.object && distance(cell, { x, y }) > 1)
    .sort((a, b) => distance(a, { x, y }) - distance(b, { x, y }));
  const guard = candidates[0];
  if (!guard) return false;
  guard.object = makeKeyGuardian();
  if (guard.roomId) guard.object.roomId = guard.roomId;
  return true;
}

// 为某个房间生成救援任务：放置被困者、怪物和任务发布者。
function placeRescueQuest(map, rooms) {
  const room = rooms
    .map((entry) => ({ ...entry, cells: map.flat().filter((cell) => cell.roomId === entry.id && cell.terrain === "floor" && !cell.object) }))
    .filter((entry) => entry.cells.length >= 5)
    .sort((a, b) => distance(roomCenter(b.cells), { x: 1, y: 1 }) - distance(roomCenter(a.cells), { x: 1, y: 1 }))[0];
  if (!room) return null;
  const prisoner = choice(room.cells);
  prisoner.object = { type: "rescueNpc", npcName: "矿工托兰", questId: "rescueRoom", roomId: room.id };
  const monsterCells = room.cells.filter((cell) => cell !== prisoner).slice(0, 3);
  for (const cell of monsterCells.slice(0, 2 + (state.floor >= 4 ? 1 : 0))) {
    cell.object = makeEnemyWithVariant(Math.random() < .35);
    cell.object.roomId = room.id;
  }
  const giver = placeQuestNpc(map, {
    questId: "rescueRoom",
    npcName: "救援斥候卡尔",
    roomId: room.id,
    roomName: room.name,
    rescueName: "矿工托兰",
    target: monsterCells.filter((cell) => cell.object && ["monster", "elite"].includes(cell.object.type)).length
  });
  if (!giver) {
    prisoner.object = null;
    for (const cell of monsterCells) {
      if (cell.object?.roomId === room.id) cell.object = null;
    }
    return null;
  }
  return giver.object;
}

// 计算一组格子的中心点，用于选择远离入口的任务房。
function roomCenter(cells) {
  const total = cells.reduce((sum, cell) => ({ x: sum.x + cell.x, y: sum.y + cell.y }), { x: 0, y: 0 });
  return { x: total.x / cells.length, y: total.y / cells.length };
}

// 在地图上放置任务 NPC，并给旧版单任务字段保留兼容默认值。
function placeQuestNpc(map, source = { questId: "wardenErrand", npcName: "巡夜人" }) {
  const candidates = interiorCells(map)
    .filter((cell) => cell.terrain === "floor" && !cell.object && distance(cell, { x: 1, y: 1 }) > 4)
    .sort((a, b) => npcScore(map, b) - npcScore(map, a));
  const cell = candidates.find((candidate) => cellsWithin(map, candidate.x, candidate.y, 3).some((nearby) => nearby.roomId)) || candidates[0];
  if (!cell) return false;
  cell.object = { type: "questNpc", targetFloor: nearbyQuestTargetFloor(), ...source };
  state.quest = state.quest || { id: "wardenErrand", floor: state.floor, kills: 0, target: 2, claimed: false };
  return cell;
}

// 偶尔把普通委托目标放到相邻楼层，避免跨层距离过大。
function nearbyQuestTargetFloor(floor = state.floor) {
  if (floor <= 1 || floor % 5 !== 0) return floor;
  return Math.min(MAX_FLOOR - 1, floor + 1);
}

function npcScore(map, cell) {
  const roomBonus = cell.roomId ? 8 : 0;
  const exit = { x: map.length - 2, y: map.length - 2 };
  return roomBonus + Math.min(12, distance(cell, exit)) - floorNeighborCount(map, cell.x, cell.y);
}

function interiorCells(map) {
  return map.flat().filter((cell) => cell.x > 0 && cell.y > 0 && cell.x < map.length - 1 && cell.y < map.length - 1);
}

function canUseTreasureCell(map, x, y) {
  const cell = map[y]?.[x];
  if (!cell || cell.terrain !== "floor" || cell.object) return false;
  if ((x === 1 && y === 1) || (x === map.length - 2 && y === map.length - 2)) return false;
  return true;
}

function treasureScore(map, cell) {
  const start = { x: 1, y: 1 };
  const exit = { x: map.length - 2, y: map.length - 2 };
  return distance(cell, start) + Math.min(8, distance(cell, exit)) - floorNeighborCount(map, cell.x, cell.y);
}

function floorNeighborCount(map, x, y) {
  return cardinalNeighbors(map, x, y).filter((cell) => cell.terrain === "floor").length;
}

function cardinalNeighbors(map, x, y) {
  return [
    map[y - 1]?.[x],
    map[y + 1]?.[x],
    map[y]?.[x - 1],
    map[y]?.[x + 1]
  ].filter(Boolean);
}

function cellsWithin(map, x, y, radius) {
  const cells = [];
  for (let yy = Math.max(1, y - radius); yy <= Math.min(map.length - 2, y + radius); yy++) {
    for (let xx = Math.max(1, x - radius); xx <= Math.min(map.length - 2, x + radius); xx++) {
      if (Math.abs(xx - x) + Math.abs(yy - y) <= radius) cells.push(map[yy][xx]);
    }
  }
  return cells;
}

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function makeEnemyWithVariant(eliteOrBoss = false) {
  const enemy = makeEnemy(eliteOrBoss);
  if (enemy.type === "boss") {
    enemy.variant = "boss";
  } else if (enemy.type === "elite") {
    enemy.variant = "elite";
  } else if (state.floor < 4) {
    enemy.variant = choice(["slime", "rat"]);
  } else if (state.floor < 7) {
    enemy.variant = choice(["bat", "slime"]);
  } else {
    enemy.variant = choice(["wolf", "slime"]);
  }
  maybeApplyEnemyAffix(enemy, eliteOrBoss);
  return enemy;
}

// 给敌人附加战术词缀；精英和特殊守卫必带，普通怪中后期少量出现。
function maybeApplyEnemyAffix(enemy, eliteOrBoss = false) {
  if (enemy.affix) return enemy;
  if (enemy.type === "boss") return enemy;
  const shouldAffix = eliteOrBoss || enemy.roomBoss || (state.floor >= 6 && Math.random() < .18);
  if (!shouldAffix) return enemy;
  const affix = choice(ENEMY_AFFIXES);
  enemy.affix = affix;
  enemy.name = `${affix.name}${enemy.name}`;
  if (affix.id === "armored") {
    enemy.def = Math.round(enemy.def * 1.35 + 2);
    enemy.hp = Math.round(enemy.hp * 1.08);
    enemy.maxHp = enemy.hp;
  }
  if (affix.id === "shatter") enemy.atk = Math.round(enemy.atk * 1.12 + 2);
  if (affix.id === "drain") enemy.atk = Math.round(enemy.atk * 1.06 + 1);
  if (affix.id === "swift") enemy.def = Math.round(enemy.def * 1.08 + 1);
  return enemy;
}

// 生成敌人词缀说明文本。
function enemyAffixText(enemy) {
  return enemy?.affix ? `${enemy.affix.name}：${enemy.affix.desc}` : "";
}

function makeKeyGuardian() {
  const enemy = makeEnemyWithVariant(true);
  enemy.type = "elite";
  enemy.variant = "elite";
  enemy.name = enemy.affix ? `${enemy.affix.name}钥匙守卫` : "钥匙守卫";
  enemy.roomBoss = true;
  enemy.dropsKey = true;
  enemy.hp = Math.ceil(enemy.hp * 1.18);
  enemy.maxHp = enemy.hp;
  enemy.atk += 2;
  enemy.gold += 12;
  return enemy;
}

// 按楼层、精英和 Boss 状态生成怪物数值。
function makeEnemy(eliteOrBoss = false) {
  const floor = state.floor;
  const boss = isFinalFloor(floor);
  const names = floor < 4
    ? ["史莱姆", "洞穴鼠", "骷髅兵"]
    : floor < 7
      ? ["矿洞蝙蝠", "诅咒矿工", "石像守卫"]
      : ["冰霜狼", "寒冰法徒", "冰晶魔像"];
  const elite = eliteOrBoss && !boss;
  const base = 30 + floor * 8 + Math.floor(Math.pow(floor, 1.35) * 2.2);
  const hp = Math.round(boss ? base * 3.2 + 650 : elite ? base * 1.85 : base * (1 + floor * .012));
  const enemy = {
    type: boss ? "boss" : elite ? "elite" : "monster",
    name: boss ? "符文守王" : elite ? `精英${choice(names)}` : choice(names),
    hp,
    maxHp: hp,
    atk: Math.round(boss ? 58 + floor * 2.4 : 9 + floor * 2.45 + Math.floor(floor / 5) + (elite ? 9 : 0)),
    def: Math.round(boss ? 34 + floor * .55 : 4 + floor * .72 + (elite ? 5 : 0)),
    xp: Math.round(boss ? 520 + floor * 14 : 14 + floor * 5.2 + (elite ? 24 : 0)),
    gold: Math.round(boss ? 720 + floor * 18 : rand(9, 18) + floor * 2.6 + (elite ? 22 : 0))
  };
  return maybeApplyEnemyAffix(enemy, eliteOrBoss);
}

// 标记玩家附近当前可见的格子，并把它们永久记为已探索。
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
  if (audioEnabled) initAudio();
  if (state.currentEnemy) return;
  if (dx < 0) state.facing = "left";
  else if (dx > 0) state.facing = "right";
  else if (!["left", "right"].includes(state.facing)) {
    if (dy < 0) state.facing = "up";
    if (dy > 0) state.facing = "down";
  }
  const nx = state.player.x + dx;
  const ny = state.player.y + dy;
  const cell = state.map.cells[ny]?.[nx];
  if (!cell || ["wall", "fence"].includes(cell.terrain)) {
    render();
    return;
  }
  if (isDangerousEnemy(cell.object)) {
    selectedTile = null;
    promptDangerousEnemy(cell.object, { x: nx, y: ny });
    render();
    return;
  }
  if (isBlockingInteraction(cell.object)) {
    selectedTile = null;
    resolveCell(cell);
    render();
    return;
  }
  state.player = { x: nx, y: ny };
  playSound(cell.object ? "danger" : "step");
  selectedTile = null;
  updateVisibility();
  resolveCell(cell);
  render();
}

// 触发玩家所在格子的物件逻辑。
function resolveCell(cell) {
  if (!cell.object) return;
  const obj = cell.object;
  if (["monster", "elite", "boss"].includes(obj.type)) {
    handleEnemyEncounter(obj);
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
  } else if (obj.type === "shop") {
    openMerchant();
  } else if (obj.type === "forge") {
    openForge();
  } else if (obj.type === "questNpc") {
    openQuestNpc(obj);
  } else if (obj.type === "rescueNpc") {
    openRescueNpc(obj);
  } else if (obj.type === "fenceGate") {
    openFenceGate(cell);
  } else if (obj.type === "stairsDown" || obj.type === "portal") {
    nextFloor();
  } else if (obj.type === "stairsUp") {
    previousFloor();
  }
}

// 处理踩到敌人后的进入战斗或危险确认流程。
function handleEnemyEncounter(enemy) {
  log(`遭遇${enemy.name}。`);
  if (!isDangerousEnemy(enemy)) {
    enterBattle(enemy);
    return;
  }
  promptDangerousEnemy(enemy);
}

// 根据敌人类型和战力评估判断是否需要先弹出危险确认。
function isDangerousEnemy(obj) {
  if (!obj) return false;
  if (obj.type === "boss") return true;
  if (obj.roomBoss || obj.dropsKey) return true;
  if (obj.type !== "elite") return false;
  const risk = state?.hp && state?.stats ? battleRisk(obj) : null;
  return risk ? risk.score < .42 : false;
}

// 对危险敌人展示确认弹窗，避免玩家误触进入高风险战斗。
function promptDangerousEnemy(enemy, destination = null) {
  const title = enemy.type === "boss" ? "危险首领" : "危险精英";
  showModal(title, `<p>${enemy.name}散发出危险气息。</p><p>确认进入战斗后将无法移动，建议先检查生命、法力和药水。</p>`, [
    { text: "暂不交战", action: closeModal },
    { text: "进入战斗", action: () => {
      closeModal();
      if (destination) {
        state.player = destination;
        updateVisibility();
      }
      enterBattle(enemy);
    } }
  ]);
}

// 将敌人设置为当前战斗目标，并切换到战斗视图。
function enterBattle(enemy) {
  state.currentEnemy = enemy;
  render();
}

// 触发陷阱伤害，并可能惊动附近守卫进入战斗。
function triggerTrap(cell) {
  playSound("danger");
  const damage = rand(8, 14) + state.floor * 2;
  const alerted = placeGuardNear(state.map.cells, cell.x, cell.y, state.floor >= 4);
  state.hp = Math.max(1, state.hp - damage);
  cell.object = null;
  const guard = alerted ? nearestGuardForTrap(state.map.cells, cell.x, cell.y) : null;
  if (guard) enterBattle(guard.object);
  log(`触发隐藏机关，受到 ${damage} 点伤害${alerted ? "，并惊动了守卫" : ""}。`);
  showEvent("触发机关", `<p>地面机关突然弹起，你受到 ${damage} 点伤害。</p>${alerted ? "<p>机关的响动惊动了附近守卫。</p>" : ""}`, "继续探索");
}

// 查找陷阱附近最近的守卫，用于机关警报后的追击。
function nearestGuardForTrap(map, x, y) {
  return cellsWithin(map, x, y, 2)
    .filter((nearby) => ["monster", "elite"].includes(nearby.object?.type))
    .sort((a, b) => distance(a, { x, y }) - distance(b, { x, y }))[0] || null;
}

// 结算普通宝箱奖励：装备、符文或材料金币。
function openChest(cell) {
  playSound("chest");
  const roll = Math.random();
  let message = "";
  if (roll < .42) {
    const loot = randomEquipment();
    state.inventory.push(loot);
    log(`打开宝箱，获得${loot.name}。`);
    message = `获得装备：${loot.name}`;
  } else if (roll < .72) {
    const rune = choice(RUNES) + "1";
    state.runes[rune] = (state.runes[rune] || 0) + 1;
    log(`打开宝箱，获得${rune}符文。`);
    message = `获得符文：${rune}`;
  } else {
    state.materials["强化石"] = (state.materials["强化石"] || 0) + 1;
    state.gold += rand(15, 40);
    log("打开宝箱，获得金币和强化石。");
    message = "获得金币和强化石";
  }
  cell.object = null;
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
  const gold = rand(25, 55);
  state.inventory.push(loot);
  state.runes[rune] = (state.runes[rune] || 0) + 1;
  state.gold += gold;
  cell.object = null;
  log(`打开上锁宝箱，获得${loot.name}、${rune}符文和 ${gold} 金币。`);
  showEvent("打开上锁宝箱", `<p>消耗 1 把符文钥匙。</p><p>获得装备：${loot.name}<br>获得符文：${rune}<br>金币 +${gold}</p>`, "收下");
}

// 使用符文钥匙打开围住宝箱的门栅。
function openFenceGate(cell) {
  state.keys = state.keys || 0;
  if (state.keys <= 0) {
    log("门栅被符文锁住了，附近守卫或委托人可能知道钥匙线索。");
    showEvent("符文门栅", "<p>铁栅栏围住了宝箱，锁孔里有符文光。先击败钥匙守卫，或向中立委托人完成请求来获得钥匙。</p>", "知道了");
    return;
  }
  cell.object = null;
  cell.terrain = "floor";
  log("符文钥匙照亮门栅，通往宝箱的入口打开了。");
  showEvent("门栅打开", "<p>钥匙的光没有被消耗，真正的锁还在宝箱上。现在可以进入围栏内开箱。</p>", "继续探索");
}

// 打开当前位置的委托人交互。
function openQuestNpc(source = null) {
  openQuestFromGiver("questNpc", source || currentQuestSource("questNpc"));
}

// 读取当前格子上的任务来源物件，供任务弹窗生成动态文案。
function currentQuestSource(type) {
  const obj = state?.map?.cells?.[state.player?.y]?.[state.player?.x]?.object;
  return obj?.type === type ? obj : null;
}

// 根据 NPC 或商人来源合成任务定义，救援任务会补入房间信息。
function questDefFromSource(giver, source = null) {
  const id = source?.questId;
  const base = QUEST_DEFS[id] || questDefinitionsForGiver(giver).find((quest) => quest.type !== "rescueRoom") || questDefinitionsForGiver(giver)[0];
  if (!base) return null;
  if (base.type !== "rescueRoom") return { ...base, targetFloor: source?.targetFloor || state.floor };
  return {
    ...base,
    title: `${source?.roomName || roomName(source?.roomId)}救援`,
    giverName: source?.npcName || base.giverName,
    desc: `${source?.rescueName || "被困者"}被困在${source?.roomName || roomName(source?.roomId)}。清理房间内的怪物后，与被困者交谈确认安全。`,
    target: source?.target || base.target,
    roomId: source?.roomId,
    roomName: source?.roomName || roomName(source?.roomId),
    rescueName: source?.rescueName || "被困者",
    targetFloor: source?.targetFloor || state.floor
  };
}

// 确保旧版单任务字段存在，兼容早期存档结构。
function ensureQuest() {
  if (!state.quest || state.quest.floor !== state.floor) {
    state.quest = { id: "wardenErrand", floor: state.floor, kills: 0, target: 2, claimed: false };
  }
  return state.quest;
}

// 获取某类任务发布者可提供的任务定义。
function questDefinitionsForGiver(giver) {
  return Object.values(QUEST_DEFS).filter((quest) => quest.giver === giver);
}

// 确保新版多任务列表存在，兼容旧存档。
function ensureQuestList() {
  state.quests = Array.isArray(state.quests) ? state.quests : [];
  return state.quests;
}

// 计算任务金币奖励，兼容固定值和按楼层动态计算两种写法。
function questRewardGold(def, floor = state.floor) {
  return typeof def.rewardGold === "function" ? def.rewardGold(floor) : (def.rewardGold || 0);
}

// 根据任务定义创建当前楼层的任务进度状态。
function createQuestState(def, floor = state.floor) {
  return {
    id: def.id,
    giver: def.giver,
    floor,
    targetFloor: def.targetFloor || floor,
    kills: 0,
    target: def.target,
    roomId: def.roomId || null,
    roomName: def.roomName || null,
    rescueName: def.rescueName || null,
    roomCleared: false,
    rescued: false,
    accepted: true,
    completed: false,
    claimed: false
  };
}

// 从任务列表中查找指定楼层、房间的任务状态。
function questState(id, floor = state.floor, roomId = null) {
  return ensureQuestList().find((quest) => quest.id === id && quest.floor === floor && (!roomId || quest.roomId === roomId));
}

// 接受任务并写入任务列表，旧版巡夜人任务同步到 state.quest。
function acceptQuest(id, source = null) {
  const def = source ? questDefFromSource(source.type || "questNpc", source) : QUEST_DEFS[id];
  if (!def) return null;
  let quest = questState(id, state.floor, def.roomId);
  if (!quest) {
    quest = createQuestState(def);
    ensureQuestList().push(quest);
  }
  quest.accepted = true;
  if (id === "wardenErrand") state.quest = quest;
  log(`接受任务：${def.title}。`);
  render();
  return quest;
}

// 打开任务发布者弹窗，展示任务进度、奖励和可执行操作。
function openQuestFromGiver(giver, source = null) {
  const def = questDefFromSource(giver, source);
  if (!def) {
    showEvent("暂无任务", "<p>这里暂时没有新的委托。</p>", "离开");
    return;
  }
  const quest = questState(def.id, state.floor, def.roomId);
  const progress = quest || { ...createQuestState(def), accepted: false };
  const remaining = Math.max(0, def.target - progress.kills);
  const rewardGold = questRewardGold(def, progress.floor);
  const rewardParts = [
    def.rewardKeys ? `符文钥匙 +${def.rewardKeys}` : "",
    rewardGold ? `金币 +${rewardGold}` : "",
    def.rewardPotion ? "小型生命药水 +1" : ""
  ].filter(Boolean).join("<br>");
  const body = `
    <div class="quest-panel">
      <b>${def.giverName}</b>
      <p>${def.desc}</p>
      <small>进度：${progress.kills}/${def.target}${def.targetFloor && def.targetFloor !== progress.floor ? ` · 目标第 ${def.targetFloor} 层` : ""}${def.roomName ? ` · ${def.roomName}` : ""}${remaining ? `，还差 ${remaining} 个。` : progress.completed ? "，可以领取奖励。" : "，去确认被困者安全。"}</small>
      <div class="quest-reward">${rewardParts}</div>
    </div>
  `;
  const actions = [];
  if (!quest) {
    actions.push({ text: "接受任务", action: () => { closeModal(); acceptQuest(def.id, source); } });
  } else if (quest.completed && !quest.claimed) {
    actions.push({ text: "领取奖励", action: () => { closeModal(); claimQuestReward(def.id, def.roomId); } });
  } else {
    actions.push({ text: quest.claimed ? "已领取" : "继续任务", action: closeModal });
  }
  actions.push({ text: "离开", action: closeModal });
  showModal(def.title, body, actions);
}

// 发放任务奖励，并把任务标记为已领取。
function claimQuestReward(id, roomId = null) {
  const quest = questState(id, state.floor, roomId);
  const def = quest?.id === "rescueRoom"
    ? { ...QUEST_DEFS.rescueRoom, roomId: quest.roomId, roomName: quest.roomName, rescueName: quest.rescueName, target: quest.target, giverName: "救援斥候卡尔" }
    : QUEST_DEFS[id];
  if (!def || !quest || !quest.completed || quest.claimed) return;
  const rewardGold = questRewardGold(def, quest.floor);
  quest.claimed = true;
  state.keys = (state.keys || 0) + (def.rewardKeys || 0);
  state.gold += rewardGold;
  if (def.rewardPotion) {
    state.inventory = state.inventory || [];
    state.inventory.push(potion("小型生命药水", "hp", 40));
  }
  log(`完成任务：${def.title}。`);
  showEvent("任务完成", `<p>${def.giverName}交付了报酬。</p><p>${[
    def.rewardKeys ? `符文钥匙 +${def.rewardKeys}` : "",
    rewardGold ? `金币 +${rewardGold}` : "",
    def.rewardPotion ? "小型生命药水 +1" : ""
  ].filter(Boolean).join("<br>")}</p>`, "收下");
  playSound("quest");
  render();
}

// 与救援目标对话，按房间清理状态推进救援任务。
function openRescueNpc(obj) {
  const quest = questState("rescueRoom", state.floor, obj.roomId);
  const name = obj.npcName || "被困者";
  if (!quest?.accepted) {
    showEvent(name, `<p>${name}被困在${roomName(obj.roomId)}，需要先找到救援斥候接下委托。</p>`, "知道了");
    return;
  }
  if (!quest.roomCleared) {
    showEvent(name, `<p>${name}低声提醒：房间里还有怪物。先清理${quest.roomName || roomName(obj.roomId)}。</p>`, "继续");
    return;
  }
  quest.rescued = true;
  quest.completed = true;
  log(`${name}已经安全，回到${quest.giverName || "救援斥候卡尔"}处领取报酬。`);
  playSound("quest");
  showEvent("救援完成", `<p>${name}已经安全。回到救援斥候卡尔处领取报酬。</p>`, "继续");
  render();
}

// 随机生成装备掉落，包含部位、品质、属性和符文槽数量。
function randomEquipment() {
  const slot = choice(SLOTS);
  const quality = qualityRoll();
  const prefix = { weapon: "符刻", armor: "守望", boots: "疾行", ring: "秘银", amulet: "星纹" }[slot];
  const main = slot === "weapon" ? (Math.random() < .5 ? "atk" : "mag")
    : slot === "armor" ? "def"
      : slot === "boots" ? "spd"
        : slot === "ring" ? "luk" : "res";
  const bonus = qualityBonus(quality) + state.floor;
  const stats = { [main]: bonus };
  if (slot === "armor") stats.hp = 8 + state.floor * 3;
  return item(`${quality}${prefix}${SLOT_NAMES[slot]}`, slot, quality, stats, quality === "普通" ? 0 : quality === "优秀" ? 1 : 2);
}

// 抽取装备品质，幸运值和楼层会略微提高高品质概率。
function qualityRoll() {
  const r = Math.random() + state.stats.luk * .004 + Math.min(.12, state.floor * .012);
  if (r > .96) return "传说";
  if (r > .86) return "史诗";
  if (r > .68) return "稀有";
  if (r > .38) return "优秀";
  return "普通";
}

// 把装备品质转换成基础属性预算。
function qualityBonus(quality) {
  return { 普通: 3, 优秀: 5, 稀有: 8, 史诗: 11, 传说: 15 }[quality];
}

// 消耗祭坛格子，恢复玩家部分生命和法力。
function useAltar(cell) {
  playSound("altar");
  const heal = Math.floor(state.maxHp * .24);
  state.hp = Math.min(effectiveMaxHp(), state.hp + heal);
  state.mp = Math.min(effectiveMaxMp(), state.mp + 8);
  cell.object = null;
  log(`符文祭坛恢复了 ${heal} 点生命和少量法力。`);
  showEvent("符文祭坛", `<p>祭坛亮起微光，恢复 ${heal} 点生命和少量法力。</p>`, "继续");
}

// 进入下一层，并恢复少量资源。
function nextFloor() {
  if (state.floor >= MAX_FLOOR) return;
  const stair = currentStairsDown();
  if (stair?.locked) {
    showEvent("楼梯封印", `<p>下行楼梯被符文封住了。</p><p>解除条件：击败第 ${stair.seal?.targetFloor || state.floor} 层的${stair.seal?.targetName || "封印守卫"}。</p>`, "继续探索");
    return;
  }
  saveCurrentFloor();
  state.floor++;
  state.facing = "down";
  enterFloor("down");
  state.hp = Math.min(effectiveMaxHp(), state.hp + 14);
  state.mp = Math.min(effectiveMaxMp(), state.mp + 6);
  log(`进入第 ${state.floor} 层。`);
  saveGame(false);
  showToast(`<p>你沿着下行楼梯抵达第 ${state.floor} 层。</p>`)
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
  state.hp = Math.min(effectiveMaxHp(), state.hp + 5);
  state.mp = Math.min(effectiveMaxMp(), state.mp + 2);
  log(`返回第 ${state.floor} 层。`);
  saveGame(false);
  showToast(`<p>你沿着上行楼梯回到第 ${state.floor} 层。</p>`)
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
function totals() {
  const total = { ...state.stats, hp: 0, mp: 0 };
  for (const eq of Object.values(state.equipment)) {
    if (!eq) continue;
    for (const [key, value] of Object.entries(eq.stats)) total[key] = (total[key] || 0) + value + eq.level;
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

// 结算玩家一次战斗行动，然后触发敌人回合或胜利流程。
function attackEnemy(mode, skill = null) {
  playSound(mode === "skill" ? "cast" : mode === "attack" ? "hit" : "danger");
  const enemy = state.currentEnemy;
  const t = totals();
  let result = "";
  resetBattleFx(mode);
  if (mode === "attack") {
    result = dealDamage(enemy, Math.max(2, t.atk * .92 + t.spd * .12 - enemy.def * .45), "普通攻击");
  } else if (mode === "skill") {
    skill = upgradedSkill(skill);
    if (state.mp < skill.mp) {
      log("法力不足。");
      render();
      return;
    }
    state.mp -= skill.mp;
    result = castSkill(enemy, skill, t);
  } else if (mode === "defend") {
    const block = 7 + t.def;
    state._guard = block;
    setBattleFx("hero", { type: "guard", text: `-${block}`, label: "防御" });
    setBattleFx("center", { type: "guard", text: "防御姿态" });
    result = `你进入防御姿态，准备抵挡 ${block} 点伤害。`;
  }
  log(result);
  if (enemy.hp <= 0) {
    winBattle(enemy);
  } else {
    enemyTurn(enemy);
  }
  render();
}

// 战斗中使用药水，喝药后敌人会立刻行动。
function useBattlePotion(id) {
  const enemy = state.currentEnemy;
  if (!enemy) {
    useItem(id);
    return;
  }
  const index = state.inventory.findIndex((entry) => entry.id === id);
  const entry = state.inventory[index];
  if (!entry || entry.kind !== "potion") return;
  const isHp = entry.effect === "hp";
  const before = isHp ? state.hp : state.mp;
  if (isHp) state.hp = Math.min(effectiveMaxHp(), state.hp + entry.amount);
  else state.mp = Math.min(effectiveMaxMp(), state.mp + entry.amount);
  const after = isHp ? state.hp : state.mp;
  state.inventory.splice(index, 1);
  playSound("altar");
  resetBattleFx("item");
  setBattleFx("hero", { type: "shield", text: `+${Math.max(0, Math.round(after - before))}`, label: entry.name });
  setBattleFx("center", { type: "guard", text: "补给行动" });
  log(`战斗中使用${entry.name}，恢复 ${Math.max(0, Math.round(after - before))} 点${isHp ? "生命" : "法力"}。`);
  enemyTurn(enemy);
  render();
}

// 计算暴击并扣除敌人生命，同时返回战斗日志文本。
function dealDamage(enemy, amount, label) {
  if (enemy.affix?.id === "swift" && Math.random() < .12) {
    setBattleFx("enemy", { type: "evade", text: "闪避", label });
    return `${enemy.name}借迅捷身法避开了${label}。`;
  }
  const crit = Math.random() < (0.06 + totals().luk * .008);
  const damage = Math.max(1, Math.round(amount * (crit ? 1.7 : 1)));
  enemy.hp = Math.max(0, Math.round(enemy.hp - damage));
  setBattleFx("enemy", { type: crit ? "crit" : "hit", text: `-${damage}`, label });
  return `${label}${crit ? "暴击" : ""}，造成 ${damage} 点伤害。`;
}

// 执行职业技能效果，例如护盾、中毒、灼烧或连射。
function castSkill(enemy, skill, t) {
  if (skill.type === "guard") {
    state._guard = 12 + t.def;
    const damage = Math.round(t.atk * skill.power);
    enemy.hp = Math.max(0, Math.round(enemy.hp - damage));
    setBattleFx("hero", { type: "guard", text: `-${state._guard}`, label: "格挡" });
    setBattleFx("enemy", { type: "hit", text: `-${damage}`, label: skill.name });
    return `格挡反击，造成 ${damage} 点伤害。`;
  }
  if (skill.type === "shield") {
    state._guard = 18 + t.mag;
    setBattleFx("hero", { type: "shield", text: `+${state._guard}`, label: skill.name });
    setBattleFx("center", { type: "shield", text: "护盾展开" });
    return `奥术护盾展开，抵挡 ${state._guard} 点伤害。`;
  }
  if (skill.type === "evade") {
    state._evade = true;
    setBattleFx("hero", { type: "evade", text: "闪避", label: skill.name });
    setBattleFx("center", { type: "evade", text: "拉开距离" });
    return "你拉开距离，下回合更容易闪避。";
  }
  if (skill.type === "double") {
    const d1 = dealDamage(enemy, t.atk * skill.power, "第一箭");
    const d2 = dealDamage(enemy, t.atk * skill.power, "第二箭");
    return `${d1} ${d2}`;
  }
  const base = skill.scale === "mag" ? t.mag : t.atk;
  const text = dealDamage(enemy, base * skill.power + state.floor * 2, skill.name);
  if (["burn", "poison"].includes(skill.type)) {
    const extra = 5 + state.floor;
    enemy.hp = Math.max(0, Math.round(enemy.hp - extra));
    setBattleFx("enemy", { type: skill.type, text: `-${extra}`, label: skill.name });
  }
  if (skill.type === "weaken") enemy.atk = Math.max(1, enemy.atk - 3);
  if (skill.type === "slow") enemy.atk = Math.max(1, enemy.atk - 2);
  return text;
}

// 结算敌人攻击回合，包含闪避、防御减伤和死亡检测。
function enemyTurn(enemy) {
  const t = totals();
  const dodge = Math.random() < (t.spd * .006 + (state._evade ? .35 : 0));
  state._evade = false;
  if (dodge) {
    setBattleFx("hero", { type: "evade", text: "闪避", label: enemy.name });
    log(`${enemy.name}的攻击落空。`);
    return;
  }
  let damage = Math.max(1, Math.round(enemy.atk * 1.08 - t.def * .36 - t.res * .08));
  if (state._guard) {
    const guard = enemy.affix?.id === "shatter" ? Math.ceil(state._guard * .45) : state._guard;
    damage = Math.max(0, damage - guard);
    state._guard = 0;
  }
  state.hp -= damage;
  if (enemy.affix?.id === "drain" && damage > 0) {
    const heal = Math.max(1, Math.round(damage * .22));
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + heal);
  }
  setBattleFx("hero", { type: "hit", text: `-${damage}`, label: enemy.name });
  log(`${enemy.name}反击，造成 ${damage} 点伤害。`);
  if (state.hp <= 0) death();
}

function skillLevel(id) {
  return state.skillLevels?.[id] || 0;
}

function skillById(id) {
  return CLASSES[state.classId].skills.find((skill) => skill.id === id);
}

function upgradedSkill(skill) {
  const level = skillLevel(skill.id);
  return {
    ...skill,
    level,
    mp: skill.mp + Math.floor(level / 3),
    power: Number((skill.power * (1 + level * .1)).toFixed(2))
  };
}

function skillUpgradeCost(skillId) {
  const nextLevel = skillLevel(skillId) + 1;
  return { points: 1, dust: nextLevel };
}

function canUpgradeSkill(skillId) {
  const cost = skillUpgradeCost(skillId);
  return (state.skillPoints || 0) >= cost.points && (state.skillDust || 0) >= cost.dust;
}

// 完成战斗结算：发放奖励、清除敌人格子，并检查 Boss 通关。
function winBattle(enemy) {
  state.gold += enemy.gold;
  state.xp += enemy.xp;
  log(`击败${enemy.name}，获得 ${enemy.xp} 经验和 ${enemy.gold} 金币。`);
  const cell = state.map.cells[state.player.y][state.player.x];
  cell.object = null;
  state.currentEnemy = null;
  const rewards = [
    `经验 +${enemy.xp}`,
    `金币 +${enemy.gold}`
  ];
  recordQuestKill(enemy, rewards);
  completeStairSeal(enemy, rewards);
  rewards.push(...maybeDrop(enemy));
  const levelBefore = state.level;
  while (state.xp >= state.xpNext) levelUp();
  if (state.level > levelBefore) rewards.push(`等级提升到 Lv.${state.level}`);
  if (enemy.type === "boss") {
    showModal("通关", `<p>第 ${MAX_FLOOR} 层的符文守王倒下了，地牢深处的王座重新安静下来。</p>${battleResultList(rewards)}`, [
      { text: "继续整理装备", action: closeModal }
    ]);
  } else {
    showModal(`击败 ${enemy.name}`, `<p>战斗结束，你清点了这次收获。</p>${battleResultList(rewards)}`, [
      { text: "收下", action: closeModal }
    ]);
  }
}

// 击败封印守卫后解除当前楼层下行楼梯封印。
function completeStairSeal(enemy, rewards = []) {
  if (!enemy?.sealId || !state?.map?.cells) return false;
  const stairCell = state.map.cells.flat()
    .find((cell) => cell.object?.type === "stairsDown" && cell.object?.sealId === enemy.sealId);
  if (!stairCell?.object?.locked) return false;
  stairCell.object.locked = false;
  stairCell.object.seal.completed = true;
  log("下行楼梯的符文封印解除了。");
  rewards.push("下行楼梯封印已解除");
  return true;
}

function recordQuestKill(enemy, rewards = []) {
  if (!enemy || enemy.type === "boss") return;
  for (const quest of ensureQuestList()) {
    if (!quest.accepted || quest.claimed || quest.completed || (quest.targetFloor || quest.floor) !== state.floor) continue;
    const def = QUEST_DEFS[quest.id];
    if (!def) continue;
    if (def.type === "rescueRoom" && enemy.roomId !== quest.roomId) continue;
    quest.kills++;
    if (quest.kills >= quest.target) {
      quest.kills = quest.target;
      if (def.type === "rescueRoom") {
        quest.roomCleared = true;
        log(`${quest.roomName || roomName(quest.roomId)}已经清理，去确认${quest.rescueName || "被困者"}安全。`);
        rewards.push(`${quest.roomName || "目标房间"}已清理`);
        rewards.push(`去找${quest.rescueName || "被困者"}`);
        continue;
      }
      quest.completed = true;
      log(`${def.title}完成了，回到${def.giverName}处领取奖励。`);
      rewards.push(`${def.title} ${quest.kills}/${quest.target}`);
      rewards.push(`回${def.giverName}处领取奖励`);
    } else {
      rewards.push(`${def.title} ${quest.kills}/${quest.target}`);
    }
  }
}

// 抽取战斗后的钥匙、材料、技能尘、装备和符文掉落。
function maybeDrop(enemy) {
  const drops = [];
  if (enemy.dropsKey || enemy.type === "boss") {
    state.keys = (state.keys || 0) + 1;
    log(`${enemy.name}掉落了符文钥匙。`);
    drops.push("符文钥匙 +1");
  }
  if (enemy.roomBoss || enemy.type === "boss") {
    state.materials["首领印记"] = (state.materials["首领印记"] || 0) + 1;
    drops.push("首领印记 +1");
  }
  const dustChance = enemy.type === "boss" ? 1 : enemy.type === "elite" ? .85 : .32;
  if (Math.random() < dustChance) {
    const dust = enemy.type === "boss" ? 5 : enemy.type === "elite" ? 2 : 1;
    state.skillDust = (state.skillDust || 0) + dust;
    log(`获得 ${dust} 点技能尘。`);
    drops.push(`技能尘 +${dust}`);
  }
  const equipmentChance = Math.min(.72, .34 + state.floor * .035);
  if (Math.random() < equipmentChance || enemy.type !== "monster") {
    const loot = randomEquipment();
    state.inventory.push(loot);
    log(`${enemy.name}掉落了${loot.name}。`);
    drops.push(`装备：${loot.name}`);
  }
  if (Math.random() < Math.min(.62, .28 + state.floor * .025)) {
    const rune = choice(RUNES) + "1";
    state.runes[rune] = (state.runes[rune] || 0) + 1;
    log(`获得${rune}符文。`);
    drops.push(`符文：${rune}`);
  }
  if (!drops.length) drops.push("未发现额外掉落");
  return drops;
}

function battleResultList(rewards) {
  return `<ul class="reward-list">${rewards.map((reward) => `<li>${reward}</li>`).join("")}</ul>`;
}

// 提升等级，发放属性点和技能点，并刷新生命法力。
function levelUp() {
  state.xp -= state.xpNext;
  state.level++;
  state.xpNext = Math.round(state.xpNext * 1.28 + 12);
  state.statPoints++;
  state.skillPoints = (state.skillPoints || 0) + 1;
  state.maxHp += 8;
  state.maxMp += 4;
  state.hp = effectiveMaxHp();
  state.mp = effectiveMaxMp();
  log(`升级到 Lv.${state.level}，获得 1 点属性点和 1 点技能点。`);
}

// 处理战败：不删除存档，扣除少量金币并回到本层入口。
function death() {
  state.hp = Math.ceil(effectiveMaxHp() * .55);
  state.mp = Math.ceil(effectiveMaxMp() * .45);
  state.gold = Math.max(0, state.gold - Math.ceil(state.gold * .15));
  state.currentEnemy = null;
  generateFloor();
  log("你被击倒，被传送回本层入口，损失了少量金币。");
}

// 对低风险战斗执行一键结算，实际仍复用普通攻击/技能流程。
function autoBattle() {
  const enemy = state.currentEnemy;
  const policy = autoBattlePolicy(enemy);
  if (!policy.allowed) {
    showEvent("一键战斗评估", `<p>${enemy.name} 当前评估为${policy.label}，胜率约 ${Math.round(policy.score * 100)}%。${policy.reason}，建议手动战斗。</p>`, "知道了");
    return;
  }
  showModal("一键战斗评估", `<p>${enemy.name} 当前评估为${policy.label}，胜率约 ${Math.round(policy.score * 100)}%。</p><p>自动战斗只会尝试 3 回合，生命或法力跌破安全线会中止。</p>`, [
    { text: "取消", action: closeModal },
    { text: "开始一键战斗", action: () => { closeModal(); executeAutoBattle(); } }
  ]);
}

function executeAutoBattle() {
  let rounds = 0;
  while (state.currentEnemy && state.hp > 0 && rounds < 3 && autoBattlePolicy(state.currentEnemy).allowed) {
    const bestSkill = CLASSES[state.classId].skills.find((skill) => state.mp >= upgradedSkill(skill).mp && skill.type !== "evade");
    attackEnemy(bestSkill ? "skill" : "attack", bestSkill || null);
    rounds++;
  }
}

// 一键战斗准入策略：只允许资源充足时清理低风险普通怪。
function autoBattlePolicy(enemy) {
  if (!enemy) return { allowed: false, score: 0, label: "未知", reason: "没有可结算的敌人" };
  const risk = battleRisk(enemy);
  const hpMax = safeEffectiveMaxHp();
  const mpMax = safeEffectiveMaxMp();
  if (enemy.type !== "monster" || enemy.roomBoss) {
    return { ...risk, allowed: false, reason: "精英、首领和守卫需要手动处理" };
  }
  if (enemy.affix) {
    return { ...risk, allowed: false, reason: "带词缀敌人需要手动判断" };
  }
  if (state.hp / hpMax < .65) {
    return { ...risk, allowed: false, reason: "生命低于安全线" };
  }
  if (state.mp / mpMax < .3) {
    return { ...risk, allowed: false, reason: "法力低于安全线" };
  }
  if (risk.score < .78) {
    return { ...risk, allowed: false, reason: "胜率没有达到安全扫荡线" };
  }
  return { ...risk, allowed: true, reason: "风险较低" };
}

// 兼容测试和老存档中缺少装备结构的场景，安全获取生命上限。
function safeEffectiveMaxHp() {
  return state.equipment ? effectiveMaxHp() : state.maxHp;
}

// 兼容测试和老存档中缺少装备结构的场景，安全获取法力上限。
function safeEffectiveMaxMp() {
  return state.equipment ? effectiveMaxMp() : state.maxMp;
}

// 根据玩家和敌人的综合强度估算战斗风险。
function battleRisk(enemy) {
  const t = totals();
  const heroPower = state.hp + state.mp * .35 + t.atk * 7 + t.mag * 6 + t.def * 6 + t.spd * 4;
  const enemyPower = enemy.hp * 1.08 + enemy.atk * 12 + enemy.def * 8;
  const score = heroPower / (heroPower + enemyPower);
  const label = score >= .75 ? "碾压" : score >= .64 ? "优势" : score >= .55 ? "均势" : score >= .42 ? "危险" : "致命";
  return { score, label };
}

// 消耗一个待分配属性点并提升指定基础属性。
function addStat(key) {
  if (state.statPoints <= 0) return;
  state.stats[key]++;
  state.statPoints--;
  if (key === "def") state.maxHp += 4;
  if (key === "res") state.maxMp += 3;
  render();
}

function confirmAddStat(key) {
  if (state.statPoints <= 0) return;
  openStatAllocator(key);
}

function openStatAllocator(preferredKey = "atk") {
  statDraft = {
    points: state.statPoints,
    stats: Object.fromEntries(Object.keys(STAT_NAMES).map((key) => [key, 0]))
  };
  adjustStatDraft(preferredKey, 1, false);
  renderStatAllocator();
}

function adjustStatDraft(key, delta, redraw = true) {
  if (!statDraft) return;
  const next = (statDraft.stats[key] || 0) + delta;
  if (next < 0) return;
  const used = Object.values(statDraft.stats).reduce((sum, value) => sum + value, 0);
  if (delta > 0 && used >= statDraft.points) return;
  statDraft.stats[key] = next;
  if (redraw) renderStatAllocator();
}

function renderStatAllocator() {
  const used = Object.values(statDraft.stats).reduce((sum, value) => sum + value, 0);
  const left = statDraft.points - used;
  showModal("分配属性点", `
    <div class="stat-allocator">
      <div class="allocator-summary">剩余 <b>${left}</b> / ${statDraft.points}</div>
      ${Object.entries(STAT_NAMES).map(([key, name]) => {
        const extra = key === "def" ? "生命上限 +4" : key === "res" ? "法力上限 +3" : "";
        return `<div class="allocator-row">
          <div><b>${name}</b><small>当前 ${state.stats[key] || 0}${extra ? ` · ${extra}` : ""}</small></div>
          <div class="stepper">
            <button type="button" onclick="adjustStatDraft('${key}', -1)">-</button>
            <span>${statDraft.stats[key] || 0}</span>
            <button type="button" ${left <= 0 ? "disabled" : ""} onclick="adjustStatDraft('${key}', 1)">+</button>
          </div>
        </div>`;
      }).join("")}
    </div>
  `, [
    { text: "取消", action: closeModal },
    { text: "保存分配", action: applyStatDraft }
  ]);
}

function applyStatDraft() {
  if (!statDraft) return;
  const beforeHpMax = effectiveMaxHp();
  const beforeMpMax = effectiveMaxMp();
  for (const [key, value] of Object.entries(statDraft.stats)) {
    if (!value) continue;
    state.stats[key] = (state.stats[key] || 0) + value;
    if (key === "def") state.maxHp += value * 4;
    if (key === "res") state.maxMp += value * 3;
    state.statPoints -= value;
  }
  adjustVitalsForMaxChange(beforeHpMax, beforeMpMax);
  log("保存属性点分配。");
  closeModal();
  render();
}

// 判断当前物件是否会阻挡移动，必须先交互才能继续。
function isBlockingInteraction(obj) {
  if (!obj) return false;
  if (["shop", "forge", "questNpc", "rescueNpc", "fenceGate"].includes(obj.type)) return true;
  if (obj.type === "lockedChest") return (state.keys || 0) <= 0;
  return false;
}

// 装备背包中的物品，并把原装备放回背包。
function equipItem(id) {
  const index = state.inventory.findIndex((entry) => entry.id === id);
  const entry = state.inventory[index];
  if (!entry || entry.kind !== "equip") return;
  const beforeHpMax = effectiveMaxHp();
  const beforeMpMax = effectiveMaxMp();
  const old = state.equipment[entry.slot];
  state.equipment[entry.slot] = entry;
  state.inventory.splice(index, 1);
  if (old) state.inventory.push(old);
  adjustVitalsForMaxChange(beforeHpMax, beforeMpMax);
  log(`装备了${entry.name}。`);
  render();
}

function confirmEquipItem(id) {
  const entry = state.inventory.find((item) => item.id === id);
  if (!entry) return;
  showConfirm("装备确认", `<p>要装备 ${entry.name} 吗？当前同部位装备会放回背包。</p>${equipmentCompareText(entry)}`, "装备", () => equipItem(id));
}

// 计算装备出售价格，评分和强化等级越高价格越高。
function equipmentSellValue(entry) {
  return Math.max(6, Math.round(itemScore(entry) * .55 + (entry.level || 0) * 8));
}

// 计算装备分解收益，用于产出魔尘和少量强化石。
function equipmentSalvageValue(entry) {
  const qualityDust = { 普通: 1, 优秀: 1, 稀有: 2, 史诗: 3, 传说: 4 }[entry.quality] || 1;
  const stones = entry.level > 0 || ["史诗", "传说"].includes(entry.quality) ? 1 : 0;
  return { dust: qualityDust + Math.floor((entry.level || 0) / 2), stones };
}

// 判断玩家是否位于商人身边，出售装备必须满足该条件。
function canSellEquipmentHere() {
  if (!state?.map?.cells || !state.player) return false;
  const here = state.map.cells[state.player.y]?.[state.player.x];
  if (here?.object?.type === "shop") return true;
  return cardinalNeighbors(state.map.cells, state.player.x, state.player.y)
    .some((cell) => cell.object?.type === "shop");
}

// 出售背包装备，只有在商人附近才允许执行。
function sellEquipment(id) {
  if (!canSellEquipmentHere()) {
    showEvent("需要商人", "<p>售出装备需要在商人身边进行。分解装备可以随时操作。</p>", "知道了");
    return;
  }
  const index = state.inventory.findIndex((entry) => entry.id === id && entry.kind === "equip");
  const entry = state.inventory[index];
  if (!entry) return;
  const gold = equipmentSellValue(entry);
  state.inventory.splice(index, 1);
  state.gold = (state.gold || 0) + gold;
  playSound("sell");
  log(`售出${entry.name}，获得 ${gold} 金币。`);
  render();
}

// 分解背包装备，随时可执行并产出强化/技能相关材料。
function disassembleEquipment(id) {
  const index = state.inventory.findIndex((entry) => entry.id === id && entry.kind === "equip");
  const entry = state.inventory[index];
  if (!entry) return;
  const reward = equipmentSalvageValue(entry);
  state.inventory.splice(index, 1);
  state.materials["魔尘"] = (state.materials["魔尘"] || 0) + reward.dust;
  if (reward.stones) state.materials["强化石"] = (state.materials["强化石"] || 0) + reward.stones;
  playSound("sell");
  log(`分解${entry.name}，获得魔尘 ${reward.dust}${reward.stones ? `、强化石 ${reward.stones}` : ""}。`);
  render();
}

function confirmSellEquipment(id) {
  const entry = state.inventory.find((item) => item.id === id && item.kind === "equip");
  if (!entry) return;
  if (!canSellEquipmentHere()) {
    showEvent("需要商人", "<p>售出装备需要在商人身边进行。分解装备可以随时操作。</p>", "知道了");
    return;
  }
  showConfirm("售出装备", `<p>售出 ${entry.name}，获得 ${equipmentSellValue(entry)} 金币。</p>`, "售出", () => sellEquipment(id));
}

function confirmDisassembleEquipment(id) {
  const entry = state.inventory.find((item) => item.id === id && item.kind === "equip");
  if (!entry) return;
  const reward = equipmentSalvageValue(entry);
  showConfirm("分解装备", `<p>分解 ${entry.name}，获得魔尘 ${reward.dust}${reward.stones ? `、强化石 ${reward.stones}` : ""}。</p>`, "分解", () => disassembleEquipment(id));
}

// 拆下指定槽位装备，并同步修正生命法力上限变化。
function unequipItem(slot) {
  const eq = state.equipment[slot];
  if (!eq) return;
  const beforeHpMax = effectiveMaxHp();
  const beforeMpMax = effectiveMaxMp();
  state.equipment[slot] = null;
  state.inventory.push(eq);
  adjustVitalsForMaxChange(beforeHpMax, beforeMpMax);
  log(`拆下了${eq.name}。`);
  render();
}

// 装备变化后按上限差值调整当前生命和法力，避免异常溢出。
function adjustVitalsForMaxChange(beforeHpMax, beforeMpMax) {
  const hpMax = effectiveMaxHp();
  const mpMax = effectiveMaxMp();
  state.hp = clampVital((state.hp || 0) + hpMax - beforeHpMax, hpMax);
  state.mp = clampVital((state.mp || 0) + mpMax - beforeMpMax, mpMax);
}

function clampVital(value, max) {
  return Math.max(1, Math.min(max, value));
}

function canUnequipSlot(slot) {
  return !!state.equipment[slot];
}

function confirmUnequip(slot) {
  const eq = state.equipment[slot];
  if (!eq) return;
  showConfirm("拆下装备", `<p>要拆下 ${eq.name} 吗？装备会放回背包。</p>`, "拆下", () => unequipItem(slot));
}

// 使用背包中的消耗品药水。
function useItem(id) {
  const index = state.inventory.findIndex((entry) => entry.id === id);
  const entry = state.inventory[index];
  if (!entry) return;
  if (entry.kind === "teleport") {
    openTeleportBeacon(id);
    return;
  }
  if (entry.kind !== "potion") return;
  if (entry.effect === "hp") state.hp = Math.min(effectiveMaxHp(), state.hp + entry.amount);
  if (entry.effect === "mp") state.mp = Math.min(effectiveMaxMp(), state.mp + entry.amount);
  state.inventory.splice(index, 1);
  log(`使用${entry.name}。`);
  render();
}

function confirmUseItem(id) {
  const entry = state.inventory.find((item) => item.id === id);
  if (!entry) return;
  if (entry.kind === "teleport") {
    openTeleportBeacon(id);
    return;
  }
  showConfirm("使用确认", `<p>要使用 ${entry.name} 吗？</p><p>效果：恢复 ${entry.amount} 点${entry.effect === "hp" ? "生命" : "法力"}。</p>`, "使用", () => useItem(id));
}

// 打开商路信标传送列表，只显示已探索楼层中的商人、NPC 和合成台。
function openTeleportBeacon(id) {
  const targets = knownTeleportTargets();
  if (!targets.length) {
    showEvent("商路信标", "<p>暂时没有可传送目标。探索到商人、委托人或合成台后再使用。</p>", "知道了");
    return;
  }
  window._teleportTargets = targets;
  showModal("商路信标", `
    <div class="quest-list">
      ${targets.slice(0, 8).map((target, index) => `<article class="quest-row"><div><b>${target.label}</b><small>第 ${target.floor} 层 · ${target.roomName || "已探索区域"}</small></div><button type="button" onclick="teleportAction('${id}', ${index})">传送</button></article>`).join("")}
    </div>
  `, [
    { text: "取消", action: closeModal }
  ]);
}

// 收集当前楼层和楼层缓存中可作为传送目标的已探索设施。
function knownTeleportTargets() {
  const targets = [];
  const addFromMap = (floor, map) => {
    if (!map?.cells) return;
    for (const cell of map.cells.flat()) {
      if (!cell.seen || !["shop", "questNpc", "rescueNpc", "forge"].includes(cell.object?.type)) continue;
      const landing = landingNear(map, cell.x, cell.y);
      if (!landing) continue;
      targets.push({
        floor: Number(floor),
        x: cell.x,
        y: cell.y,
        landing,
        label: teleportTargetLabel(cell.object),
        roomName: cell.roomId ? roomNameFromMap(map, cell.roomId) : ""
      });
    }
  };
  addFromMap(state.floor, state.map);
  for (const [floor, saved] of Object.entries(state.floorStates || {})) addFromMap(floor, saved.map);
  return targets.sort((a, b) => Math.abs(a.floor - state.floor) - Math.abs(b.floor - state.floor));
}

// 为传送目标寻找可落脚的相邻格，避免直接站到阻挡型 NPC 或设施上。
function landingNear(map, x, y) {
  const origin = map.cells[y]?.[x];
  const candidates = [origin, ...cardinalNeighbors(map.cells, x, y)];
  return candidates.find((cell) => cell && ["floor", "door"].includes(cell.terrain) && !isBlockingInteraction(cell.object)) || null;
}

// 生成传送目标展示名。
function teleportTargetLabel(obj) {
  if (obj.type === "shop") return "商人";
  if (obj.type === "forge") return "合成台";
  return obj.npcName || (obj.type === "rescueNpc" ? "被困者" : "委托人");
}

// 从指定地图对象中查找房间名，避免跨楼层读取当前 state.map。
function roomNameFromMap(map, roomId) {
  return map?.rooms?.find((room) => room.id === roomId)?.name || "未知房间";
}

// 弹窗按钮回调：按下标执行传送。
function teleportAction(id, index) {
  teleportToTarget(id, window._teleportTargets?.[index]);
}

// 消耗商路信标并传送到目标楼层的目标附近。
function teleportToTarget(id, target) {
  if (!target) return;
  const index = state.inventory.findIndex((entry) => entry.id === id && entry.kind === "teleport");
  if (index < 0) return;
  saveCurrentFloor();
  if (target.floor !== state.floor) {
    const saved = state.floorStates?.[target.floor];
    if (!saved?.map) return;
    state.floor = target.floor;
    state.map = cloneFloorMap(saved.map);
  }
  state.player = { ...target.landing };
  state.inventory.splice(index, 1);
  updateVisibility();
  log(`商路信标将你传送到第 ${state.floor} 层的${target.label}附近。`);
  closeModal();
  render();
}

// 将三个同名同级符文合成为下一级符文。
function craftRune(name) {
  if ((state.runes[name] || 0) < 3) return;
  const level = Number(name.slice(-1));
  const base = name.slice(0, -1);
  state.runes[name] -= 3;
  const next = base + (level + 1);
  state.runes[next] = (state.runes[next] || 0) + 1;
  log(`合成${next}符文。`);
  render();
}

function confirmCraftRune(name) {
  if ((state.runes[name] || 0) < 3) return;
  const level = Number(name.slice(-1));
  const base = name.slice(0, -1);
  showConfirm("合成确认", `<p>消耗 3 个 ${name}，合成 1 个 ${base + (level + 1)} 符文。</p>`, "合成", () => craftRune(name));
}

// 消耗金币和强化石强化已装备物品。
function enhance(slot) {
  const eq = state.equipment[slot];
  if (!canEnhance(slot)) return;
  state.materials["强化石"]--;
  state.gold -= 20;
  eq.level++;
  log(`${eq.name}强化到 +${eq.level}。`);
  render();
}

function confirmEnhance(slot) {
  const eq = state.equipment[slot];
  if (!canEnhance(slot)) return;
  showConfirm("锻造强化", `<p>在合成台消耗 20 金币和 1 个强化石，将 ${eq.name} 强化到 +${eq.level + 1}。</p>`, "强化", () => enhance(slot));
}

function canEnhance(slot) {
  const eq = state.equipment[slot];
  return !!eq && (state.materials["强化石"] || 0) > 0 && state.gold >= 20;
}

function enhanceDisabledReason(slot) {
  const eq = state.equipment[slot];
  if (!eq) return "未装备";
  if ((state.materials["强化石"] || 0) <= 0) return "缺少强化石";
  if (state.gold < 20) return "金币不足";
  return "";
}

// 消耗技能点和技能尘提升指定技能等级。
function upgradeSkill(skillId) {
  if (!canUpgradeSkill(skillId)) return;
  const cost = skillUpgradeCost(skillId);
  state.skillPoints -= cost.points;
  state.skillDust -= cost.dust;
  state.skillLevels[skillId] = skillLevel(skillId) + 1;
  const skill = skillById(skillId);
  log(`${skill.name}提升到 Lv.${state.skillLevels[skillId]}。`);
  render();
}

function confirmUpgradeSkill(skillId) {
  const skill = skillById(skillId);
  if (!skill || !canUpgradeSkill(skillId)) return;
  const cost = skillUpgradeCost(skillId);
  const next = upgradedSkill({ ...skill, id: skill.id });
  const currentLevel = skillLevel(skillId);
  const nextPower = Number((skill.power * (1 + (currentLevel + 1) * .14)).toFixed(2));
  const nextMp = Math.max(1, skill.mp - Math.floor((currentLevel + 1) / 2));
  showConfirm(
    "技能升级确认",
    `<p>消耗 ${cost.points} 点技能点和 ${cost.dust} 点技能尘，将 ${skill.name} 升到 Lv.${currentLevel + 1}。</p><p>倍率 ${next.power} → ${nextPower}，耗蓝 ${next.mp} → ${nextMp}。</p>`,
    "升级",
    () => upgradeSkill(skillId)
  );
}

// 在商人处购买基础消耗品。
function buy(kind) {
  let bought = false;
  if (kind === "hp" && state.gold >= 25) {
    state.gold -= 25;
    state.inventory.push(potion("小型生命药水", "hp", 40));
    log("购买小型生命药水。");
    bought = true;
  }
  if (kind === "mp" && state.gold >= 25) {
    state.gold -= 25;
    state.inventory.push(potion("小型法力药水", "mp", 25));
    log("购买小型法力药水。");
    bought = true;
  }
  if (kind === "beacon" && state.gold >= 80) {
    state.gold -= 80;
    state.inventory.push(teleportBeacon());
    log("购买商路信标。");
    bought = true;
  }
  if (!bought) log("金币不足，交易没有完成。");
  render();
}

// 打开商人主弹窗，商人既能交易也可能提供任务。
function openMerchant() {
  const hasTask = questDefinitionsForGiver("shop").length > 0;
  if (!hasTask) {
    openMerchantShop();
    return;
  }
  showModal("流动商队", `
    <div class="merchant-panel">
      <div class="merchant-hero">
        <div class="merchant-portrait">${sprite("merchant", ASSETS.shop, "商人")}</div>
        <div class="merchant-copy">
          <b>流动补给</b>
          <small>商人拦住去路，既能交易，也有需要冒险者处理的路面麻烦。</small>
        </div>
      </div>
    </div>
  `, [
    { text: "打开商店", action: openMerchantShop },
    { text: "查看任务", action: () => openQuestFromGiver("shop") },
    { text: "离开", action: closeModal }
  ]);
}

// 打开商店商品和装备分解列表。
function openMerchantShop() {
  const salvageRows = merchantSalvageRows();
  showModal("流动商队", `
    <div class="merchant-panel">
      <div class="merchant-hero">
        <div class="merchant-portrait">${sprite("merchant", ASSETS.shop, "商人")}</div>
        <div class="merchant-copy">
          <b>流动补给</b>
          <small>金币 ${state.gold}。商人挡住去路，交易后可从旁边绕行。</small>
        </div>
      </div>
      <div class="merchant-goods">
        <button type="button" onclick="confirmBuy('hp')"><span>小型生命药水</span><small>恢复 40 HP · 25 金币</small></button>
        <button type="button" onclick="confirmBuy('mp')"><span>小型法力药水</span><small>恢复 25 MP · 25 金币</small></button>
        <button type="button" onclick="confirmBuy('beacon')"><span>商路信标</span><small>传送到已探索设施 · 80 金币</small></button>
      </div>
      <div class="merchant-salvage-list">
        <b>装备分解</b>
        ${salvageRows}
      </div>
    </div>
  `, [
    { text: "离开", action: closeModal }
  ]);
}

function merchantSalvageRows() {
  const equipment = (state.inventory || []).filter((entry) => entry.kind === "equip");
  if (!equipment.length) return `<p>暂无可分解装备。</p>`;
  return equipment.map((entry) => {
    const reward = equipmentSalvageValue(entry);
    const rewardText = `魔尘 ${reward.dust}${reward.stones ? ` · 强化石 ${reward.stones}` : ""}`;
    return `<div class="merchant-salvage-row"><span>${entry.name}<small>${rewardText}</small></span><button type="button" onclick="confirmDisassembleEquipment('${entry.id}')">分解</button></div>`;
  }).join("");
}

// 打开合成台弹窗，集中展示可强化装备和缺失材料原因。
function openForge() {
  const rows = SLOTS.map((slot) => {
    const eq = state.equipment[slot];
    const reason = enhanceDisabledReason(slot);
    return `<div class="forge-row">
      <div>
        <b>${SLOT_NAMES[slot]}</b>
        ${eq ? `<span>${eq.name} +${eq.level}</span><small>${statsText(eq)}${reason ? ` · ${reason}` : " · 可强化"}</small>` : "<small>未装备</small>"}
      </div>
      <button type="button" ${reason ? "disabled" : ""} onclick="confirmEnhance('${slot}')">强化</button>
    </div>`;
  }).join("");
  showModal("合成台", `
    <div class="forge-panel">
      <div class="forge-summary">强化装备需要 <b>20 金币</b> 和 <b>1 个强化石</b>。当前：金币 ${state.gold}，强化石 ${state.materials["强化石"] || 0}。</div>
      ${rows}
    </div>
  `, [
    { text: "离开", action: closeModal }
  ]);
}

// 渲染开始界面，提供继续存档和新游戏入口。
function renderStartScreen() {
  const hasSave = !!localStorage.getItem(SAVE_KEY);
  $("classSelect").innerHTML = `
    <article class="class-card start-card">
      <h2>符文地牢</h2>
      <p>选择继续上次进度，或重新创建一名角色开始新的探索。</p>
      <div class="start-actions">
        <button type="button" ${hasSave ? "" : "disabled"} onclick="continueSavedGame()">继续冒险</button>
        <button type="button" onclick="renderClassSelect()">新游戏</button>
      </div>
    </article>
  `;
}

function continueSavedGame() {
  if (loadGame()) render();
}

// 渲染职业选择卡片，玩家选择后会创建新角色状态。
function renderClassSelect() {
  $("classSelect").innerHTML = Object.entries(CLASSES).map(([id, cls]) => `
    <article class="class-card">
      <h2>${cls.name}</h2>
      <p>${cls.desc}</p>
      <ul>${cls.skills.map((skill) => `<li>${skill.name}：${skill.desc}</li>`).join("")}</ul>
      <button type="button" onclick="startGame('${id}')">选择${cls.name}</button>
    </article>
  `).join("");
}

// 根据当前状态渲染完整 UI，并把快照持久化到 localStorage。
function render() {
  if (!state) {
    $("classSelect").classList.remove("hidden");
    $("gameView").classList.add("hidden");
    $("saveBtn").disabled = true;
    return;
  }
  if (!state.map?.cells?.length || state.map.size !== MAP_SIZE) generateFloor();
  state.hp = Math.min(state.hp, effectiveMaxHp());
  state.mp = Math.min(state.mp, effectiveMaxMp());
  $("classSelect").classList.add("hidden");
  $("gameView").classList.remove("hidden");
  $("saveBtn").disabled = false;
  renderHero();
  renderMap();
  renderMinimap();
  renderLegend();
  renderBattleView();
  renderContext();
  renderTab();
  renderLog();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

function confirmBuy(kind) {
  const goods = {
    hp: ["小型生命药水", 25],
    mp: ["小型法力药水", 25],
    beacon: ["商路信标", 80]
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
  $("hpBar").style.width = `${Math.max(0, Math.min(100, state.hp / hpMax * 100))}%`;
  $("mpBar").style.width = `${Math.max(0, Math.min(100, state.mp / mpMax * 100))}%`;
  $("xpBar").style.width = `${Math.max(0, Math.min(100, state.xp / state.xpNext * 100))}%`;
  $("statPoints").textContent = state.statPoints;
  $("skillPointsText").textContent = state.skillPoints || 0;
  $("skillDustText").textContent = state.skillDust || 0;
  $("goldText").textContent = state.gold;
  $("statsGrid").innerHTML = Object.entries(STAT_NAMES).map(([key, name]) => `
    <div class="stat">
      <span>${name} ${t[key]}</span>
      <button type="button" ${state.statPoints ? "" : "disabled"} onclick="confirmAddStat('${key}')">+</button>
    </div>
  `).join("");
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
    ${slots.map(([slot, cls]) => {
      const eq = state.equipment[slot];
      return `<button class="gear-slot gear-${cls} ${eq ? "equipped" : ""}" type="button" onclick="showEquipmentSlot('${slot}')" title="${eq ? eq.name : SLOT_NAMES[slot]}">
        <span>${SLOT_NAMES[slot]}</span>
        <small>${eq ? `+${eq.level}` : "空"}</small>
      </button>`;
    }).join("")}
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
    { text: "拆下", action: () => { closeModal(); unequipItem(slot); } }
  ]);
}

// 渲染主地牢地图视野范围内的格子。
function renderMap() {
  const theme = themeForFloor(state.floor);
  $("floorText").textContent = `第 ${state.floor} 层`;
  $("themeText").textContent = theme.name;
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
      const terrain = ["wall", "door", "fence"].includes(cell.terrain) ? cell.terrain : "floor";
      const isPlayer = cell.x === state.player.x && cell.y === state.player.y;
      const isSelected = selectedTile?.x === cell.x && selectedTile?.y === cell.y;
      const showObject = shouldShowMapObject(cell);
      const tileSprite = isPlayer ? sprite(`player facing-${state.facing || "down"}`, assetForClass(state.classId), CLASSES[state.classId].name)
        : showObject ? objectSprite(cell.object) : "";
      const objectBadge = showObject ? badgeForObject(cell.object.type) : "";
      const roomLabel = roomDoorLabel(cell);
      const roomBadge = roomLabel ? `<span class="room-label">${roomLabel}</span>` : "";
      const label = tileLabel(cell, isPlayer);
      const showHint = isPlayer || showObject || ["wall", "door", "fence"].includes(cell.terrain) || roomLabel;
      const hint = showHint ? `<span class="tile-hint">${label}</span>` : "";
      const title = "";
      const flags = [
        terrain,
        isPlayer ? " current" : "",
        "",
        isSelected ? " selected" : "",
        cell.object ? ` object object-${cell.object.type}` : ""
      ].join("");
      cells.push(`<button class="tile ${flags}" type="button"${title} aria-label="${label}" onclick="clickTile(${cell.x},${cell.y})">${tileSprite}${objectBadge}${roomBadge}${hint}</button>`);
    }
  }
  map.innerHTML = cells.join("");
}

// 门格显示紧凑房间编号，帮助玩家辨认任务目标房间。
function roomDoorLabel(cell) {
  if (cell.terrain !== "door" || !cell.roomId) return "";
  const marker = { danger: "险", sealed: "封", treasure: "宝" }[roomThreat(cell.roomId)] || "";
  return `${roomName(cell.roomId).replace(/房$/, "")}${marker}`;
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
  for (let y = 0; y < state.map.size; y++) {
    for (let x = 0; x < state.map.size; x++) {
      const cell = state.map.cells[y][x];
      const isPlayer = cell.x === state.player.x && cell.y === state.player.y;
      const marker = minimapMarker(cell, isPlayer);
      const inView = cell.x >= view.x && cell.x < view.x + view.size && cell.y >= view.y && cell.y < view.y + view.size;
      const classes = [
        "mini-cell",
        cell.seen ? "seen" : "unknown",
        ["wall", "fence"].includes(cell.terrain) ? "mini-wall" : "mini-floor",
        cell.seen && cell.object ? `obj-${cell.object.type}` : "",
        inView ? "in-view" : "",
        isPlayer ? "mini-player" : ""
      ].join(" ");
      cells.push(`<button class="${classes}" type="button" title="${tileLabel(cell, isPlayer)}" onclick="selectMinimapTile(${cell.x},${cell.y})">${marker}</button>`);
    }
  }
  minimap.innerHTML = `<div class="mini-grid">${cells.join("")}<span class="mini-view-frame"></span></div>`;
}

function minimapOverviewBounds(view) {
  const size = state.map.size;
  return {
    size,
    viewX: view.x / size * 100,
    viewY: view.y / size * 100,
    viewSize: view.size / size * 100
  };
}

function minimapMarker(cell, isPlayer) {
  if (isPlayer) {
    return `<span class="mini-dot mini-player-dot" aria-label="${CLASSES[state.classId].name}"></span>`;
  }
  if (!cell.seen || !cell.object) return "";
  if (cell.object.type === "trap") return "";
  const icon = minimapObjectIcon(cell.object);
  return `<span class="mini-dot mini-${icon.cls}" aria-label="${icon.alt}"></span>`;
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
    fenceGate: { cls: "fence-gate", src: ASSETS.fenceGate, alt: "门栅" },
    trap: { cls: "trap", src: ASSETS.trap, alt: "陷阱" },
    portal: { cls: "portal", src: ASSETS.portal, alt: "传送门" },
    stairsDown: { cls: "stairs-down", src: null, alt: "下行楼梯" },
    stairsUp: { cls: "stairs-up", src: null, alt: "上行楼梯" }
  };
  return icons[obj.type] || { cls: "unknown", src: null, alt: "未知" };
}

function selectMinimapTile(x, y) {
  selectedTile = { x, y };
  render();
}

// 渲染地图下方始终可见的图例说明。
function renderLegend() {
  const legendItems = LEGEND_ITEMS
    .filter(([type]) => type !== "portal")
    .concat([
      ["stairsDown", "下层", "进入下一层"],
      ["stairsUp", "上层", "返回上一层"]
    ]);
  $("legend").innerHTML = legendItems.map(([type, label, desc]) => {
    const src = type === "player" ? assetForClass(state.classId) : ASSETS[type];
    return `
      <div class="legend-item" title="${desc}">
        ${src ? `<img src="${src}" alt="${label}" draggable="false">` : iconSprite(iconClassForType(type), label)}
        <span>${label}</span>
      </div>
    `;
  }).join("");
}

// 有当前敌人时，把中间地图区域切换成战斗面板。
function renderBattleView() {
  const enemy = state.currentEnemy;
  const mapWrap = document.querySelector(".map-wrap");
  const mapStage = document.querySelector(".map-stage");
  let battleStage = $("battleStage");
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

  const cls = CLASSES[state.classId];
  const hpMax = effectiveMaxHp();
  const mpMax = effectiveMaxMp();
  const hpPct = Math.max(0, Math.min(100, Math.round(state.hp / hpMax * 100)));
  const mpPct = Math.max(0, Math.min(100, Math.round(state.mp / mpMax * 100)));
  const enemyPct = Math.max(0, Math.min(100, Math.round(enemy.hp / enemy.maxHp * 100)));
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
      <div class="battle-basic-actions battle-command-section">
        <div class="battle-panel-title">
          <span>行动</span>
          <small>本回合</small>
        </div>
        <div class="battle-action-grid">
          <button class="battle-action" type="button" onclick="attackEnemy('attack')">
            <b>普通攻击</b><small>稳定造成武器伤害</small>
          </button>
          <button class="battle-action" type="button" onclick="attackEnemy('defend')">
            <b>防御</b><small>本回合减少伤害</small>
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
      <div class="battle-consumable-panel battle-command-section">
        <div class="battle-panel-title">
          <b>补给</b>
          <small>喝药会消耗本回合行动</small>
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
  `;
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
  return potions.slice(0, 4).map((entry) => {
    const isHp = entry.effect === "hp";
    const cap = isHp ? effectiveMaxHp() : effectiveMaxMp();
    const current = isHp ? state.hp : state.mp;
    const disabled = current >= cap ? "disabled" : "";
    const effectText = `${isHp ? "HP" : "MP"} +${entry.amount}`;
    return `<button class="battle-consumable" type="button" ${disabled} onclick="useBattlePotion('${entry.id}')"><b>${entry.name}</b><span>${effectText}</span><small>x${entry.count}</small></button>`;
  }).join("");
}

// 根据当前模式生成技能按钮，战斗模式会展示更完整的资源信息。
function renderSkillActionButtons(mode = "compact") {
  return CLASSES[state.classId].skills.map((skill) => {
    const upgraded = upgradedSkill(skill);
    const level = upgraded.level ? ` Lv.${upgraded.level}` : "";
    const hasMp = state.mp >= upgraded.mp;
    const disabled = hasMp ? "" : "disabled";
    if (mode === "battle") {
      const mpText = hasMp ? `${upgraded.mp} MP` : `${upgraded.mp} MP · MP不足`;
      return `<button class="battle-skill-card" type="button" ${disabled} onclick="attackEnemy('skill', skillById('${skill.id}'))"><b>${skill.name}${level}</b><span>${mpText}</span><small>${skill.desc}</small></button>`;
    }
    return `<button type="button" ${disabled} onclick="attackEnemy('skill', skillById('${skill.id}'))">${skill.name}${level} - ${upgraded.mp} MP</button>`;
  }).join("");
}

function battleFxClass(target) {
  const fx = battleFx?.[target];
  if (!fx) return "";
  return `fx-${fx.type}`;
}

function combatantFxMarkup(target) {
  const fx = battleFx?.[target];
  if (!fx) return "";
  return `<span class="combat-fx combat-fx-${fx.type}" style="--fx-key:${fx.seq}"><b>${fx.text}</b><small>${fx.label}</small></span>`;
}

function centerFxMarkup() {
  const fx = battleFx?.center;
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
  if (cell.terrain === "door") return "房间门：进入封闭房间";
  if (!cell.object) return cell.roomId ? `${roomName(cell.roomId)}：可通行` : "地面：可通行";
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
    questNpc: cell.object.npcName ? `${cell.object.npcName}：提供${cell.object.roomName || roomName(cell.object.roomId)}相关委托` : "中立委托人：完成任务获得钥匙和金币",
    rescueNpc: `${cell.object.npcName || "被困者"}：清理${roomName(cell.object.roomId)}后确认救援`,
    fenceGate: "符文门栅：有钥匙后可打开围栏入口",
    trap: "陷阱：触发后受到伤害",
    portal: "传送门：进入下一层",
    stairsDown: cell.object.locked ? `封印楼梯：击败${cell.object.seal?.targetName || "封印守卫"}后才能进入下一层` : "下行楼梯：进入下一层",
    stairsUp: "上行楼梯：返回上一层"
  };
  return labels[cell.object.type] || "未知物体";
}

// 返回最近选中地图格子的描述文本。
function selectedTileText() {
  if (!selectedTile || !state?.map) return "";
  const cell = state.map.cells[selectedTile.y]?.[selectedTile.x];
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
  return type;
}

// 选中地图格子；如果格子相邻，则直接尝试移动。
function clickTile(x, y) {
  selectedTile = { x, y };
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
    $("contextTitle").textContent = `${enemy.name} ${Math.max(0, Math.round(enemy.hp))}/${enemy.maxHp}`;
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
  if (activeTab === "inventory") renderInventory();
  if (activeTab === "skills") renderSkills();
  if (activeTab === "quests") $("tabBody").innerHTML = renderQuestList();
}

function renderQuestList() {
  const quests = ensureQuestList();
  if (!quests.length) {
    return `<section class="quest-list"><p>暂无任务。和商人或委托人交谈后，可以在这里追踪目标。</p></section>`;
  }
  const rows = quests.map((quest) => {
    const base = QUEST_DEFS[quest.id] || { title: "未知任务", giverName: "未知", desc: "", rewardGold: 0 };
    const def = quest.id === "rescueRoom"
      ? { ...base, title: `${quest.roomName || "房间"}救援`, desc: `清理${quest.roomName || "目标房间"}并确认${quest.rescueName || "被困者"}安全。` }
      : base;
    const stateText = quest.claimed ? "已领取" : quest.completed ? "可领取" : quest.roomCleared ? "待救援" : "进行中";
    const rewardGold = questRewardGold(def, quest.floor);
    const rewards = [
      def.rewardKeys ? `钥匙 +${def.rewardKeys}` : "",
      rewardGold ? `金币 +${rewardGold}` : "",
      def.rewardPotion ? "药水 +1" : ""
    ].filter(Boolean).join(" · ");
    return `
      <article class="quest-row ${quest.completed && !quest.claimed ? "ready" : ""}">
        <div>
          <b>${def.title}</b>
          <small>${def.giverName} · 第 ${quest.floor} 层${quest.targetFloor && quest.targetFloor !== quest.floor ? ` · 目标第 ${quest.targetFloor} 层` : ""}${quest.roomName ? ` · ${quest.roomName}` : ""} · ${quest.kills}/${quest.target}</small>
          <p>${def.desc}</p>
          <small>${rewards}</small>
        </div>
        <span>${stateText}</span>
      </article>
    `;
  }).join("");
  return `<section class="quest-list">${rows}</section>`;
}

// 渲染背包列表和物品操作按钮。
function renderInventory() {
  $("tabBody").innerHTML = inventoryGroupMarkup();
}

function inventoryGroupMarkup() {
  const potions = state.inventory
    .filter((entry) => ["potion", "teleport"].includes(entry.kind))
    .sort((a, b) => itemScore(b) - itemScore(a));
  const allEquipment = state.inventory
    .filter((entry) => entry.kind === "equip")
    .sort((a, b) => itemScore(b) - itemScore(a));
  const equipment = equipmentFilterRows(allEquipment);
  const groups = {
    potions: inventoryGroup("potions", "药剂", potions.length ? potions.map(potionRow).join("") : `<p>暂无药剂。</p>`),
    equipment: inventoryGroup("equipment", "装备", `${equipmentFilterControl()}${equipment.length ? equipment.map(equipmentInventoryRow).join("") : `<p>暂无符合筛选的装备。</p>`}`),
    materials: inventoryGroup("materials", "材料", materialRows()),
    runes: inventoryGroup("runes", "符文", runeRows())
  };
  return `${inventorySubtabs()}${groups[activeInventoryTab] || groups.equipment}`;
}

function equipmentFilterRows(equipment) {
  if (activeEquipmentFilter === "all") return equipment;
  return equipment.filter((entry) => entry.slot === activeEquipmentFilter);
}

function equipmentFilterControl() {
  const options = [["all", "全部"], ...SLOTS.map((slot) => [slot, SLOT_NAMES[slot]])];
  return `
    <label class="inventory-filter">
      <span>类型</span>
      <select onchange="selectEquipmentFilter(this.value)">
        ${options.map(([value, label]) => `<option value="${value}" ${activeEquipmentFilter === value ? "selected" : ""}>${label}</option>`).join("")}
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
  return `<div class="inventory-subtabs">${tabs.map(([id, label]) => `<button type="button" data-inventory-tab="${id}" class="${activeInventoryTab === id ? "active" : ""}" onclick="selectInventoryTab('${id}')">${label}</button>`).join("")}</div>`;
}

function selectInventoryTab(tab) {
  activeInventoryTab = tab;
  renderInventory();
}

function selectEquipmentFilter(filter) {
  activeEquipmentFilter = filter;
  renderInventory();
}

function inventoryGroup(type, title, body) {
  return `<section class="inventory-group inventory-group-${type}"><h3>${title}</h3>${body}</section>`;
}

function potionRow(entry) {
  if (entry.kind === "teleport") {
    return `<div class="item-row"><div>${entry.name}<small>传送到已探索楼层的商人、委托人或合成台附近</small></div><button type="button" onclick="confirmUseItem('${entry.id}')">使用</button></div>`;
  }
  return `<div class="item-row"><div>${entry.name}<small>评分 ${itemScore(entry)} · 恢复 ${entry.amount}</small></div><button type="button" onclick="confirmUseItem('${entry.id}')">使用</button></div>`;
}

function equipmentInventoryRow(entry) {
  const better = isBetterThanEquipped(entry);
  const hasCurrent = !!state.equipment?.[entry.slot];
  const compare = hasCurrent ? equipmentScoreBadge(entry, "inline-equipment-compare") : "";
  const sellDisabled = canSellEquipmentHere() ? "" : `disabled title="需要在商人身边售出"`;
  return `<div class="item-row equip-row equipment-card ${better ? "better-equipment" : ""}">
    ${compare ? `<div class="equipment-compare-corner">${compare}</div>` : ""}
    <div><b>${entry.name}</b>${equipmentSummary(entry)}</div>
    <div class="equipment-actions inventory-equipment-actions">
      <button type="button" onclick="showInventoryEquipmentDetail('${entry.id}')">详情</button>
      <button type="button" onclick="confirmEquipItem('${entry.id}')">装备</button>
      <button type="button" ${sellDisabled} onclick="confirmSellEquipment('${entry.id}')">售出</button>
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
  showModal(`${entry.name} 对比`, `
    <div class="equipment-detail">
      <div class="detail-row"><b>候选装备</b><span>${entry.name} · 评分 ${itemScore(entry)}</span></div>
      <div class="detail-row"><b>当前装备</b><span>${current.name} · 评分 ${itemScore(current)}</span></div>
      <div class="detail-row"><b>差值</b><span>${equipmentCompareText(entry)}</span></div>
    </div>
  `, [
    { text: "关闭", action: closeModal },
    { text: "装备", action: () => { closeModal(); equipItem(id); } }
  ]);
}

function showInventoryEquipmentDetail(id) {
  const entry = state.inventory.find((item) => item.id === id);
  if (!entry || entry.kind !== "equip") return;
  const runeText = entry.runeSlots
    ? `${entry.runes.length}/${entry.runeSlots}：${entry.runes.length ? entry.runes.join("、") : "未镶嵌"}`
    : "无";
  const compare = state.equipment?.[entry.slot] ? `<div class="detail-row"><b>对比</b><span>${equipmentCompareText(entry)}</span></div>` : "";
  const actions = [
    { text: "关闭", action: closeModal },
    { text: "装备", action: () => { closeModal(); equipItem(id); } }
  ];
  if (canSellEquipmentHere()) actions.splice(2, 0, { text: "售出", action: () => { closeModal(); sellEquipment(id); } });
  showModal(entry.name, equipmentDetailMarkup(entry, SLOT_NAMES[entry.slot], runeText, compare), actions);
}

function materialRows() {
  const materials = Object.entries(state.materials || {}).filter(([, count]) => count > 0);
  if ((state.keys || 0) > 0) materials.unshift(["符文钥匙", state.keys]);
  return materials.length
    ? materials.map(([name, count]) => `<div class="item-row"><div>${name}</div><span class="item-quantity">x${count}</span></div>`).join("")
    : `<p>暂无材料。</p>`;
}

function runeRows() {
  const runes = Object.entries(state.runes || {}).filter(([, count]) => count > 0);
  return runes.length
    ? runes.map(([name, count]) => `<div class="item-row rune-row"><div>${name}符文<small>${runeEffectText(name)}。3 合 1 升级；需要镶嵌到带符文槽的装备上才生效。</small></div><span class="item-quantity">x${count}</span><button type="button" ${count >= 3 ? "" : "disabled"} onclick="confirmCraftRune('${name}')">合成</button></div>`).join("")
    : `<p>暂无符文。</p>`;
}

// 渲染已装备物品和强化控制。
function renderEquipment() {
  $("tabBody").innerHTML = SLOTS.map((slot) => {
    const eq = state.equipment[slot];
    const disabledReason = enhanceDisabledReason(slot);
    const actions = eq
      ? `<div class="equipment-actions"><button type="button" ${disabledReason ? "disabled" : ""} title="${disabledReason || "强化"}" onclick="confirmEnhance('${slot}')">强化</button><button type="button" onclick="confirmUnequip('${slot}')">拆下</button></div>`
      : `<button type="button" disabled>空位</button>`;
    return `<div class="item-row equipment-card equipped-row"><div><b>${SLOT_NAMES[slot]}${eq ? equippedStateBadge() : ""}</b>${eq ? `<span class="equipment-name">${eq.name}</span>${equipmentSummary(eq, disabledReason ? "不可强化" : "")}` : `<small>未装备</small>`}</div>${actions}</div>`;
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
    ${skills.map((skill) => {
      const upgraded = upgradedSkill(skill);
      const cost = skillUpgradeCost(skill.id);
      const disabled = canUpgradeSkill(skill.id) ? "" : "disabled";
      return `<div class="item-row skill-row"><div>${skill.name} Lv.${upgraded.level}<small>${skill.desc}<br>倍率 ${upgraded.power}，耗蓝 ${upgraded.mp}。升级消耗 ${cost.points} 技能点 / ${cost.dust} 技能尘</small></div><button type="button" ${disabled} onclick="confirmUpgradeSkill('${skill.id}')">升级</button></div>`;
    }).join("")}
  `;
}

// 格式化装备属性摘要。
function statsText(eq) {
  return Object.entries(eq.stats).map(([key, value]) => {
    const enhance = eq.level ? `(+${eq.level})` : "";
    return `${STAT_NAMES[key] || key}+${value}${enhance}`;
  }).join(" ");
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
  const statKeys = Array.from(new Set([
    ...Object.keys(current?.stats || {}),
    ...Object.keys(item.stats || {})
  ]));
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
  return Object.keys(eq.stats).map((key) => `${STAT_NAMES[key] || key}+${eq.level}`).join(" ");
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
function log(text) {
  state.log.unshift(text);
  state.log = state.log.slice(0, 80);
}

// 将完整游戏状态保存到 localStorage。
function saveGame(show = true) {
  if (!state) return;
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  if (show) {
    log("游戏已保存。");
    render();
  }
}

// 从 localStorage 恢复存档，并补齐新版字段的默认值。
function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  state = JSON.parse(raw);
  state.facing = state.facing || "down";
  state.skillPoints = state.skillPoints || 0;
  state.skillDust = state.skillDust || 0;
  state.keys = state.keys || 0;
  state.quest = state.quest || null;
  state.quests = Array.isArray(state.quests) ? state.quests : [];
  state.floorStates = state.floorStates || {};
  state.skillLevels = state.skillLevels || {};
  for (const skill of CLASSES[state.classId].skills) {
    state.skillLevels[skill.id] = state.skillLevels[skill.id] || 0;
  }
  if (!state.map?.cells?.length || state.map.size !== MAP_SIZE) generateFloor();
  if (state.map && state.map.explorationVersion !== 2) resetExploration();
  updateVisibility();
  return true;
}

// 重置探索可见性，用于老存档升级到新版视野逻辑。
function resetExploration() {
  for (const row of state.map.cells) {
    for (const cell of row) {
      cell.seen = false;
      cell.visible = false;
    }
  }
  state.map.explorationVersion = 2;
}

// 显示弹窗，并使用调用方传入的按钮动作。
function showModal(title, body, actions) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = body;
  $("modalActions").innerHTML = actions.map((action, index) => `<button type="button" onclick="modalAction(${index})">${action.text}</button>`).join("");
  window._modalActions = actions;
  $("modal").classList.remove("hidden");
}

// 显示地图事件弹窗，只有一个确认按钮。
function showEvent(title, body, actionText = "确定") {
  showModal(title, body, [
    { text: actionText, action: closeModal }
  ]);
}

// 显示短暂浮层提示，用于上下楼等不需要阻断操作的事件。
function showToast(message, duration = 2600) {
  const toast = $("toast");
  toast.innerHTML = message;
  toast.classList.add("show");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}

// 显示二次确认弹窗，并在确认后执行回调。
function showConfirm(title, body, confirmText, onConfirm) {
  showModal(title, body, [
    { text: "取消", action: closeModal },
    { text: confirmText, action: () => { closeModal(); onConfirm(); } }
  ]);
}

// 根据按钮下标派发当前弹窗动作。
function modalAction(index) {
  initAudio();
  window._modalActions[index].action();
}

// 关闭当前弹窗，并清理临时弹窗状态。
function closeModal() {
  $("modal").classList.add("hidden");
  window._modalActions = [];
  statDraft = null;
}

// 清除存档并返回职业选择前，先向玩家二次确认。
function newGamePrompt() {
  showModal("新游戏", "<p>这会覆盖当前浏览器存档。确定要重新开始吗？</p>", [
    { text: "取消", action: closeModal },
    { text: "重新开始", action: () => { localStorage.removeItem(SAVE_KEY); state = null; closeModal(); render(); } }
  ]);
}
