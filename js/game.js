let state = null;
let activeTab = "inventory";
let activeInventoryTab = "equipment";
let selectedTile = null;
let battleFx = null;
let statDraft = null;

const $ = (id) => document.getElementById(id);

const QUEST_DEFS = {
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

// Random and ID helpers used by map generation, loot, and item creation.
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

function resetBattleFx(kind = "action") {
  battleFx = { kind, hero: null, enemy: null, center: null, seq: Date.now() };
}

function setBattleFx(target, data) {
  if (!battleFx) resetBattleFx();
  battleFx[target] = { ...data, seq: `${battleFx.seq}-${target}` };
}

// Create a new persistent hero state and enter the first floor.
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

// Build the first equipment set for the chosen class.
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

function emptyEquipment() {
  return Object.fromEntries(SLOTS.map((slot) => [slot, null]));
}

// Factory for consumable item entries.
function potion(name, kind, amount) {
  return { id: uid(), kind: "potion", name, effect: kind, amount };
}

// Factory for equipment entries.
function item(name, slot, quality, stats, runeSlots = 0, runes = []) {
  return { id: uid(), kind: "equip", name, slot, quality, stats, runeSlots, runes, level: 0 };
}

// Resolve the visual and gameplay theme for a floor number.
function themeForFloor(floor) {
  return THEMES.find((theme) => theme.floors.includes(floor)) || THEMES[0];
}

// Generate a larger semi-random floor with guaranteed path to the down stairs.
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

  if (state.floor === 10) {
    const center = Math.floor(size / 2);
    carvePath(map, 1, 1, center, center);
    for (let y = center - 3; y <= center + 3; y++) {
      for (let x = center - 3; x <= center + 3; x++) map[y][x].terrain = "floor";
    }
    map[center][center].object = makeEnemy(true);
    map[center - 3][center - 3].object = { type: "altar" };
    map[center - 3][center + 3].object = { type: "forge" };
    if (state.floor > 1) map[1][1].object = { type: "stairsUp" };
  } else {
    const mainPath = carveMainRoute(map, 1, 1, size - 2, size - 2);
    widenMainRoute(map, mainPath);
    carveSideRooms(map, mainPath, 14 + Math.floor(state.floor / 2));
    carveStructuredRooms(map, mainPath, 5);
    placeTreasureEncounters(map, 5);
    scatter(map, "monster", 16 + Math.floor(state.floor * 1.5));
    scatter(map, "trap", state.floor >= 4 ? 5 : 3);
    scatter(map, "altar", 3);
    if (state.floor % 3 === 1) scatter(map, "shop", 1);
    if (state.floor % 3 === 2) scatter(map, "forge", 1);
    placeQuestNpc(map);
    if (state.floor > 1) map[1][1].object = { type: "stairsUp" };
    map[size - 2][size - 2].object = { type: "stairsDown" };
  }

  state.player = { x: 1, y: 1 };
  state.facing = state.facing || "down";
  state.map = { size, theme: theme.id, cells: map, explorationVersion: 2 };
  updateVisibility();
}

// Carve a simple guaranteed route so random walls cannot soft-lock the floor.
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

function carveMainCell(map, x, y, path) {
  const cell = map[y]?.[x];
  if (!cell) return;
  cell.terrain = "floor";
  cell.mainPath = true;
  path.push(cell);
}

function widenMainRoute(map, mainPath) {
  for (const cell of mainPath) {
    for (const next of cardinalNeighbors(map, cell.x, cell.y)) {
      if (next.x > 0 && next.y > 0 && next.x < map.length - 1 && next.y < map.length - 1) {
        next.terrain = "floor";
      }
    }
  }
}

function carveSideRooms(map, mainPath, count) {
  const anchors = mainPath.filter((cell) => cell.x > 3 && cell.y > 3 && cell.x < map.length - 4 && cell.y < map.length - 4);
  const trunkRooms = Math.min(8, Math.floor(count / 2), anchors.length);
  for (let i = 0; i < trunkRooms; i++) {
    const anchor = anchors[Math.floor((i + 1) * anchors.length / (trunkRooms + 1))];
    carveRoom(map, anchor.x, anchor.y, 2);
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
      if (carveBranchRoom(map, anchor, dir)) {
        placed++;
        break;
      }
    }
  }
}

function carveBranchRoom(map, anchor, dir) {
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
  return carveRoom(map, x, y, 2);
}

function shuffledDirections() {
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ];
  return dirs.sort(() => Math.random() - .5);
}

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

// Place monsters or map objects on empty floor cells.
function scatter(map, type, count) {
  let placed = 0;
  let attempts = 0;
  const max = map.length - 2;
  while (placed < count && attempts < count * 80) {
    attempts++;
    const x = rand(1, max);
    const y = rand(1, max);
    const cell = map[y][x];
    if (cell.terrain === "floor" && !cell.object && !(x === 1 && y === 1)) {
      cell.object = type === "monster" ? makeEnemyWithVariant(Math.random() < .14) : { type };
      placed++;
    }
  }
}

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

function placeLockedTreasureRoom(map) {
  const candidates = interiorCells(map)
    .filter((cell) => canUseTreasureCell(map, cell.x, cell.y))
    .sort((a, b) => treasureScore(map, b) - treasureScore(map, a));
  for (const center of candidates.slice(0, 36)) {
    if (!carveRoom(map, center.x, center.y, 2)) continue;
    center.object = { type: "lockedChest" };
    placeFenceRing(map, center.x, center.y);
    placeKeyGuardianNear(map, center.x, center.y);
    placeGuardNear(map, center.x, center.y, false);
    return true;
  }
  return false;
}

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

function placeTreasureRoom(map) {
  const candidates = interiorCells(map)
    .filter((cell) => canUseTreasureCell(map, cell.x, cell.y))
    .sort((a, b) => treasureScore(map, b) - treasureScore(map, a));
  for (const center of candidates.slice(0, 32)) {
    if (!carveRoom(map, center.x, center.y, 2)) continue;
    center.object = { type: "chest" };
    placeGuardNear(map, center.x, center.y, true);
    placeGuardNear(map, center.x, center.y, false);
    return true;
  }
  return false;
}

function placeDeadEndTreasure(map) {
  const candidates = interiorCells(map)
    .filter((cell) => canUseTreasureCell(map, cell.x, cell.y) && floorNeighborCount(map, cell.x, cell.y) <= 1)
    .sort((a, b) => treasureScore(map, b) - treasureScore(map, a));
  const cell = candidates[0];
  if (!cell) return false;
  cell.object = { type: "chest" };
  placeGuardNear(map, cell.x, cell.y, true);
  return true;
}

function placeGuardedTreasure(map) {
  const candidates = interiorCells(map)
    .filter((cell) => canUseTreasureCell(map, cell.x, cell.y))
    .sort((a, b) => treasureScore(map, b) - treasureScore(map, a));
  const cell = candidates[0];
  if (!cell) return false;
  cell.object = { type: "chest" };
  placeGuardNear(map, cell.x, cell.y, true);
  return true;
}

function carveRoom(map, cx, cy, radius) {
  if (cx - radius <= 0 || cy - radius <= 0 || cx + radius >= map.length - 1 || cy + radius >= map.length - 1) return false;
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (map[y][x].object) return false;
    }
  }
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      map[y][x].terrain = "floor";
    }
  }
  return true;
}

function placeGuardNear(map, x, y, eliteChance = false) {
  const candidates = cellsWithin(map, x, y, 2)
    .filter((cell) => cell.terrain === "floor" && !cell.object && (cell.x !== x || cell.y !== y))
    .sort((a, b) => distance(a, { x, y }) - distance(b, { x, y }));
  const guard = candidates[0];
  if (!guard) return false;
  guard.object = makeEnemyWithVariant(eliteChance && Math.random() < .35);
  return true;
}

function placeKeyGuardianNear(map, x, y) {
  const candidates = cellsWithin(map, x, y, 2)
    .filter((cell) => cell.terrain === "floor" && !cell.object && distance(cell, { x, y }) > 1)
    .sort((a, b) => distance(a, { x, y }) - distance(b, { x, y }));
  const guard = candidates[0];
  if (!guard) return false;
  guard.object = makeKeyGuardian();
  return true;
}

function placeQuestNpc(map) {
  const candidates = interiorCells(map)
    .filter((cell) => cell.terrain === "floor" && !cell.object && distance(cell, { x: 1, y: 1 }) > 4)
    .sort((a, b) => npcScore(map, b) - npcScore(map, a));
  const cell = candidates.find((candidate) => cellsWithin(map, candidate.x, candidate.y, 3).some((nearby) => nearby.roomId)) || candidates[0];
  if (!cell) return false;
  cell.object = { type: "questNpc", questId: "wardenErrand" };
  state.quest = state.quest || { id: "wardenErrand", floor: state.floor, kills: 0, target: 2, claimed: false };
  return true;
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
  return enemy;
}

function makeKeyGuardian() {
  const enemy = makeEnemyWithVariant(true);
  enemy.type = "elite";
  enemy.variant = "elite";
  enemy.name = "钥匙守卫";
  enemy.roomBoss = true;
  enemy.dropsKey = true;
  enemy.hp = Math.ceil(enemy.hp * 1.18);
  enemy.maxHp = enemy.hp;
  enemy.atk += 2;
  enemy.gold += 12;
  return enemy;
}

// Create monster stats scaled by floor and elite/boss status.
function makeEnemy(eliteOrBoss = false) {
  const floor = state.floor;
  const boss = floor === 10;
  const names = floor < 4
    ? ["史莱姆", "洞穴鼠", "骷髅兵"]
    : floor < 7
      ? ["矿洞蝙蝠", "诅咒矿工", "石像守卫"]
      : ["冰霜狼", "寒冰法徒", "冰晶魔像"];
  const elite = eliteOrBoss && !boss;
  const base = 18 + floor * 8;
  const hp = Math.round(boss ? 260 : elite ? base * 1.8 : base);
  return {
    type: boss ? "boss" : elite ? "elite" : "monster",
    name: boss ? "符文守王" : elite ? `精英${choice(names)}` : choice(names),
    hp,
    maxHp: hp,
    atk: boss ? 30 : 7 + floor * 3 + (elite ? 7 : 0),
    def: boss ? 18 : 3 + floor + (elite ? 4 : 0),
    xp: boss ? 160 : 12 + floor * 6 + (elite ? 18 : 0),
    gold: boss ? 220 : rand(8, 16) + floor * 2 + (elite ? 18 : 0)
  };
}

// Mark cells near the player as currently visible and permanently seen.
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

// Move the player by one tile and resolve the destination cell.
function move(dx, dy) {
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
  selectedTile = null;
  updateVisibility();
  resolveCell(cell);
  render();
}

// Trigger the object on the player's current tile.
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
    openQuestNpc();
  } else if (obj.type === "fenceGate") {
    openFenceGate(cell);
  } else if (obj.type === "stairsDown" || obj.type === "portal") {
    nextFloor();
  } else if (obj.type === "stairsUp") {
    previousFloor();
  }
}

function handleEnemyEncounter(enemy) {
  log(`遭遇${enemy.name}。`);
  if (enemy.type === "monster") {
    enterBattle(enemy);
    return;
  }
  promptDangerousEnemy(enemy);
}

function isDangerousEnemy(obj) {
  return ["elite", "boss"].includes(obj?.type);
}

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

function enterBattle(enemy) {
  state.currentEnemy = enemy;
  render();
}

function triggerTrap(cell) {
  const damage = rand(8, 14) + state.floor * 2;
  const alerted = placeGuardNear(state.map.cells, cell.x, cell.y, state.floor >= 4);
  state.hp = Math.max(1, state.hp - damage);
  cell.object = null;
  log(`触发隐藏机关，受到 ${damage} 点伤害${alerted ? "，并惊动了守卫" : ""}。`);
  showEvent("触发机关", `<p>地面机关突然弹起，你受到 ${damage} 点伤害。</p>${alerted ? "<p>机关的响动惊动了附近守卫。</p>" : ""}`, "继续探索");
}

// Resolve chest rewards: equipment, rune, or materials/gold.
function openChest(cell) {
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

function openQuestNpc() {
  openQuestFromGiver("questNpc");
}

function ensureQuest() {
  if (!state.quest || state.quest.floor !== state.floor) {
    state.quest = { id: "wardenErrand", floor: state.floor, kills: 0, target: 2, claimed: false };
  }
  return state.quest;
}

function questDefinitionsForGiver(giver) {
  return Object.values(QUEST_DEFS).filter((quest) => quest.giver === giver);
}

function ensureQuestList() {
  state.quests = Array.isArray(state.quests) ? state.quests : [];
  return state.quests;
}

function questRewardGold(def, floor = state.floor) {
  return typeof def.rewardGold === "function" ? def.rewardGold(floor) : (def.rewardGold || 0);
}

function createQuestState(def, floor = state.floor) {
  return {
    id: def.id,
    giver: def.giver,
    floor,
    kills: 0,
    target: def.target,
    accepted: true,
    completed: false,
    claimed: false
  };
}

function questState(id, floor = state.floor) {
  return ensureQuestList().find((quest) => quest.id === id && quest.floor === floor);
}

function acceptQuest(id) {
  const def = QUEST_DEFS[id];
  if (!def) return null;
  let quest = questState(id);
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

function openQuestFromGiver(giver) {
  const def = questDefinitionsForGiver(giver)[0];
  if (!def) {
    showEvent("暂无任务", "<p>这里暂时没有新的委托。</p>", "离开");
    return;
  }
  const quest = questState(def.id);
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
      <small>进度：${progress.kills}/${def.target}${remaining ? `，还差 ${remaining} 个。` : "，可以领取奖励。"}</small>
      <div class="quest-reward">${rewardParts}</div>
    </div>
  `;
  const actions = [];
  if (!quest) {
    actions.push({ text: "接受任务", action: () => { closeModal(); acceptQuest(def.id); } });
  } else if (quest.completed && !quest.claimed) {
    actions.push({ text: "领取奖励", action: () => { closeModal(); claimQuestReward(def.id); } });
  } else {
    actions.push({ text: quest.claimed ? "已领取" : "继续任务", action: closeModal });
  }
  actions.push({ text: "离开", action: closeModal });
  showModal(def.title, body, actions);
}

function claimQuestReward(id) {
  const def = QUEST_DEFS[id];
  const quest = questState(id);
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
  render();
}

// Generate equipment loot with slot, quality, stat, and rune-slot rolls.
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

// Roll item quality, lightly affected by luck.
function qualityRoll() {
  const r = Math.random() + state.stats.luk * .004 + Math.min(.12, state.floor * .012);
  if (r > .96) return "传说";
  if (r > .86) return "史诗";
  if (r > .68) return "稀有";
  if (r > .38) return "优秀";
  return "普通";
}

// Convert item quality into its base stat budget.
function qualityBonus(quality) {
  return { 普通: 3, 优秀: 5, 稀有: 8, 史诗: 11, 传说: 15 }[quality];
}

// Consume an altar tile and restore part of player resources.
function useAltar(cell) {
  const heal = Math.floor(state.maxHp * .28);
  state.hp = Math.min(effectiveMaxHp(), state.hp + heal);
  state.mp = Math.min(effectiveMaxMp(), state.mp + 14);
  cell.object = null;
  log(`符文祭坛恢复了 ${heal} 点生命和少量法力。`);
  showEvent("符文祭坛", `<p>祭坛亮起微光，恢复 ${heal} 点生命和少量法力。</p>`, "继续");
}

// Advance to the next floor and refresh a small amount of resources.
function nextFloor() {
  if (state.floor >= 10) return;
  saveCurrentFloor();
  state.floor++;
  state.facing = "down";
  enterFloor("down");
  state.hp = Math.min(effectiveMaxHp(), state.hp + 20);
  state.mp = Math.min(effectiveMaxMp(), state.mp + 12);
  log(`进入第 ${state.floor} 层。`);
  saveGame(false);
  showToast(`<p>你沿着下行楼梯抵达第 ${state.floor} 层。</p>`)
  // showEvent("进入下一层", `<p>你沿着下行楼梯抵达第 ${state.floor} 层。</p>`, "继续探索");
}

function previousFloor() {
  if (state.floor <= 1) return;
  saveCurrentFloor();
  state.floor--;
  state.facing = "up";
  enterFloor("up");
  updateVisibility();
  state.hp = Math.min(effectiveMaxHp(), state.hp + 8);
  state.mp = Math.min(effectiveMaxMp(), state.mp + 5);
  log(`返回第 ${state.floor} 层。`);
  saveGame(false);
  showToast(`<p>你沿着上行楼梯回到第 ${state.floor} 层。</p>`)
  // showEvent("返回上一层", `<p>你沿着上行楼梯回到第 ${state.floor} 层。</p>`, "继续探索");
}

function saveCurrentFloor() {
  if (!state?.map) return;
  state.floorStates = state.floorStates || {};
  state.floorStates[state.floor] = {
    map: cloneFloorMap(state.map),
    player: { ...state.player },
    facing: state.facing
  };
}

function enterFloor(direction) {
  state.floorStates = state.floorStates || {};
  const saved = state.floorStates[state.floor];
  if (saved?.map) {
    state.map = cloneFloorMap(saved.map);
    const size = state.map.size;
    state.player = direction === "up" ? { x: size - 2, y: size - 2 } : { x: 1, y: 1 };
    updateVisibility();
    return;
  }
  generateFloor();
  if (direction === "up") {
    const size = state.map.size;
    state.player = { x: size - 2, y: size - 2 };
    updateVisibility();
  }
}

function cloneFloorMap(map) {
  return JSON.parse(JSON.stringify(map));
}

// Combine base attributes, equipment, upgrades, and runes.
function totals() {
  const total = { ...state.stats, hp: 0, mp: 0 };
  for (const eq of Object.values(state.equipment)) {
    if (!eq) continue;
    for (const [key, value] of Object.entries(eq.stats)) total[key] = (total[key] || 0) + value + eq.level;
    for (const rune of eq.runes) applyRune(total, rune);
  }
  return total;
}

// Current maximum HP after equipment bonuses.
function effectiveMaxHp() {
  return state.maxHp + (totals().hp || 0);
}

// Current maximum MP after equipment bonuses.
function effectiveMaxMp() {
  return state.maxMp + (totals().mp || 0);
}

// Apply rune bonuses into the derived stat object.
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

// Resolve one player combat action and then the enemy response.
function attackEnemy(mode, skill = null) {
  const enemy = state.currentEnemy;
  const t = totals();
  let result = "";
  resetBattleFx(mode);
  if (mode === "attack") {
    result = dealDamage(enemy, Math.max(2, t.atk - enemy.def * .35), "普通攻击");
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

// Apply damage with critical chance and return a combat log line.
function dealDamage(enemy, amount, label) {
  const crit = Math.random() < (0.06 + totals().luk * .008);
  const damage = Math.max(1, Math.round(amount * (crit ? 1.7 : 1)));
  enemy.hp = Math.max(0, Math.round(enemy.hp - damage));
  setBattleFx("enemy", { type: crit ? "crit" : "hit", text: `-${damage}`, label });
  return `${label}${crit ? "暴击" : ""}，造成 ${damage} 点伤害。`;
}

// Execute class skill effects such as shield, poison, burn, or double shot.
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

// Resolve one enemy attack turn, including dodge and guard mitigation.
function enemyTurn(enemy) {
  const t = totals();
  const dodge = Math.random() < (t.spd * .006 + (state._evade ? .35 : .04));
  state._evade = false;
  if (dodge) {
    setBattleFx("hero", { type: "evade", text: "闪避", label: enemy.name });
    log(`${enemy.name}的攻击落空。`);
    return;
  }
  let damage = Math.max(1, Math.round(enemy.atk - t.def * .42));
  if (state._guard) {
    damage = Math.max(0, damage - state._guard);
    state._guard = 0;
  }
  state.hp -= damage;
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
    mp: Math.max(1, skill.mp - Math.floor(level / 2)),
    power: Number((skill.power * (1 + level * .14)).toFixed(2))
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

// Finish combat, award rewards, clear the enemy tile, and check boss win.
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
  rewards.push(...maybeDrop(enemy));
  const levelBefore = state.level;
  while (state.xp >= state.xpNext) levelUp();
  if (state.level > levelBefore) rewards.push(`等级提升到 Lv.${state.level}`);
  if (enemy.type === "boss") {
    showModal("通关", `<p>符文守王倒下了，地牢深处的王座重新安静下来。第一版到这里通关。</p>${battleResultList(rewards)}`, [
      { text: "继续整理装备", action: closeModal }
    ]);
  } else {
    showModal(`击败 ${enemy.name}`, `<p>战斗结束，你清点了这次收获。</p>${battleResultList(rewards)}`, [
      { text: "收下", action: closeModal }
    ]);
  }
}

function recordQuestKill(enemy, rewards = []) {
  if (!enemy || enemy.type === "boss") return;
  for (const quest of ensureQuestList()) {
    if (!quest.accepted || quest.claimed || quest.completed || quest.floor !== state.floor) continue;
    const def = QUEST_DEFS[quest.id];
    if (!def) continue;
    quest.kills++;
    if (quest.kills >= quest.target) {
      quest.kills = quest.target;
      quest.completed = true;
      log(`${def.title}完成了，回到${def.giverName}处领取奖励。`);
      rewards.push(`${def.title} ${quest.kills}/${quest.target}`);
      rewards.push(`回${def.giverName}处领取奖励`);
    } else {
      rewards.push(`${def.title} ${quest.kills}/${quest.target}`);
    }
  }
}

// Roll post-combat equipment and rune drops.
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

// Increase level, grant stat point, and refresh resources.
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

// Handle defeat without deleting the save: reset to floor entrance with penalty.
function death() {
  state.hp = Math.ceil(effectiveMaxHp() * .55);
  state.mp = Math.ceil(effectiveMaxMp() * .45);
  state.gold = Math.max(0, state.gold - Math.ceil(state.gold * .15));
  state.currentEnemy = null;
  generateFloor();
  log("你被击倒，被传送回本层入口，损失了少量金币。");
}

// Fast-resolve lower-risk battles using the same combat actions.
function autoBattle() {
  const enemy = state.currentEnemy;
  const risk = battleRisk(enemy);
  if (risk.score < .55) {
    showEvent("一键战斗评估", `<p>${enemy.name} 当前评估为${risk.label}，胜率约 ${Math.round(risk.score * 100)}%。风险过高，建议手动战斗。</p>`, "知道了");
    return;
  }
  showModal("一键战斗评估", `<p>${enemy.name} 当前评估为${risk.label}，胜率约 ${Math.round(risk.score * 100)}%。</p>`, [
    { text: "取消", action: closeModal },
    { text: "开始一键战斗", action: () => { closeModal(); executeAutoBattle(); } }
  ]);
}

function executeAutoBattle() {
  let rounds = 0;
  while (state.currentEnemy && state.hp > 0 && rounds < 30) {
    const bestSkill = CLASSES[state.classId].skills.find((skill) => state.mp >= upgradedSkill(skill).mp && skill.type !== "evade");
    attackEnemy(bestSkill ? "skill" : "attack", bestSkill || null);
    rounds++;
  }
}

// Estimate battle risk from player and enemy power.
function battleRisk(enemy) {
  const t = totals();
  const heroPower = state.hp + state.mp * .35 + t.atk * 7 + t.mag * 6 + t.def * 6 + t.spd * 4;
  const enemyPower = enemy.hp + enemy.atk * 10 + enemy.def * 7;
  const score = heroPower / (heroPower + enemyPower);
  const label = score >= .75 ? "碾压" : score >= .64 ? "优势" : score >= .55 ? "均势" : score >= .42 ? "危险" : "致命";
  return { score, label };
}

// Spend one pending stat point on a base attribute.
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

function isBlockingInteraction(obj) {
  if (!obj) return false;
  if (["shop", "forge", "questNpc", "fenceGate"].includes(obj.type)) return true;
  if (obj.type === "lockedChest") return (state.keys || 0) <= 0;
  return false;
}

// Equip an inventory item and return the old item to the bag.
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

// Use a consumable potion from the inventory.
function useItem(id) {
  const index = state.inventory.findIndex((entry) => entry.id === id);
  const entry = state.inventory[index];
  if (!entry || entry.kind !== "potion") return;
  if (entry.effect === "hp") state.hp = Math.min(effectiveMaxHp(), state.hp + entry.amount);
  if (entry.effect === "mp") state.mp = Math.min(effectiveMaxMp(), state.mp + entry.amount);
  state.inventory.splice(index, 1);
  log(`使用${entry.name}。`);
  render();
}

function confirmUseItem(id) {
  const entry = state.inventory.find((item) => item.id === id);
  if (!entry) return;
  showConfirm("使用确认", `<p>要使用 ${entry.name} 吗？</p><p>效果：恢复 ${entry.amount} 点${entry.effect === "hp" ? "生命" : "法力"}。</p>`, "使用", () => useItem(id));
}

// Combine three same-type runes into the next tier.
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

// Upgrade an equipped item with gold and strengthening material.
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

// Buy basic consumables from the merchant tile.
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
  if (!bought) log("金币不足，交易没有完成。");
  render();
}

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

function openMerchantShop() {
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
      </div>
    </div>
  `, [
    { text: "离开", action: closeModal }
  ]);
}

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

// Render the initial class selection cards.
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

// Render the full UI from current state and persist the snapshot.
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
  const name = kind === "hp" ? "小型生命药水" : "小型法力药水";
  showConfirm("购买确认", `<p>花费 25 金币购买 ${name}。</p>`, "购买", () => buy(kind));
}

// Render player portrait, bars, stats, and stat-point controls.
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

// Render the main dungeon map tiles.
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
      const label = tileLabel(cell, isPlayer);
      const showHint = isPlayer || showObject || ["wall", "door", "fence"].includes(cell.terrain);
      const hint = showHint ? `<span class="tile-hint">${label}</span>` : "";
      const title = "";
      const flags = [
        terrain,
        isPlayer ? " current" : "",
        "",
        isSelected ? " selected" : "",
        cell.object ? ` object object-${cell.object.type}` : ""
      ].join("");
      cells.push(`<button class="tile ${flags}" type="button"${title} aria-label="${label}" onclick="clickTile(${cell.x},${cell.y})">${tileSprite}${objectBadge}${hint}</button>`);
    }
  }
  map.innerHTML = cells.join("");
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

// Render compact floor overview in the top-right minimap.
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

// Render always-visible icon meanings under the map.
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

// Swap the center map area into a focused battle board while an enemy is active.
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
        <div class="battle-meter enemy"><span style="width:${enemyPct}%"></span><b>${Math.max(0, Math.round(enemy.hp))}/${enemy.maxHp} HP</b></div>
        <p>攻击 ${enemy.atk} · 防御 ${enemy.def}</p>
      </div>
    </div>
    ${renderBattleCommandPanel(mpMax)}
  `;
}

function renderBattleCommandPanel(mpMax = effectiveMaxMp()) {
  const risk = state.currentEnemy ? battleRisk(state.currentEnemy) : null;
  const winRate = risk ? percentScore(risk.score) : null;
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
      <div class="battle-auto-panel battle-command-section">
        <div class="battle-panel-title">
          <span>战术</span>
          ${risk ? `<small>${risk.label}</small>` : "<small>评估</small>"}
        </div>
        <button class="battle-action auto" type="button" onclick="autoBattle()">
          <span class="battle-action-head"><b>一键战斗</b>${risk ? `<i class="battle-win-rate">胜率 ${winRate}%</i>` : ""}</span>
          <small>根据当前血量、属性和敌人强度自动结算</small>
        </button>
      </div>
    </div>
  `;
}

function percentScore(score) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(score) ? score * 100 : 0)));
}

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

// Convert a map object into its sprite markup.
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

// Add short visual labels to map objects.
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
    fenceGate: "栅",
    trap: "陷",
    portal: "门",
    stairsDown: "下",
    stairsUp: "上"
  };
  return labels[type] ? `<span class="tile-badge badge-${type}">${labels[type]}</span>` : "";
}

// Human-readable description for a map cell.
function tileLabel(cell, isPlayer = false, reveal = false) {
  if (!reveal && !cell.seen) return "未知区域";
  if (isPlayer) return `你的位置：${CLASSES[state.classId].name}`;
  if (cell.terrain === "wall") return "墙壁：无法通行";
  if (cell.terrain === "fence") return "铁栅栏：围住宝箱，寻找门栅入口";
  if (cell.terrain === "door") return "房间门：进入封闭房间";
  if (!cell.object) return "地面：可通行";
  if (cell.object.type === "trap") return "地面：可通行";
  const labels = {
    monster: "普通怪物：接触后进入战斗",
    elite: "精英怪：更危险，掉落更好",
    boss: "Boss：本层首领",
    chest: "宝箱：可能获得装备、符文或金币",
    lockedChest: "上锁宝箱：需要符文钥匙。钥匙可以从附近钥匙守卫、Boss或中立委托人处获得",
    altar: "符文祭坛：恢复生命和法力",
    forge: "合成台：强化装备或合成符文",
    shop: "商人：购买药水和补给",
    questNpc: "中立委托人：完成任务获得钥匙和金币",
    fenceGate: "符文门栅：有钥匙后可打开围栏入口",
    trap: "陷阱：触发后受到伤害",
    portal: "传送门：进入下一层",
    stairsDown: "下行楼梯：进入下一层",
    stairsUp: "上行楼梯：返回上一层"
  };
  return labels[cell.object.type] || "未知物体";
}

// Description of the most recently selected map tile.
function selectedTileText() {
  if (!selectedTile || !state?.map) return "";
  const cell = state.map.cells[selectedTile.y]?.[selectedTile.x];
  if (!cell || !cell.seen) return "";
  const isPlayer = cell.x === state.player.x && cell.y === state.player.y;
  return tileLabel(cell, isPlayer);
}

// Resolve the player sprite for the chosen class.
function assetForClass(classId) {
  if (classId === "mage") return ASSETS.mage;
  if (classId === "ranger") return ASSETS.ranger;
  return ASSETS.warrior;
}

// Shared image markup helper for map and panel sprites.
function imageTag(src, alt) {
  return `<img src="${src}" alt="${alt}" draggable="false">`;
}

// Wrap an image with object-specific classes for styling.
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

// Select a tile, moving if it is adjacent to the player.
function clickTile(x, y) {
  selectedTile = { x, y };
  const dx = x - state.player.x;
  const dy = y - state.player.y;
  if (Math.abs(dx) + Math.abs(dy) === 1) move(dx, dy);
  else render();
}

// Render context-sensitive actions: battle, shop, forge, or movement help.
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

// Render the currently selected side-panel tab.
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
    const def = QUEST_DEFS[quest.id] || { title: "未知任务", giverName: "未知", desc: "", rewardGold: 0 };
    const stateText = quest.claimed ? "已领取" : quest.completed ? "可领取" : "进行中";
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
          <small>${def.giverName} · 第 ${quest.floor} 层 · ${quest.kills}/${quest.target}</small>
          <p>${def.desc}</p>
          <small>${rewards}</small>
        </div>
        <span>${stateText}</span>
      </article>
    `;
  }).join("");
  return `<section class="quest-list">${rows}</section>`;
}

// Render inventory rows and item action buttons.
function renderInventory() {
  $("tabBody").innerHTML = inventoryGroupMarkup();
}

function inventoryGroupMarkup() {
  const potions = state.inventory
    .filter((entry) => entry.kind === "potion")
    .sort((a, b) => itemScore(b) - itemScore(a));
  const equipment = state.inventory
    .filter((entry) => entry.kind === "equip")
    .sort((a, b) => itemScore(b) - itemScore(a));
  const groups = {
    potions: inventoryGroup("potions", "药剂", potions.length ? potions.map(potionRow).join("") : `<p>暂无药剂。</p>`),
    equipment: inventoryGroup("equipment", "装备", equipment.length ? equipment.map(equipmentInventoryRow).join("") : `<p>暂无备用装备。</p>`),
    materials: inventoryGroup("materials", "材料", materialRows()),
    runes: inventoryGroup("runes", "符文", runeRows())
  };
  return `${inventorySubtabs()}${groups[activeInventoryTab] || groups.equipment}`;
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

function inventoryGroup(type, title, body) {
  return `<section class="inventory-group inventory-group-${type}"><h3>${title}</h3>${body}</section>`;
}

function potionRow(entry) {
  return `<div class="item-row"><div>${entry.name}<small>评分 ${itemScore(entry)} · 恢复 ${entry.amount}</small></div><button type="button" onclick="confirmUseItem('${entry.id}')">使用</button></div>`;
}

function equipmentInventoryRow(entry) {
  const better = isBetterThanEquipped(entry);
  const hasCurrent = !!state.equipment?.[entry.slot];
  const compare = hasCurrent ? equipmentCompareText(entry, "inline-equipment-compare") : "";
  return `<div class="item-row equip-row equipment-card ${better ? "better-equipment" : ""}">
    ${compare ? `<div class="equipment-compare-corner">${compare}</div>` : ""}
    <div><b>${entry.name}</b>${equipmentSummary(entry)}</div>
    <div class="equipment-actions inventory-equipment-actions">
      <button type="button" onclick="showInventoryEquipmentDetail('${entry.id}')">详情</button>
      <button type="button" onclick="confirmEquipItem('${entry.id}')">装备</button>
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
  showModal(entry.name, equipmentDetailMarkup(entry, SLOT_NAMES[entry.slot], runeText), [
    { text: "关闭", action: closeModal },
    { text: "装备", action: () => { closeModal(); equipItem(id); } }
  ]);
}

function materialRows() {
  const materials = Object.entries(state.materials || {}).filter(([, count]) => count > 0);
  if ((state.keys || 0) > 0) materials.unshift(["符文钥匙", state.keys]);
  return materials.length
    ? materials.map(([name, count]) => `<div class="item-row"><div>${name}<small>数量 ${count}</small></div></div>`).join("")
    : `<p>暂无材料。</p>`;
}

function runeRows() {
  const runes = Object.entries(state.runes || {}).filter(([, count]) => count > 0);
  return runes.length
    ? runes.map(([name, count]) => `<div class="item-row rune-row"><div>${name}符文<small>${runeEffectText(name)}。数量 ${count}，3 合 1 升级；需要镶嵌到带符文槽的装备上才生效。</small></div><button type="button" ${count >= 3 ? "" : "disabled"} onclick="confirmCraftRune('${name}')">合成</button></div>`).join("")
    : `<p>暂无符文。</p>`;
}

// Render equipped items and enhancement controls.
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

// Render materials, rune inventory, and rune-combine controls.
function renderCraft() {
  const runes = Object.entries(state.runes).filter(([, count]) => count > 0);
  $("tabBody").innerHTML = `
    <div class="item-row"><div>材料<small>强化石 ${state.materials["强化石"] || 0}，魔尘 ${state.materials["魔尘"] || 0}</small></div></div>
    ${runes.length ? runes.map(([name, count]) => `<div class="item-row"><div>${name}符文<small>数量 ${count}，3 合 1 升级</small></div><button type="button" ${count >= 3 ? "" : "disabled"} onclick="confirmCraftRune('${name}')">合成</button></div>`).join("") : "<p>暂无符文。</p>"}
  `;
}

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

// Format an equipment stat summary.
function statsText(eq) {
  return Object.entries(eq.stats).map(([key, value]) => {
    const enhance = eq.level ? `(+${eq.level})` : "";
    return `${STAT_NAMES[key] || key}+${value}${enhance}`;
  }).join(" ");
}

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
      <span class="compare-badge compare-badge-${direction}" aria-label="${scoreDelta >= 0 ? "更好" : "更坏"}">
        <span class="compare-arrow">${arrow}</span>
        <span>${scoreSign}${scoreDelta}</span>
      </span>
      <span class="compare-title">装备对比</span>
      <span class="${scoreClass}">评分差 ${scoreSign}${scoreDelta}</span>
      ${statDeltas.join("")}
    </small>
  `;
}

function effectiveItemStat(item, key) {
  if (!item) return 0;
  return (item.stats?.[key] || 0) + (item.stats?.[key] ? item.level || 0 : 0);
}

function enhanceText(eq) {
  return Object.keys(eq.stats).map((key) => `${STAT_NAMES[key] || key}+${eq.level}`).join(" ");
}

function equipmentDetailMarkup(eq, slotName, runeText) {
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
    </div>
  `;
}

function itemScore(item) {
  if (!item) return 0;
  if (item.kind === "potion") return item.amount || 0;
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

// Render newest adventure log entries.
function renderLog() {
  $("log").innerHTML = state.log.map((entry) => `<div>${entry}</div>`).join("");
}

// Add one message to the bounded adventure log.
function log(text) {
  state.log.unshift(text);
  state.log = state.log.slice(0, 80);
}

// Save the complete game state into localStorage.
function saveGame(show = true) {
  if (!state) return;
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  if (show) {
    log("游戏已保存。");
    render();
  }
}

// Restore saved state from localStorage if available.
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

function resetExploration() {
  for (const row of state.map.cells) {
    for (const cell of row) {
      cell.seen = false;
      cell.visible = false;
    }
  }
  state.map.explorationVersion = 2;
}

// Display a modal with caller-provided actions.
function showModal(title, body, actions) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = body;
  $("modalActions").innerHTML = actions.map((action, index) => `<button type="button" onclick="modalAction(${index})">${action.text}</button>`).join("");
  window._modalActions = actions;
  $("modal").classList.remove("hidden");
}

// Show an attention-grabbing map event message.
function showEvent(title, body, actionText = "确定") {
  showModal(title, body, [
    { text: actionText, action: closeModal }
  ]);
}

function showToast(message, duration = 2600) {
  const toast = $("toast");
  toast.innerHTML = message;
  toast.classList.add("show");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}

function showConfirm(title, body, confirmText, onConfirm) {
  showModal(title, body, [
    { text: "取消", action: closeModal },
    { text: confirmText, action: () => { closeModal(); onConfirm(); } }
  ]);
}

// Dispatch a modal button action by index.
function modalAction(index) {
  window._modalActions[index].action();
}

// Hide the current modal.
function closeModal() {
  $("modal").classList.add("hidden");
  window._modalActions = [];
  statDraft = null;
}

// Confirm before clearing localStorage and returning to class select.
function newGamePrompt() {
  showModal("新游戏", "<p>这会覆盖当前浏览器存档。确定要重新开始吗？</p>", [
    { text: "取消", action: closeModal },
    { text: "重新开始", action: () => { localStorage.removeItem(SAVE_KEY); state = null; closeModal(); render(); } }
  ]);
}
