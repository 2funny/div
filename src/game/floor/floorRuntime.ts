import { FLOOR_EFFECTS, MAP_SIZE_MAX, MAP_SIZE_MIN, MAX_FLOOR, THEMES } from "../constants";
import { ENEMY_AFFIXES } from "../combat/enemies";
import { ELEMENTS } from "../combat/elements";
import { roomEventsForFloor } from "../events/roomEvents";
import { choice, rand, random } from "../random";
import type { Cell } from "../types";
import {
  cardinalNeighbors,
  cellsWithin,
  distance,
  floorNeighborCount,
  validRoomDoor
} from "./mapGeometry";

const START_POSITION = { x: 1, y: 1 };
const START_SAFE_RADIUS = 4;
const THEME_ENEMY_POOLS = {
  moss: ["史莱姆", "洞穴鼠", "骸骨兵"],
  mine: ["矿洞蝙蝠", "诅咒矿工", "石像守卫"],
  frost: ["冰霜狼", "寒冰法徒", "冰晶魔像"],
  fungal: ["孢子行者", "菌毯潜伏者", "腐木守卫"],
  cistern: ["沉钟水鬼", "锈鳞爬行者", "潮汐侍从"],
  ember: ["余烬猎犬", "赤脉熔徒", "焦骨守卫"],
  archive: ["失页书记", "墨尘幽影", "缄默书卫"],
  astral: ["星砂祭司", "镜光游魂", "星盘守卫"],
  shadow: ["影幕刺客", "黑旗骑士", "暮色咒徒"],
  void: ["虚空回声", "无面巡礼者", "裂隙吞噬者"],
  throne: ["王座近卫", "符文审判者", "记忆缝合体"]
};

const THEME_BOSS_PROFILES = {
  moss: {
    name: "苔石门卫",
    element: "poison",
    weaknesses: ["fire", "thunder"],
    resistances: ["poison"],
    skills: [{ id: "root-bind", name: "根缚", type: "weaken", element: "poison", power: 0.86, chance: 0.34 }]
  },
  mine: {
    name: "矿脉巨像",
    element: "thunder",
    weaknesses: ["ice"],
    resistances: ["thunder", "poison"],
    skills: [{ id: "ore-shell", name: "矿壳", type: "guard", power: 1, chance: 0.36 }]
  },
  frost: {
    name: "霜厅狼王",
    element: "ice",
    weaknesses: ["fire", "thunder"],
    resistances: ["ice"],
    skills: [{ id: "whiteout", name: "白霜突袭", type: "damage", element: "ice", power: 1.18, chance: 0.38 }]
  },
  fungal: {
    name: "荧菌母巢",
    element: "poison",
    weaknesses: ["fire"],
    resistances: ["poison", "dark"],
    skills: [{ id: "spore-bloom", name: "孢潮", type: "drain", element: "poison", power: 0.96, chance: 0.32 }]
  },
  cistern: {
    name: "沉钟潮主",
    element: "ice",
    weaknesses: ["thunder"],
    resistances: ["ice", "poison"],
    skills: [{ id: "bell-tide", name: "钟潮", type: "weaken", element: "ice", power: 0.92, chance: 0.34 }]
  },
  ember: {
    name: "赤曜炉心",
    element: "fire",
    weaknesses: ["ice", "thunder"],
    resistances: ["fire"],
    skills: [{ id: "cinder-wave", name: "烬浪", type: "damage", element: "fire", power: 1.2, chance: 0.38 }]
  },
  archive: {
    name: "缄默典狱",
    element: "dark",
    weaknesses: ["holy", "fire"],
    resistances: ["dark"],
    skills: [{ id: "ink-seal", name: "墨封", type: "weaken", element: "dark", power: 0.9, chance: 0.36 }]
  },
  astral: {
    name: "星盘司祭",
    element: "holy",
    weaknesses: ["dark"],
    resistances: ["holy", "thunder"],
    skills: [{ id: "star-aegis", name: "星盾", type: "guard", power: 1, chance: 0.34 }]
  },
  shadow: {
    name: "影幕执旗者",
    element: "dark",
    weaknesses: ["holy", "fire"],
    resistances: ["dark"],
    skills: [{ id: "banner-drain", name: "黑旗汲取", type: "drain", element: "dark", power: 0.98, chance: 0.34 }]
  },
  void: {
    name: "裂隙朝圣者",
    element: "dark",
    weaknesses: ["holy"],
    resistances: ["dark", "poison"],
    skills: [{ id: "void-lash", name: "虚空鞭笞", type: "damage", element: "dark", power: 1.16, chance: 0.38 }]
  },
  throne: {
    name: "符文守王",
    element: "dark",
    weaknesses: ["holy", "fire"],
    resistances: ["dark", "thunder"],
    skills: [
      { id: "memory-decree", name: "记忆敕令", type: "weaken", element: "dark", power: 0.94, chance: 0.4 },
      { id: "throne-aegis", name: "王座护印", type: "guard", power: 1, chance: 0.34 }
    ]
  }
};

type ScatterOptions = {
  rooms?: Array<{ id: string; threat?: string }>;
  preferRooms?: boolean;
  minObjectDistance?: number;
};

type QuestNpcSource = {
  [key: string]: unknown;
  questId: string;
  npcName: string;
  avoidRoomId?: string;
  avoidRoomIds?: string[];
  roomName?: string;
  targetFloor?: number;
  targetRoomName?: string | null;
};

type GuardPlacementOptions = {
  avoidStartSafeZone?: boolean;
};

// 楼层运行时负责地图拓扑、房间标签、怪物/宝藏/任务点投放和楼梯封印。
export function createFloorRuntime({ getState, updateVisibility, ensureQuestList }) {
  let state = getState();
  const syncState = () => {
    state = getState();
    return state;
  };

  function themeForFloor(floor) {
    const exact = THEMES.find((theme) => theme.floors.includes(floor));
    if (exact) return exact;
    if (floor >= MAX_FLOOR - 2) return THEMES[THEMES.length - 1];
    const index = Math.min(
      THEMES.length - 2,
      Math.floor((floor - 1) / Math.ceil((MAX_FLOOR - 3) / (THEMES.length - 1)))
    );
    return THEMES[Math.max(0, index)];
  }

  // 生成半随机大地图，并保证入口到出口一定可达。
  function generateFloor() {
    const size = randomMapSize();
    const theme = themeForFloor(state.floor);
    const effect = chooseFloorEffect(theme);
    state._floorEffectDraft = effect;
    const map: Cell[][] = Array.from({ length: size }, (_, y) =>
      Array.from({ length: size }, (_, x) => ({
        x,
        y,
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
      placeLavaFields(map);
      const stairs = placeFloorStairs(map, false);
      state.map = {
        size,
        theme: theme.id,
        effect,
        cells: map,
        rooms: [],
        stairsUp: stairs.up,
        stairsDown: null,
        explorationVersion: 2
      };
    } else {
      const mainPath = carveMainRoute(map, START_POSITION.x, START_POSITION.y, size - 2, size - 2);
      widenMainRoute(map, mainPath);
      carveSideRooms(map, mainPath, sideRoomCountForFloor());
      const structuredRooms = carveStructuredRooms(map, mainPath, 7);
      carveFallbackStructuredRooms(map, Math.max(0, 5 - structuredRooms));
      pruneDisconnectedFloors(map);
      let rooms = assignRoomLabels(map);
      placeTreasureEncounters(map, treasureCountForFloor());
      scatter(map, "monster", monsterCountForFloor(), {
        preferRooms: true,
        minObjectDistance: 2,
        rooms
      });
      scatter(map, "trap", trapCountForFloor(), { minObjectDistance: 3 });
      scatter(map, "altar", altarCountForFloor(), { preferRooms: true, minObjectDistance: 6 });
      if (shouldPlaceMerchant()) scatter(map, "shop", 1, { minObjectDistance: 5 });
      if (state.floor % 3 === 2) scatter(map, "forge", 1, { minObjectDistance: 5 });
      resolveOutdoorFeatureCrowding(map);
      normalizeRoomDoors(map);
      expandOpenSpace(map, 0.275);
      smoothOutdoorWallNoise(map);
      rooms = assignRoomLabels(map);
      if (rooms.length < 5) {
        carveFallbackStructuredRooms(map, 5 - rooms.length);
        normalizeRoomDoors(map);
        expandOpenSpace(map, 0.275);
        smoothOutdoorWallNoise(map);
        rooms = assignRoomLabels(map);
      }
      if (rooms.length < 5) {
        carveFallbackStructuredRooms(map, 5 - rooms.length);
        normalizeRoomDoors(map);
        rooms = assignRoomLabels(map);
      }
      pruneDisconnectedFloors(map);
      rooms = assignRoomLabels(map);
      normalizeQuestTargetRooms(rooms);
      placeLavaFields(map);
      const rescueQuest = placeRescueQuest(map, rooms);
      ensureQuestRoomEncounters(map, rooms);
      if (!rescueQuest) placeQuestNpc(map, defaultQuestNpcSource());
      placeSkillTrainer(map);
      placeLockedRoomDoors(map, rooms);
      removeUnlockedRoomDoors(map);
      placeRoomEvents(map, rooms);
      const stairs = placeFloorStairs(map, true);
      state.map = {
        size,
        theme: theme.id,
        effect,
        cells: map,
        rooms,
        rescueQuest,
        stairsUp: stairs.up,
        stairsDown: stairs.down,
        explorationVersion: 2
      };
      state.player = { x: 1, y: 1 };
      state.facing = state.facing || "down";
      delete state._floorEffectDraft;
      updateVisibility();
      return;
    }

    state.player = { x: 1, y: 1 };
    state.facing = state.facing || "down";
    delete state._floorEffectDraft;
    updateVisibility();
  }

  function randomMapSize() {
    const min = MAP_SIZE_MIN;
    const max = MAP_SIZE_MAX;
    const steps = Math.floor((max - min) / 2);
    return min + rand(0, steps) * 2;
  }

  function chooseFloorEffect(theme) {
    if (isFinalFloor()) return FLOOR_EFFECTS.find((effect) => effect.id === "lava");
    if (state.floor < 4) return null;
    const chance = Math.min(0.26, 0.12 + state.floor * 0.006);
    if (random() > chance) return null;
    const available = FLOOR_EFFECTS.filter((effect) => state.floor >= effect.minFloor);
    if (!available.length) return null;
    if (theme.id === "frost") {
      const pool = available.filter((effect) => effect.id !== "rain");
      return choice(pool.length ? pool : available);
    }
    if (theme.id === "mine") {
      const pool = available.filter((effect) => effect.id !== "snow");
      return choice(pool.length ? pool : available);
    }
    return choice(available);
  }

  function currentFloorEffect() {
    return state?._floorEffectDraft ?? state?.map?.effect ?? null;
  }

  function floorEffectDifficulty() {
    return currentFloorEffect()?.difficulty || 1;
  }

  function floorEffectReward() {
    return currentFloorEffect()?.reward || 1;
  }

  function sideRoomCountForFloor() {
    return Math.min(17, 13 + Math.floor(state.floor * 0.35));
  }

  function monsterCountForFloor() {
    const bonus = currentFloorEffect() ? 1 : 0;
    return Math.min(16, 8 + Math.floor(state.floor * 0.58) + bonus);
  }

  function treasureCountForFloor() {
    return 4 + (state.floor >= 5 ? 1 : 0) + (currentFloorEffect() ? 1 : 0);
  }

  function trapCountForFloor() {
    return Math.min(
      6,
      2 + Math.floor(state.floor / 4) + (currentFloorEffect()?.id === "lava" ? 1 : 0)
    );
  }

  function altarCountForFloor() {
    if (state.floor <= 8) return 2;
    return 1 + (random() < 0.2 ? 1 : 0);
  }

  function shouldPlaceMerchant() {
    if (state.floor <= 8) {
      const earlyFloorBonus = state.floor <= 2 ? 0.08 : 0;
      return random() < Math.min(0.82, 0.68 + earlyFloorBonus);
    }
    if (state.floor <= 24) {
      return random() < Math.min(0.65, 0.55 + state.floor * 0.004);
    }
    return random() < 0.52;
  }

  function decorateMerchant(merchant) {
    merchant.id = merchant.id || `merchant-${state.floor}-${rand(1000, 9999)}`;
    return merchant;
  }

  // 判断当前楼层是否为最终 Boss 层。
  function isFinalFloor(floor = state.floor) {
    return floor >= MAX_FLOOR;
  }

  // 在当前楼层放置上下楼梯，下楼梯优先选择远处房间或路线尽头。
  function placeFloorStairs(map, includeDownstairs = true) {
    const upCell = state.floor > 1 ? chooseStairCell(map, "up", START_POSITION) : null;
    if (upCell) upCell.object = { type: "stairsUp" };
    const downCell = includeDownstairs
      ? chooseStairCell(map, "down", START_POSITION, upCell)
      : null;
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
    const minDistance = kind === "down" ? Math.max(10, Math.floor(map.length * 0.42)) : 4;
    const candidates = interiorCells(map)
      .filter((cell) => ["floor", "door"].includes(cell.terrain) && !cell.object)
      .filter((cell) => !(cell.x === 1 && cell.y === 1))
      .filter(
        (cell) => kind !== "down" || !(cell.x === map.length - 2 && cell.y === map.length - 2)
      )
      .filter((cell) => !otherStair || distance(cell, otherStair) >= 5)
      .filter((cell) => distance(cell, origin) >= minDistance);
    const endpointOrRoom =
      kind === "down"
        ? candidates.filter((cell) => cell.roomId || floorNeighborCount(map, cell.x, cell.y) <= 1)
        : candidates;
    const pool = endpointOrRoom.length ? endpointOrRoom : candidates;
    return (
      pool.sort((a, b) => stairScore(map, b, origin, kind) - stairScore(map, a, origin, kind))[0] ||
      null
    );
  }

  // 计算楼梯候选点分数：越远、越像房间或尽头越优先。
  function stairScore(map, cell, origin, kind) {
    const endpoint = floorNeighborCount(map, cell.x, cell.y) <= 1 ? 28 : 0;
    const room = cell.roomId ? 22 : 0;
    const door = cell.terrain === "door" ? 8 : 0;
    const mainPathPenalty = cell.mainPath && kind === "down" ? -10 : 0;
    return distance(cell, origin) * 2 + endpoint + room + door + mainPathPenalty + random();
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
    stairCell.object.seal = {
      type: "guardian",
      targetName: guardian.name,
      targetFloor: state.floor
    };
  }

  // 挖出一条简单保底路线，避免随机墙体导致楼层无法通关。
  function carvePath(map, sx, sy, tx, ty) {
    let x = sx;
    let y = sy;
    while (x !== tx || y !== ty) {
      map[y][x].terrain = "floor";
      if (x !== tx && (y === ty || random() > 0.45)) x += Math.sign(tx - x);
      else if (y !== ty) y += Math.sign(ty - y);
    }
    map[ty][tx].terrain = "floor";
  }

  // 挖出从入口到出口的主路线，其他房间和岔路会围绕这条路径生成。
  function carveMainRoute(map, sx, sy, tx, ty) {
    const path = [];
    let x = sx;
    let y = sy;
    let horizontalBias = random() > 0.5;
    while (x !== tx || y !== ty) {
      carveMainCell(map, x, y, path);
      if (x !== tx && y !== ty) {
        if (random() < 0.22) horizontalBias = !horizontalBias;
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
    const anchors = mainPath.filter(
      (cell) => cell.x > 3 && cell.y > 3 && cell.x < map.length - 4 && cell.y < map.length - 4
    );
    const trunkRooms = Math.min(4, Math.floor(count / 2), anchors.length);
    for (let i = 0; i < trunkRooms; i++) {
      const anchor = anchors[Math.floor(((i + 1) * anchors.length) / (trunkRooms + 1))];
      carveRoom(map, anchor.x, anchor.y, 2);
    }
    let placed = 0;
    let attempts = 0;
    const branchTarget = count - trunkRooms;
    while (placed < branchTarget && anchors.length && attempts < count * 10) {
      attempts++;
      const offset = Math.floor(((placed + 1) * anchors.length) / (branchTarget + 1));
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
    return dirs.sort(() => random() - 0.5);
  }

  // 生成带门和房间编号的结构化房间，供任务和宝藏使用。
  // 生成带 roomId 和门的结构化房间，供任务、危险标记和房间清理逻辑复用。
  function carveStructuredRooms(map, mainPath, count) {
    const anchors = mainPath.filter(
      (cell) => cell.x > 5 && cell.y > 5 && cell.x < map.length - 6 && cell.y < map.length - 6
    );
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
    return placed;
  }

  // 在主路旁构造一个有墙、有门的封闭房间。
  function carveStructuredRoom(map, anchor, dir, roomId) {
    const doorX = anchor.x + dir.x;
    const doorY = anchor.y + dir.y;
    const cx = anchor.x + dir.x * 5;
    const cy = anchor.y + dir.y * 5;
    const radius = 2;
    if (
      cx - radius <= 0 ||
      cy - radius <= 0 ||
      cx + radius >= map.length - 1 ||
      cy + radius >= map.length - 1
    )
      return false;
    const cells = [];
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        const cell = map[y]?.[x];
        if (!cell || cell.object || cell.roomId || cell.mainPath || cell.terrain !== "wall")
          return false;
        cells.push(cell);
      }
    }
    for (let i = 1; i <= 3; i++) {
      const cell = map[anchor.y + dir.y * i]?.[anchor.x + dir.x * i];
      if (!cell || cell.object || cell.roomId) return false;
    }
    for (const cell of cells) {
      const edge =
        cell.x === cx - radius ||
        cell.x === cx + radius ||
        cell.y === cy - radius ||
        cell.y === cy + radius;
      cell.terrain = edge ? "wall" : "floor";
      cell.roomId = roomId;
    }
    for (let i = 1; i <= 3; i++) {
      const cell = map[anchor.y + dir.y * i][anchor.x + dir.x * i];
      cell.terrain = i === 3 ? "door" : "floor";
      if (i === 3) cell.roomId = roomId;
      else delete cell.roomId;
    }
    map[doorY][doorX].terrain = "floor";
    delete map[doorY][doorX].roomId;
    return true;
  }

  function normalizeRoomDoors(map) {
    const rooms = new Map();
    for (const cell of map.flat()) {
      if (!cell.roomId) continue;
      const entry = rooms.get(cell.roomId) || { doors: [], floors: [], walls: [] };
      if (cell.terrain === "door") entry.doors.push(cell);
      if (cell.terrain === "floor") entry.floors.push(cell);
      if (cell.terrain === "wall") entry.walls.push(cell);
      rooms.set(cell.roomId, entry);
    }
    for (const [roomId, room] of rooms.entries()) {
      for (const door of room.doors) {
        if (validRoomDoor(map, door, roomId)) continue;
        door.terrain = "wall";
        delete door.roomId;
      }
      if (map.flat().some((cell) => cell.roomId === roomId && cell.terrain === "door")) continue;
      const candidate = room.walls.find((cell) => {
        const neighbors = cardinalNeighbors(map, cell.x, cell.y);
        return (
          neighbors.some((nearby) => nearby.roomId === roomId && nearby.terrain === "floor") &&
          neighbors.some((nearby) => !nearby.roomId && nearby.terrain === "floor")
        );
      });
      if (candidate) {
        candidate.terrain = "door";
        candidate.roomId = roomId;
      }
    }
  }

  function expandOpenSpace(map, targetRatio) {
    const target = Math.ceil(map.length * map.length * targetRatio);
    let floorCount = countCells(map, (cell) => cell.terrain === "floor");
    let attempts = 0;
    while (floorCount < target && attempts < 240) {
      attempts++;
      const candidates = outdoorExpansionCandidates(map, true);
      const fallback = candidates.length ? candidates : outdoorExpansionCandidates(map, false);
      if (!fallback.length) break;
      const cell = choice(fallback);
      cell.terrain = "floor";
      floorCount++;
    }
  }

  function outdoorExpansionCandidates(map, requireSmoothEdge = true) {
    return interiorCells(map)
        .filter((cell) => cell.terrain === "wall" && !cell.roomId && !cell.object)
        .filter((cell) => !cardinalNeighbors(map, cell.x, cell.y).some((nearby) => nearby.roomId))
        .filter((cell) => outdoorFloorNeighborCount(map, cell) >= (requireSmoothEdge ? 2 : 1));
  }

  function smoothOutdoorWallNoise(map) {
    for (let pass = 0; pass < 2; pass++) {
      const toOpen = interiorCells(map)
        .filter((cell) => cell.terrain === "wall" && !cell.roomId && !cell.object)
        .filter((cell) => !cardinalNeighbors(map, cell.x, cell.y).some((nearby) => nearby.roomId))
        .filter((cell) => outdoorFloorNeighborCount(map, cell) >= 3);
      if (!toOpen.length) break;
      for (const cell of toOpen) cell.terrain = "floor";
    }
  }

  function outdoorFloorNeighborCount(map, cell) {
    return cardinalNeighbors(map, cell.x, cell.y).filter(
      (nearby) => nearby.terrain === "floor" && !nearby.roomId
    ).length;
  }

  // 为所有房间统计可通行格子数量，并生成展示用房间名。
  // 扫描同一 roomId 的格子集合，并生成房间展示名和内部威胁等级。
  function assignRoomLabels(map) {
    const rooms: Record<string, { id: string; cells: number }> = {};
    for (const cell of mapCells(map)) {
      if (!cell.roomId || cell.terrain === "wall") continue;
      rooms[cell.roomId] = rooms[cell.roomId] || { id: cell.roomId, cells: 0 };
      rooms[cell.roomId].cells++;
    }
    return Object.values(rooms)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((room, index) => ({
        ...room,
        name: `${index + 1}号房`,
        threat: roomThreatForIndex(index)
      }));
  }

  // 给房间分配轻量威胁等级，用于影响房间内敌人强度。
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
    for (let i = 0; i < queue.length; i++) {
      const cell = queue[i];
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

  function placeLockedRoomDoors(map, rooms) {
    if (state.floor < 2 || !rooms?.length) return 0;
    const allCells = mapCells(map);
    const candidates = rooms
      .map((room) => {
        const door = allCells.find(
          (cell) => cell.terrain === "door" && cell.roomId === room.id && !cell.object
        );
        const cells = allCells.filter(
          (cell) => cell.roomId === room.id && cell.terrain === "floor"
        );
        return { ...room, door, cells };
      })
      .filter((room) => room.door && room.cells.length >= 4)
      .filter(
        (room) =>
          !room.cells.some((cell) =>
            ["questNpc", "rescueNpc", "shop", "forge", "stairsDown", "stairsUp"].includes(
              cell.object?.type
            )
          )
      )
      .sort((a, b) => lockedRoomScore(b) - lockedRoomScore(a));
    const target = Math.min(candidates.length, lockedRoomTargetCount());
    const selected = candidates.slice(0, target);
    const selectedRoomIds = selected.map((room) => room.id);
    let placed = 0;
    for (const room of selected) {
      if (
        room.cells.some((cell) =>
          ["questNpc", "rescueNpc", "shop", "forge", "stairsDown", "stairsUp"].includes(
            cell.object?.type
          )
        )
      )
        continue;
      const number = room.name.match(/\d+/)?.[0] || String(placed + 1);
      const keyId = `door-key-${state.floor}-${room.id}`;
      const keyName = `${number}号房钥匙`;
      room.door.object = {
        type: "lockedDoor",
        roomId: room.id,
        roomName: room.name,
        keyId,
        keyName,
        questId: "lockedRoomKey"
      };
      const source = {
        questId: "lockedRoomKey",
        npcName: "钥匙保管人",
        roomId: room.id,
        roomName: room.name,
        doorKeyId: keyId,
        doorKeyName: keyName,
        target: Math.min(3, 1 + Math.ceil(state.floor / 5)),
        targetFloor: state.floor,
        targetRoomName: null,
        avoidRoomId: room.id,
        avoidRoomIds: selectedRoomIds
      };
      const giver = placeQuestNpc(map, source);
      if (!giver) {
        room.door.object = null;
        continue;
      }
      const original = rooms.find((entry) => entry.id === room.id);
      if (original) {
        original.locked = true;
        original.keyId = keyId;
        original.keyName = keyName;
      }
      placed++;
    }
    return placed;
  }

  function lockedRoomScore(room) {
    const priority = { sealed: 5, treasure: 4, danger: 3, quiet: 1 }[room.threat] || 1;
    const center = roomCenter(room.cells);
    return priority * 16 + distance(center, START_POSITION) + random();
  }

  // 在空地面上散布怪物或地图物件，并按规则控制密度。
  // 在可通行格中散布对象，可按房间偏好、距离和拥挤度过滤候选点。
  function lockedRoomTargetCount() {
    const floorBudget = 1 + Math.floor(state.floor / 4);
    const lateFloorBonus = state.floor >= 8 && random() < 0.45 ? 1 : 0;
    return Math.min(4, floorBudget + lateFloorBonus);
  }

  function removeUnlockedRoomDoors(map) {
    let opened = 0;
    for (const cell of mapCells(map)) {
      if (cell.terrain !== "door" || cell.object?.type === "lockedDoor") continue;
      cell.terrain = "floor";
      cell.object = {
        type: "roomEntrance",
        roomId: cell.roomId || "",
        roomName: roomName(cell.roomId)
      };
      opened++;
    }
    return opened;
  }

  function placeRoomEvents(map, rooms = []) {
    const events = roomEventsForFloor(state.floor);
    if (!events.length) return 0;
    const lockedRoomIds = new Set(rooms.filter((room) => room.locked).map((room) => room.id));
    const count = Math.min(events.length, state.floor >= 8 ? 2 : 1);
    const candidates = interiorCells(map)
      .filter((cell) => cell.terrain === "floor" && !cell.object && !isInStartSafeZone(cell))
      .filter((cell) => !cell.roomId || !lockedRoomIds.has(cell.roomId))
      .filter((cell) => !isObjectCrowded(map, cell, { minObjectDistance: 4, preferRooms: true }))
      .sort(() => random() - 0.5);
    if (!candidates.length) {
      const fallback = interiorCells(map)
        .filter((cell) => cell.terrain === "floor" && !cell.object && !isInStartSafeZone(cell))
        .filter((cell) => !cell.roomId || !lockedRoomIds.has(cell.roomId))
        .sort((a, b) => distance(b, START_POSITION) - distance(a, START_POSITION))[0];
      if (!fallback) return 0;
      const event = choice(events);
      fallback.object = { type: "roomEvent", eventId: event.id, name: event.title };
      return 1;
    }
    let placed = 0;
    const used = new Set();
    for (const cell of candidates) {
      if (placed >= count) break;
      const pool = events.filter((event) => !used.has(event.id));
      if (!pool.length) break;
      const event = choice(pool);
      used.add(event.id);
      cell.object = {
        type: "roomEvent",
        eventId: event.id,
        name: event.title
      };
      placed++;
    }
    return placed;
  }

  function scatter(map, type, count, options: ScatterOptions = {}) {
    let placed = 0;
    let attempts = 0;
    const max = map.length - 2;
    while (placed < count && attempts < count * 80) {
      attempts++;
      const x = rand(1, max);
      const y = rand(1, max);
      const cell = map[y][x];
      if (
        cell.terrain === "floor" &&
        !cell.object &&
        !isInStartSafeZone(cell) &&
        !isObjectCrowded(map, cell, options)
      ) {
        const threat = roomThreatFromRooms(options.rooms, cell.roomId);
        const eliteChance = eliteChanceForThreat(threat);
        const object =
          type === "monster" ? makeEnemyWithVariant(random() < eliteChance) : { type };
        if (type === "shop") decorateMerchant(object);
        if (cell.roomId) object.roomId = cell.roomId;
        cell.object = object;
        placed++;
      }
    }
  }

  function isObjectCrowded(map, cell, options: ScatterOptions = {}) {
    if (options.preferRooms && !cell.roomId && random() < 0.72) return true;
    const minDistance = options.minObjectDistance || 0;
    if (!minDistance) return false;
    return cellsWithin(map, cell.x, cell.y, minDistance).some(
      (nearby) =>
        nearby !== cell && nearby.object && !["stairsDown", "stairsUp"].includes(nearby.object.type)
    );
  }

  function eliteChanceForThreat(threat = "quiet") {
    const base = Math.min(0.18, 0.045 + state.floor * 0.012);
    const bonus = threat === "sealed" ? 0.11 : threat === "danger" ? 0.075 : 0;
    return Math.min(0.28, base + bonus);
  }

  // 判断一个物件是否属于室外特征，用于后续调整过近的散布点。
  function isOutdoorFeature(cell) {
    return (
      !cell.roomId &&
      ["monster", "elite", "chest", "lockedChest", "altar"].includes(cell.object?.type)
    );
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
      .filter(
        (cell) =>
          !isInStartSafeZone(cell) &&
          !(cell.x === map.length - 2 && cell.y === map.length - 2)
      )
      .filter((cell) => kept.every((other) => distance(cell, other) > 1))
      .filter(
        (cell) => !cellsWithin(map, cell.x, cell.y, 1).some((nearby) => isOutdoorFeature(nearby))
      )
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
      placeGuardNear(map, center.x, center.y, false, { avoidStartSafeZone: true });
      return true;
    }
    return false;
  }

  // 在宝箱周围放置围栏，并留一个可交互门栅。
  function placeFenceRing(map, x, y) {
    const gate = choice(
      cardinalNeighbors(map, x, y).filter((cell) => cell.terrain === "floor" && !cell.object)
    );
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
      placeGuardNear(map, center.x, center.y, true, { avoidStartSafeZone: true });
      placeGuardNear(map, center.x, center.y, false, { avoidStartSafeZone: true });
      return true;
    }
    return false;
  }

  // 在死路位置放置宝箱，鼓励玩家探索分支。
  function placeDeadEndTreasure(map) {
    const candidates = interiorCells(map)
      .filter(
        (cell) =>
          canUseTreasureCell(map, cell.x, cell.y) && floorNeighborCount(map, cell.x, cell.y) <= 1
      )
      .sort((a, b) => treasureScore(map, b) - treasureScore(map, a));
    const cell = candidates[0];
    if (!cell) return false;
    markEncounterArea(map, cell.x, cell.y, 1);
    cell.object = { type: "chest" };
    placeGuardNear(map, cell.x, cell.y, true, { avoidStartSafeZone: true });
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
    placeGuardNear(map, cell.x, cell.y, true, { avoidStartSafeZone: true });
    return true;
  }

  // 挖出指定半径的普通房间，可选择绑定 roomId。
  function carveRoom(map, cx, cy, radius, roomId = null) {
    if (
      cx - radius <= 0 ||
      cy - radius <= 0 ||
      cx + radius >= map.length - 1 ||
      cy + radius >= map.length - 1
    )
      return false;
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (isInStartSafeZone(map[y][x])) return false;
        if (map[y][x].object || map[y][x].roomId) return false;
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
  function placeGuardNear(map, x, y, eliteChance = false, options: GuardPlacementOptions = {}) {
    const candidates = cellsWithin(map, x, y, 2)
      .filter(
        (cell) =>
          cell.terrain === "floor" &&
          !cell.object &&
          (!options.avoidStartSafeZone || !isInStartSafeZone(cell)) &&
          (cell.x !== x || cell.y !== y)
      )
      .sort((a, b) => distance(a, { x, y }) - distance(b, { x, y }));
    const guard = candidates[0];
    if (!guard) return false;
    guard.object = makeEnemyWithVariant(eliteChance && random() < 0.35);
    if (guard.roomId) guard.object.roomId = guard.roomId;
    return true;
  }

  // 在上锁宝箱附近生成必掉钥匙的精英守卫。
  function placeKeyGuardianNear(map, x, y) {
    const candidates = cellsWithin(map, x, y, 2)
      .filter(
        (cell) =>
          cell.terrain === "floor" &&
          !cell.object &&
          !isInStartSafeZone(cell) &&
          distance(cell, { x, y }) > 1
      )
      .sort((a, b) => distance(a, { x, y }) - distance(b, { x, y }));
    const guard = candidates[0];
    if (!guard) return false;
    guard.object = makeKeyGuardian();
    if (guard.roomId) guard.object.roomId = guard.roomId;
    return true;
  }

  // 为某个房间生成救援任务：放置被困者、怪物和任务发布者。
  function placeRescueQuest(map: Cell[][], rooms: Array<{ id: string; name: string; cells: number }>) {
    const room = rooms
      .map((entry) => ({
        ...entry,
        cells: map
          .flat()
          .filter((cell) => cell.roomId === entry.id && cell.terrain === "floor" && !cell.object)
      }))
      .filter((entry) => entry.cells.length >= 5)
      .sort(
        (a, b) =>
          distance(roomCenter(b.cells), START_POSITION) -
          distance(roomCenter(a.cells), START_POSITION)
      )[0];
    if (!room) return null;
    const prisoner = choice(room.cells);
    prisoner.object = {
      type: "rescueNpc",
      npcName: "矿工托兰",
      questId: "rescueRoom",
      roomId: room.id
    };
    const monsterCells = room.cells.filter((cell) => cell !== prisoner).slice(0, 3);
    const targetCount = Math.min(monsterCells.length, 1 + Math.floor((state.floor + 2) / 4));
    for (const cell of monsterCells.slice(0, targetCount)) {
      cell.object = makeEnemyWithVariant(state.floor >= 5 && random() < 0.18);
      cell.object.roomId = room.id;
    }
    const giver = placeQuestNpc(map, {
      questId: "rescueRoom",
      npcName: "救援斥候卡尔",
      roomId: room.id,
      roomName: room.name,
      rescueName: "矿工托兰",
      target: monsterCells.filter(
        (cell) => cell.object && ["monster", "elite"].includes(cell.object.type)
      ).length
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
  function roomCenter(cells: Cell[]) {
    const total = cells.reduce((sum, cell) => ({ x: sum.x + cell.x, y: sum.y + cell.y }), {
      x: 0,
      y: 0
    });
    return { x: total.x / cells.length, y: total.y / cells.length };
  }

  // 在地图上放置任务 NPC。
  function placeQuestNpc(
    map: Cell[][],
    source: QuestNpcSource = { questId: "wardenErrand", npcName: "巡夜人" }
  ) {
    const { avoidRoomId, avoidRoomIds, ...objectSource } = source;
    const blockedRoomIds = new Set([avoidRoomId, ...(avoidRoomIds || [])].filter(Boolean));
    const candidates = interiorCells(map)
      .filter(
        (cell) =>
          cell.terrain === "floor" && !cell.object && !isInStartSafeZone(cell, START_SAFE_RADIUS)
      )
      .filter((cell) => !cell.roomId || !blockedRoomIds.has(cell.roomId))
      .sort((a, b) => npcScore(map, b) - npcScore(map, a));
    const cell =
      candidates.find((candidate) =>
        cellsWithin(map, candidate.x, candidate.y, 3).some((nearby) => nearby.roomId)
      ) || candidates[0];
    if (!cell) return false;
    const targetFloor = source.targetFloor || nearbyQuestTargetFloor();
    const targetRoomName =
      source.roomName ||
      (targetFloor !== state.floor ? crossFloorTargetRoomName(targetFloor) : null);
    cell.object = { type: "questNpc", targetFloor, targetRoomName, ...objectSource };
    return cell;
  }

  function defaultQuestNpcSource(floor = state.floor): QuestNpcSource {
    if (floor >= 18 && floor % 7 === 0) {
      return {
        questId: "survivorTrace",
        npcName: "暗记记录员",
        target: 2,
        targetFloor: nearbyQuestTargetFloor(floor)
      };
    }
    if (floor >= 12 && floor % 4 === 0) {
      return {
        questId: "runeSurvey",
        npcName: "符文测绘员",
        target: 1,
        targetFloor: nearbyQuestTargetFloor(floor)
      };
    }
    if (floor >= 8 && floor % 6 === 0) {
      return {
        questId: "wardenSeal",
        npcName: "巡夜封印官",
        target: 2,
        targetFloor: nearbyQuestTargetFloor(floor)
      };
    }
    return { questId: "wardenErrand", npcName: "巡夜人" };
  }

  function placeSkillTrainer(map: Cell[][]) {
    if (state.floor < 3 || state.floor >= MAX_FLOOR) return false;
    if (!(state.floor % 5 === 3 || random() < 0.08)) return false;
    return placeQuestNpc(map, {
      questId: "skillTraining",
      npcName: classTrainerName(),
      trainer: true
    } as QuestNpcSource);
  }

  function classTrainerName() {
    const names = {
      warrior: "剑术导师",
      mage: "秘法导师",
      ranger: "游侠导师"
    };
    return names[state.classId] || "职业导师";
  }

  // 偶尔把普通委托目标放到相邻楼层，避免跨层距离过大。
  function nearbyQuestTargetFloor(floor = state.floor) {
    if (floor < 4 || floor % 5 !== 0) return floor;
    return Math.min(MAX_FLOOR - 1, floor + 1);
  }

  function crossFloorTargetRoomName(targetFloor) {
    return null;
  }

  function normalizeQuestTargetRooms(rooms) {
    if (!rooms?.length) return;
    const roomNames = new Set(rooms.map((room) => room.name));
    for (const quest of ensureQuestList()) {
      if (!quest.accepted || quest.claimed || quest.completed) continue;
      if (quest.id === "rescueRoom" || quest.targetFloor !== state.floor) continue;
      if (quest.targetRoomName && roomNames.has(quest.targetRoomName)) continue;
      quest.targetRoomName = boundedRoomName(quest.targetRoomName, rooms);
    }
  }

  function boundedRoomName(name, rooms) {
    const number = Number(name?.match(/\d+/)?.[0] || 1);
    const index = Math.max(0, Math.min(rooms.length - 1, number - 1));
    return rooms[index]?.name || rooms[0].name;
  }

  function ensureQuestRoomEncounters(map, rooms) {
    const quests = ensureQuestList()
      .filter((quest) => quest.accepted && !quest.claimed && !quest.completed)
      .filter(
        (quest) =>
          quest.id !== "rescueRoom" && quest.targetFloor === state.floor && quest.targetRoomName
      );
    for (const quest of quests) {
      const room = rooms.find((entry) => entry.name === quest.targetRoomName);
      if (!room) continue;
      const cells = map
        .flat()
        .filter((cell) => cell.roomId === room.id && cell.terrain === "floor");
      const existing = cells.filter((cell) =>
        ["monster", "elite"].includes(cell.object?.type)
      ).length;
      const needed = Math.max(0, Math.min(quest.target - quest.kills, 2) - existing);
      for (const cell of cells.filter((entry) => !entry.object).slice(0, needed)) {
        cell.object = makeEnemyWithVariant(false);
        cell.object.roomId = room.id;
      }
    }
  }

  function carveFallbackStructuredRooms(map, needed) {
    if (needed <= 0) return 0;
    let placed = 0;
    let serial = 0;
    const usedIds = new Set(
      map
        .flat()
        .map((cell) => cell.roomId)
        .filter(Boolean)
    );
    const centers = interiorCells(map)
      .filter(
        (cell) => cell.x > 3 && cell.y > 3 && cell.x < map.length - 4 && cell.y < map.length - 4
      )
      .sort(() => random() - 0.5);
    for (const center of centers) {
      if (placed >= needed) break;
      let roomId = `room-${state.floor}-fallback-${serial++}`;
      while (usedIds.has(roomId)) roomId = `room-${state.floor}-fallback-${serial++}`;
      if (carveFallbackStructuredRoom(map, center.x, center.y, roomId)) placed++;
      usedIds.add(roomId);
    }
    return placed;
  }

  function carveFallbackStructuredRoom(map, cx, cy, roomId) {
    const radius = 2;
    const cells = [];
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        const cell = map[y]?.[x];
        if (!cell || cell.object || cell.roomId || cell.mainPath) return false;
        cells.push(cell);
      }
    }
    const door = shuffledDirections()
      .map((dir) => {
        const edge = map[cy + dir.y * radius]?.[cx + dir.x * radius];
        const outside = map[cy + dir.y * (radius + 1)]?.[cx + dir.x * (radius + 1)];
        return { edge, outside };
      })
      .find(({ edge, outside }) => edge && outside && ["floor", "door"].includes(outside.terrain));
    if (!door) return false;
    for (const cell of cells) {
      const edge =
        cell.x === cx - radius ||
        cell.x === cx + radius ||
        cell.y === cy - radius ||
        cell.y === cy + radius;
      cell.terrain = edge ? "wall" : "floor";
      cell.roomId = roomId;
    }
    door.edge.terrain = "door";
    door.edge.roomId = roomId;
    return true;
  }

  function npcScore(map, cell) {
    const roomBonus = cell.roomId ? 8 : 0;
    const exit = { x: map.length - 2, y: map.length - 2 };
    return roomBonus + Math.min(12, distance(cell, exit)) - floorNeighborCount(map, cell.x, cell.y);
  }

  function interiorCells(map) {
    return mapCells(map).filter(
      (cell) => cell.x > 0 && cell.y > 0 && cell.x < map.length - 1 && cell.y < map.length - 1
    );
  }

  function mapCells(map) {
    const cells = [];
    for (const row of map) cells.push(...row);
    return cells;
  }

  function countCells(map, predicate) {
    let count = 0;
    for (const row of map) {
      for (const cell of row) {
        if (predicate(cell)) count++;
      }
    }
    return count;
  }

  function canUseTreasureCell(map, x, y) {
    const cell = map[y]?.[x];
    if (!cell || cell.terrain !== "floor" || cell.object) return false;
    if (isInStartSafeZone(cell) || (x === map.length - 2 && y === map.length - 2)) return false;
    return true;
  }

  function treasureScore(map, cell) {
    const exit = { x: map.length - 2, y: map.length - 2 };
    return (
      distance(cell, START_POSITION) +
      Math.min(8, distance(cell, exit)) -
      floorNeighborCount(map, cell.x, cell.y)
    );
  }

  function isInStartSafeZone(cell, radius = START_SAFE_RADIUS) {
    return distance(cell, START_POSITION) <= radius;
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
    const shouldAffix =
      eliteOrBoss ||
      enemy.roomBoss ||
      (state.floor >= 6 && random() < Math.min(0.18, 0.06 + state.floor * 0.01));
    if (!shouldAffix) return enemy;
      const affix = choice([...ENEMY_AFFIXES]);
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
    enemy.hp = Math.ceil(enemy.hp * 1.12);
    enemy.maxHp = enemy.hp;
    enemy.atk += state.floor >= 5 ? 2 : 1;
    enemy.gold += scaledReward(12);
    return enemy;
  }

  function placeLavaFields(map) {
    if (currentFloorEffect()?.id !== "lava") return 0;
    const floorCells = map.flat().filter((cell) => cell.terrain === "floor");
    const target = Math.max(4, Math.floor(floorCells.length * 0.035));
    let placed = 0;
    const candidates = floorCells
      .filter((cell) => !cell.object && !cell.roomId && !cell.mainPath)
      .filter((cell) => !isInStartSafeZone(cell, START_SAFE_RADIUS + 1))
      .sort(() => random() - 0.5);
    for (const cell of candidates) {
      if (placed >= target) break;
      cell.terrain = "lava";
      if (playableAreaIsConnected(map)) {
        placed++;
      } else {
        cell.terrain = "floor";
      }
    }
    return placed;
  }

  function playableAreaIsConnected(map) {
    const passable = (cell) => ["floor", "door"].includes(cell.terrain);
    const start = map[1]?.[1];
    const total = countCells(map, passable);
    if (!start || !passable(start) || total <= 0) return false;
    const key = (cell) => `${cell.x},${cell.y}`;
    const visited = new Set([key(start)]);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const cell = queue[i];
      for (const next of cardinalNeighbors(map, cell.x, cell.y)) {
        if (!passable(next) || visited.has(key(next))) continue;
        visited.add(key(next));
        queue.push(next);
      }
    }
    return visited.size === total;
  }

  // 按楼层、精英和 Boss 状态生成怪物数值。
  function makeEnemy(eliteOrBoss = false) {
    const floor = state.floor;
    const boss = isFinalFloor(floor);
    const deepFloor = Math.max(0, floor - 36);
    const names =
      floor < 4
        ? ["史莱姆", "洞穴鼠", "骷髅兵"]
        : floor < 7
          ? ["矿洞蝙蝠", "诅咒矿工", "石像守卫"]
          : ["冰霜狼", "寒冰法徒", "冰晶魔像"];
    const elite = eliteOrBoss && !boss;
    const hp = Math.round(
      (boss ? 90 + floor * 8 : elite ? 22 + floor * 5.2 : 12 + floor * 3) +
        (boss ? deepFloor * 8 : elite ? deepFloor * 2.2 : deepFloor * 0.7)
    );
    const enemy = {
      type: boss ? "boss" : elite ? "elite" : "monster",
      name: boss ? "符文守王" : elite ? `精英${choice(names)}` : choice(names),
      hp,
      maxHp: hp,
      atk: Math.round(
        (boss ? 14 + floor * 0.8 : elite ? 4 + floor * 0.86 : 2 + floor * 0.52) +
          (boss ? deepFloor * 0.18 : elite ? deepFloor * 0.12 : deepFloor * 0.05)
      ),
      def: Math.round(
        (boss ? 8 + floor * 0.25 : elite ? 1 + floor * 0.22 : floor * 0.08) +
          (boss ? deepFloor * 0.05 : elite ? deepFloor * 0.03 : 0)
      ),
      spd: Math.round(boss ? 8 + floor * 0.45 : elite ? 4 + floor * 0.5 : 2 + floor * 0.35),
      xp: scaledReward(boss ? 130 + floor * 6 : 4 + floor * 1.25 + (elite ? 7 : 0)),
      gold: scaledReward(boss ? 220 + floor * 7 : rand(3, 6) + floor + (elite ? 5 : 0))
    };
    applyThemeBossProfile(enemy, floor);
    applyThemeEnemyIdentity(enemy, floor);
    assignEnemyElement(enemy, names);
    assignEnemySkills(enemy);
    applyFloorEffectToEnemy(enemy);
    return maybeApplyEnemyAffix(enemy, eliteOrBoss);
  }

  function applyThemeBossProfile(enemy, floor = state.floor) {
    if (enemy.type !== "boss") return enemy;
    const themeId = themeForFloor(floor)?.id || "throne";
    const profile = THEME_BOSS_PROFILES[themeId] || THEME_BOSS_PROFILES.throne;
    enemy.name = profile.name;
    enemy.bossProfile = themeId;
    enemy.element = profile.element;
    enemy.weaknesses = [...profile.weaknesses];
    enemy.resistances = [...profile.resistances];
    enemy.skills = [...profile.skills];
    return enemy;
  }

  function applyThemeEnemyIdentity(enemy, floor = state.floor) {
    if (enemy.type === "boss") return enemy;
    const names = enemyNamesForTheme(themeForFloor(floor)?.id);
    const nextName = choice(names);
    enemy.name = enemy.type === "elite" ? `精英${nextName}` : nextName;
    return enemy;
  }

  function enemyNamesForTheme(themeId) {
    return THEME_ENEMY_POOLS[themeId] || THEME_ENEMY_POOLS.moss;
  }

  function assignEnemyElement(enemy, names = []) {
    const floor = state.floor || 1;
    const profile = monsterProfileForName(enemy.name);
    const byName =
      enemy.name.includes("寒冰") || enemy.name.includes("冰霜") || enemy.name.includes("冰晶")
        ? "ice"
        : enemy.name.includes("矿") || enemy.name.includes("石像")
          ? "thunder"
          : enemy.name.includes("符文") || enemy.type === "boss"
            ? "dark"
            : enemy.name.includes("史莱姆")
              ? "poison"
              : "";
    const themeElement =
      currentFloorEffect()?.id === "lava"
        ? "fire"
        : currentFloorEffect()?.id === "snow"
          ? "ice"
          : currentFloorEffect()?.id === "rain"
            ? "thunder"
            : "";
    const ladderElement =
      floor >= 10
        ? "dark"
        : floor >= 7
          ? "ice"
          : floor >= 4
            ? "thunder"
            : choice(["fire", "poison", "dark"]);
    const element = profile?.element || byName || themeElement || ladderElement;
    const def = ELEMENTS[element] || ELEMENTS.poison;
    enemy.element = def.value;
    enemy.weaknesses = enemy.weaknesses || [...(profile?.weaknesses || def.weakAgainst)];
    enemy.resistances = enemy.resistances || [...(profile?.resistances || def.strongAgainst)];
    if (enemy.type === "boss" && !enemy.weaknesses.includes("holy")) enemy.weaknesses.push("holy");
    if (enemy.type === "elite" && random() < 0.35) {
      enemy.resistances = [...new Set([...enemy.resistances, def.value])];
    }
    return enemy;
  }

  function monsterProfileForName(name = "") {
    const profiles = [
      { match: "史莱姆", element: "poison", weaknesses: ["thunder"], resistances: ["poison"] },
      { match: "洞穴鼠", element: "dark", weaknesses: ["holy"], resistances: ["poison"] },
      {
        match: "骷髅兵",
        element: "dark",
        weaknesses: ["holy", "fire"],
        resistances: ["poison", "dark"]
      },
      { match: "矿洞蝙蝠", element: "thunder", weaknesses: ["ice"], resistances: ["thunder"] },
      { match: "诅咒矿工", element: "dark", weaknesses: ["holy"], resistances: ["dark", "poison"] },
      {
        match: "石像守卫",
        element: "thunder",
        weaknesses: ["ice"],
        resistances: ["thunder", "poison"]
      },
      { match: "冰霜狼", element: "ice", weaknesses: ["fire"], resistances: ["ice"] },
      { match: "寒冰法徒", element: "ice", weaknesses: ["fire", "thunder"], resistances: ["ice"] },
      { match: "冰晶魔像", element: "ice", weaknesses: ["fire"], resistances: ["ice", "poison"] },
      { match: "符文守王", element: "dark", weaknesses: ["holy"], resistances: ["dark", "thunder"] }
    ];
    return themedMonsterProfileForName(name) || profiles.find((profile) => name.includes(profile.match));
  }

  function themedMonsterProfileForName(name = "") {
    const profiles = [
      { match: "孢子", element: "poison", weaknesses: ["fire"], resistances: ["poison"] },
      { match: "菌毯", element: "poison", weaknesses: ["fire", "ice"], resistances: ["poison", "dark"] },
      { match: "腐木", element: "poison", weaknesses: ["fire"], resistances: ["poison"] },
      { match: "水鬼", element: "ice", weaknesses: ["thunder"], resistances: ["ice"] },
      { match: "锈鳞", element: "thunder", weaknesses: ["ice"], resistances: ["thunder"] },
      { match: "潮汐", element: "ice", weaknesses: ["thunder"], resistances: ["ice", "poison"] },
      { match: "余烬", element: "fire", weaknesses: ["ice"], resistances: ["fire"] },
      { match: "赤脉", element: "fire", weaknesses: ["ice", "thunder"], resistances: ["fire"] },
      { match: "焦骨", element: "fire", weaknesses: ["ice"], resistances: ["fire", "dark"] },
      { match: "失页", element: "dark", weaknesses: ["holy"], resistances: ["dark"] },
      { match: "墨尘", element: "dark", weaknesses: ["holy", "fire"], resistances: ["dark"] },
      { match: "书卫", element: "thunder", weaknesses: ["ice"], resistances: ["thunder", "dark"] },
      { match: "星砂", element: "holy", weaknesses: ["dark"], resistances: ["holy"] },
      { match: "镜光", element: "holy", weaknesses: ["dark", "thunder"], resistances: ["holy"] },
      { match: "星盘", element: "thunder", weaknesses: ["dark"], resistances: ["thunder", "holy"] },
      { match: "影幕", element: "dark", weaknesses: ["holy"], resistances: ["dark"] },
      { match: "黑旗", element: "dark", weaknesses: ["holy", "fire"], resistances: ["dark"] },
      { match: "暮色", element: "dark", weaknesses: ["holy"], resistances: ["dark", "poison"] },
      { match: "虚空", element: "dark", weaknesses: ["holy"], resistances: ["dark", "thunder"] },
      { match: "无面", element: "dark", weaknesses: ["holy", "fire"], resistances: ["dark"] },
      { match: "裂隙", element: "dark", weaknesses: ["holy"], resistances: ["dark", "poison"] },
      { match: "王座", element: "dark", weaknesses: ["holy"], resistances: ["dark"] },
      { match: "审判", element: "holy", weaknesses: ["dark"], resistances: ["holy", "thunder"] },
      { match: "缝合", element: "dark", weaknesses: ["holy", "fire"], resistances: ["dark"] }
    ];
    return profiles.find((profile) => name.includes(profile.match));
  }

  function assignEnemySkills(enemy) {
    const floor = state.floor || 1;
    const skillChance =
      enemy.type === "boss"
        ? 1
        : enemy.type === "elite" || enemy.roomBoss
          ? floor >= 4
            ? 0.9
            : 0.45
          : floor >= 6
            ? Math.min(0.5, 0.16 + floor * 0.015)
            : 0;
    if (random() > skillChance) return enemy;
    const pool = enemySkillPool(enemy);
    const skillCount = enemy.type === "boss" ? 3 : enemy.type === "elite" || enemy.roomBoss ? 2 : 1;
    enemy.skills = enemy.skills || [];
    while (enemy.skills.length < skillCount && pool.length) {
      const skill = choice(pool);
      if (!enemy.skills.some((entry) => entry.id === skill.id)) enemy.skills.push(skill);
      else pool.splice(pool.indexOf(skill), 1);
    }
    return enemy;
  }

  function enemySkillPool(enemy) {
    const element = enemy.element || "dark";
    const pool = [
      {
        id: `${element}-strike`,
        name: `${ELEMENTS[element]?.name || "暗"}袭`,
        type: "damage",
        element,
        power: 1.12,
        chance: 0.34
      },
      { id: "harden", name: "硬化", type: "guard", power: 1, chance: 0.22 },
      { id: "regenerate", name: "再生", type: "heal", power: 0.16, chance: 0.18 },
      { id: "drain-touch", name: "汲取", type: "drain", element: "dark", power: 0.92, chance: 0.2 },
      { id: "hex", name: "虚弱咒", type: "weaken", element: "dark", power: 0.82, chance: 0.18 }
    ];
    if (enemy.name.includes("石像") || enemy.name.includes("魔像")) {
      pool.unshift({ id: "stone-skin", name: "石肤", type: "guard", power: 1, chance: 0.34 });
    }
    if (enemy.name.includes("法徒")) {
      pool.unshift({
        id: "ice-lance",
        name: "冰枪",
        type: "damage",
        element: "ice",
        power: 1.18,
        chance: 0.38
      });
    }
    if (enemy.name.includes("诅咒") || enemy.name.includes("符文")) {
      pool.unshift({
        id: "dark-curse",
        name: "暗咒",
        type: "weaken",
        element: "dark",
        power: 0.88,
        chance: 0.3
      });
    }
    return pool;
  }

  function applyFloorEffectToEnemy(enemy) {
    const difficulty = floorEffectDifficulty();
    if (difficulty <= 1) return enemy;
    enemy.hp = Math.max(1, Math.round(enemy.hp * difficulty));
    enemy.maxHp = enemy.hp;
    enemy.atk = Math.max(1, Math.round(enemy.atk * (1 + (difficulty - 1) * 0.75)));
    enemy.def = Math.max(0, Math.round(enemy.def * (1 + (difficulty - 1) * 0.45)));
    return enemy;
  }

  function scaledReward(value) {
    return Math.max(1, Math.round(value * floorEffectReward()));
  }
  const withState =
    (fn) =>
    (...args) => {
      syncState();
      return fn(...args);
    };

  return {
    enemyAffixText,
    generateFloor: withState(generateFloor),
    makeEnemy: withState(makeEnemy),
    makeEnemyWithVariant: withState(makeEnemyWithVariant),
    placeGuardNear: withState(placeGuardNear),
    placeTreasureEncounters: withState(placeTreasureEncounters),
    roomName: withState(roomName),
    roomThreat: withState(roomThreat),
    floorEffectReward: withState(floorEffectReward),
    themeForFloor: withState(themeForFloor)
  };
}
