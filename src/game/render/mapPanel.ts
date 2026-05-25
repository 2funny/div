import { ASSETS, CLASSES, LEGEND_ITEMS, MAP_VIEW_SIZE } from "../constants";
import { distance } from "../floor/mapGeometry";
import type { Enemy } from "../types/combat";
import type { Cell, CellObject } from "../types/map";
import type { GameState } from "../types/state";

export interface MapViewBounds {
  x: number;
  y: number;
  size: number;
}

export interface MinimapOverviewBounds {
  size: number;
  viewX: number;
  viewY: number;
  viewSize: number;
}

interface TileLabelContext {
  state: GameState;
  roomName: (roomId?: string | null) => string;
  enemyAffixText: (enemy: Enemy) => string;
}

interface MapMarkupContext extends TileLabelContext {
  isEnemyObject: (obj: any) => boolean;
  selectedTile?: { x: number; y: number } | null;
}

export function renderMapMarkup(ctx: MapMarkupContext, view = mapViewBounds(ctx.state)) {
  const { state } = ctx;
  const cells: string[] = [];
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
      const isSelected = ctx.selectedTile?.x === cell.x && ctx.selectedTile?.y === cell.y;
      const showObject = shouldShowMapObject(cell);
      const isInspectable = showObject && ctx.isEnemyObject(cell.object);
      const doorUnderlay =
        isPlayer && showObject && ["roomEntrance", "lockedDoor"].includes(cell.object!.type)
          ? objectSprite(cell.object as CellObject | Enemy)
          : "";
      const tileSprite = isPlayer
        ? `${doorUnderlay}${sprite(
            `player facing-${state.facing || "down"}`,
            assetForClass(state.classId),
            CLASSES[state.classId || "warrior"].name
          )}`
        : showObject
          ? objectSprite(cell.object as CellObject | Enemy)
          : "";
      const objectBadge = showObject ? badgeForObject(cell.object!.type) : "";
      const roomLabel = roomDoorLabel(cell, ctx.roomName);
      const roomLabelClass = [
        "room-label",
        "door-number",
        cell.object?.type === "lockedDoor" ? "locked-door-room-label" : ""
      ]
        .filter(Boolean)
        .join(" ");
      const roomBadge = roomLabel
        ? `<span class="${roomLabelClass}">${roomLabel}</span>`
        : "";
      const label = tileLabel(cell, ctx, isPlayer);
      const isPassiveRoomEntrance = cell.object?.type === "roomEntrance";
      const showHint =
        isPlayer ||
        (showObject && !isPassiveRoomEntrance) ||
        ["wall", "door", "fence", "lava"].includes(cell.terrain) ||
        (roomLabel && !isPassiveRoomEntrance);
      const hint = showHint ? `<span class="tile-hint">${label}</span>` : "";
      const flags = [
        terrain,
        isPlayer ? " current" : "",
        "",
        isSelected ? " selected" : "",
        cell.object ? ` object object-${cell.object.type}` : "",
        isInspectable ? " inspectable" : ""
      ].join("");
      cells.push(
        `<button class="tile ${flags}" type="button" aria-label="${label}" onclick="clickTile(${cell.x},${cell.y})">${tileSprite}${objectBadge}${roomBadge}${hint}</button>`
      );
    }
  }
  return cells.join("");
}

export function renderMinimapMarkup(ctx: MapMarkupContext, view = mapViewBounds(ctx.state)) {
  const { state } = ctx;
  const roomMarkers = minimapRoomMarkers(state);
  const cells: string[] = [];
  const size = state.map.size ?? state.map.cells.length;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = state.map.cells[y][x];
      const isPlayer = cell.x === state.player.x && cell.y === state.player.y;
      const marker = minimapMarker(
        cell,
        isPlayer,
        roomMarkers.get(`${cell.x},${cell.y}`),
        state.classId
      );
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
      const title = cell.object?.type === "roomEntrance" ? "" : ` title="${tileLabel(cell, ctx, isPlayer)}"`;
      cells.push(
        `<button class="${classes}" type="button"${title} onclick="selectMinimapTile(${cell.x},${cell.y})">${marker}</button>`
      );
    }
  }
  return `<div class="mini-grid">${cells.join("")}<span class="mini-view-frame"></span></div>`;
}

export function renderLegendMarkup(classId?: string) {
  const legendItems = LEGEND_ITEMS.filter(([type]) => type !== "portal").concat([
    ["stairsDown", "下层", "进入下一层"],
    ["stairsUp", "上层", "返回上一层"]
  ]);
  return legendItems
    .map(([type, label, desc]) => {
      const src = type === "player" ? assetForClass(classId) : ASSETS[type as keyof typeof ASSETS];
      return `
      <div class="legend-item" title="${desc}">
        ${src ? `<img src="${src}" alt="${label}" draggable="false">` : iconSprite(iconClassForType(type), label)}
        <span>${label}</span>
      </div>
    `;
    })
    .join("");
}

export function assetForClass(classId?: string) {
  if (classId === "mage") return ASSETS.mage;
  if (classId === "ranger") return ASSETS.ranger;
  return ASSETS.warrior;
}

export function imageTag(src: string, alt: string) {
  return `<img src="${src}" alt="${alt}" draggable="false">`;
}

export function sprite(cls: string, src: string, alt: string) {
  return `<span class="sprite ${cls}">${imageTag(src, alt)}</span>`;
}

export function iconSprite(cls: string, alt: string) {
  return `<span class="sprite icon-sprite ${cls}" aria-label="${alt}"></span>`;
}

export function iconClassForType(type: string) {
  if (type === "stairsDown") return "stairs-down";
  if (type === "stairsUp") return "stairs-up";
  if (type === "lockedDoor") return "locked-door";
  if (type === "roomEntrance") return "room-entrance";
  return type;
}

export function objectSprite(obj: CellObject | Enemy) {
  if (["monster", "elite", "boss"].includes(obj.type)) return enemySprite(obj as Enemy);
  const map: Record<string, [string, string | null, string]> = {
    monster: ["monster", ASSETS.monster, "怪物"],
    elite: ["elite", ASSETS.elite, "精英怪"],
    boss: ["boss", ASSETS.boss, "Boss"],
    chest: ["chest", ASSETS.chest, "宝箱"],
    lockedChest: ["locked-chest", ASSETS.chest, "上锁宝箱"],
    altar: ["altar", ASSETS.altar, "祭坛"],
    forge: ["forge", ASSETS.forge, "合成台"],
    shop: ["merchant", ASSETS.shop, "商人"],
    roomEvent: ["room-event", null, "探索事件"],
    guideNpc: ["quest-npc", ASSETS.questNpc, "引路人"],
    questNpc: ["quest-npc", ASSETS.questNpc, "委托人"],
    rescueNpc: ["quest-npc", ASSETS.questNpc, "被困者"],
    lockedDoor: ["locked-door", ASSETS.lockedDoor, "上锁房门"],
    roomEntrance: ["room-entrance", ASSETS.door, "房门"],
    fenceGate: ["fence-gate", ASSETS.fenceGate, "门栅"],
    trap: ["trap", ASSETS.trap, "陷阱"],
    portal: ["portal", ASSETS.portal, "传送门"],
    stairsDown: ["stairs-down", null, "下行楼梯"],
    stairsUp: ["stairs-up", null, "上行楼梯"]
  };
  const [cls, src, alt] = map[obj.type] || ["monster", ASSETS.monster, "怪物"];
  return src ? sprite(cls, src, alt) : iconSprite(cls, alt);
}

export function enemySprite(enemy: Enemy) {
  const variants: Record<string, [string, string, string]> = {
    slime: ["monster", ASSETS.monster, "史莱姆"],
    rat: ["monster rat", ASSETS.monsterRat, "洞窟鼠"],
    bat: ["monster bat", ASSETS.monsterBat, "矿洞蝙蝠"],
    wolf: ["monster wolf", ASSETS.monsterWolf, "冰霜狼"],
    elite: ["elite", ASSETS.elite, "精英怪"],
    boss: ["boss", ASSETS.boss, "Boss"]
  };
  const fallback = enemy.type === "boss" ? "boss" : enemy.type === "elite" ? "elite" : "slime";
  const variant = (enemy as Enemy & { variant?: string }).variant;
  const [cls, src, alt] = variants[variant || fallback] || variants[fallback];
  return sprite(cls, src, alt);
}

export function badgeForObject(type: string) {
  const labels: Record<string, string> = {
    monster: "怪",
    elite: "精",
    boss: "王",
    chest: "箱",
    lockedChest: "锁",
    altar: "坛",
    forge: "锻",
    shop: "商",
    roomEvent: "事",
    guideNpc: "引",
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

export function roomDoorLabel(
  cell: Pick<Cell, "terrain" | "roomId"> & {
    object?: { type?: string; roomId?: string | null; roomName?: string } | null;
  },
  roomName: TileLabelContext["roomName"]
) {
  const isRoomDoorObject = cell.object?.type === "roomEntrance" || cell.object?.type === "lockedDoor";
  if (cell.terrain !== "door" && !isRoomDoorObject) return "";
  const objectNumber = cell.object?.roomName?.match(/\d+/)?.[0];
  if (objectNumber) return objectNumber;
  const metadataName = roomName(cell.object?.roomId || cell.roomId);
  return metadataName.match(/\d+/)?.[0] || "";
}

export function shouldShowMapObject(cell: Pick<Cell, "object" | "seen">) {
  return !!cell.object && cell.seen && cell.object.type !== "trap";
}

export function mapViewBounds(state: GameState): MapViewBounds {
  const mapSize = state.map.size ?? state.map.cells.length;
  const preferred = typeof MAP_VIEW_SIZE === "number" ? MAP_VIEW_SIZE : mapSize;
  const size = Math.min(preferred, mapSize);
  const half = Math.floor(size / 2);
  const max = mapSize - size;
  return {
    x: Math.max(0, Math.min(max, state.player.x - half)),
    y: Math.max(0, Math.min(max, state.player.y - half)),
    size
  };
}

export function minimapOverviewBounds(state: GameState, view: MapViewBounds): MinimapOverviewBounds {
  const size = state.map.size ?? state.map.cells.length;
  return {
    size,
    viewX: (view.x / size) * 100,
    viewY: (view.y / size) * 100,
    viewSize: (view.size / size) * 100
  };
}

export function minimapMarker(
  cell: Cell,
  isPlayer: boolean,
  roomNumber = "",
  classId?: string
) {
  if (isPlayer) {
    const className = CLASSES[classId || "warrior"]?.name || "玩家";
    return `<span class="mini-dot mini-player-dot" aria-label="${className}"></span>`;
  }
  if (!cell.seen) return "";
  if (cell.object) {
    if (cell.object.type === "trap") return "";
    const icon = minimapObjectIcon(cell.object);
    return `<span class="mini-dot mini-${icon.cls}" aria-label="${icon.alt}"></span>`;
  }
  if (cell.terrain === "door") return `<span class="mini-dot mini-door" aria-label="房门"></span>`;
  if (roomNumber)
    return `<span class="mini-room-label" aria-label="${roomNumber}号房">${roomNumber}</span>`;
  return "";
}

export function minimapRoomMarkers(state: GameState) {
  const markers = new Map<string, string>();
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

function roomCenter(cells: Cell[]) {
  const total = cells.reduce((sum, cell) => ({ x: sum.x + cell.x, y: sum.y + cell.y }), {
    x: 0,
    y: 0
  });
  return { x: total.x / cells.length, y: total.y / cells.length };
}

export function minimapObjectIcon(obj: CellObject | Enemy) {
  if (["monster", "elite", "boss"].includes(obj.type)) {
    const variants: Record<string, { cls: string; src: string; alt: string }> = {
      slime: { cls: "monster", src: ASSETS.monster, alt: "怪物" },
      rat: { cls: "monster", src: ASSETS.monsterRat, alt: "洞窟鼠" },
      bat: { cls: "monster", src: ASSETS.monsterBat, alt: "矿洞蝙蝠" },
      wolf: { cls: "monster", src: ASSETS.monsterWolf, alt: "冰霜狼" },
      elite: { cls: "elite", src: ASSETS.elite, alt: "精英怪" },
      boss: { cls: "boss", src: ASSETS.boss, alt: "Boss" }
    };
    const enemy = obj as Enemy;
    const fallback = enemy.type === "boss" ? "boss" : enemy.type === "elite" ? "elite" : "slime";
    const variant = (enemy as Enemy & { variant?: string }).variant;
    return variants[variant || fallback] || variants[fallback];
  }
  const icons: Record<string, { cls: string; src: string | null; alt: string }> = {
    chest: { cls: "chest", src: ASSETS.chest, alt: "宝箱" },
    lockedChest: { cls: "locked-chest", src: ASSETS.chest, alt: "上锁宝箱" },
    altar: { cls: "altar", src: ASSETS.altar, alt: "祭坛" },
    forge: { cls: "forge", src: ASSETS.forge, alt: "合成台" },
    shop: { cls: "merchant", src: ASSETS.shop, alt: "商人" },
    guideNpc: { cls: "quest-npc", src: ASSETS.questNpc, alt: "引路人" },
    questNpc: { cls: "quest-npc", src: ASSETS.questNpc, alt: "委托人" },
    rescueNpc: { cls: "quest-npc", src: ASSETS.questNpc, alt: "被困者" },
    lockedDoor: { cls: "locked-door", src: ASSETS.lockedDoor, alt: "上锁房门" },
    roomEntrance: { cls: "door", src: ASSETS.door, alt: "房门" },
    fenceGate: { cls: "fence-gate", src: ASSETS.fenceGate, alt: "门栅" },
    trap: { cls: "trap", src: ASSETS.trap, alt: "陷阱" },
    portal: { cls: "portal", src: ASSETS.portal, alt: "传送门" },
    stairsDown: { cls: "stairs-down", src: null, alt: "下行楼梯" },
    stairsUp: { cls: "stairs-up", src: null, alt: "上行楼梯" }
  };
  return icons[obj.type] || { cls: "unknown", src: null, alt: "未知" };
}

export function tileLabel(cell: Cell, ctx: TileLabelContext, isPlayer = false, reveal = false) {
  if (!reveal && !cell.seen) return "未知区域";
  if (isPlayer) return `你的位置：${CLASSES[ctx.state.classId || "warrior"]?.name || "玩家"}`;
  if (cell.terrain === "wall") return "墙壁：无法通行";
  if (cell.terrain === "fence") return "铁栅栏：围住宝箱，寻找门栅入口";
  if (cell.terrain === "lava") return "岩浆：无法通行";
  if (cell.object?.type === "lockedDoor") {
    const obj = cell.object as CellObject;
    return `${obj.roomName || "上锁房门"}：需要${obj.keyName || "指定钥匙"}，或消耗 1 把万能钥匙`;
  }
  if (cell.terrain === "door") return "房间门：进入封闭房间";
  if (!cell.object) return "地面：可通行";
  if (cell.object.type === "trap") return "地面：可通行";
  const obj = cell.object as CellObject & Enemy & Record<string, any>;
  const labels: Record<string, string> = {
    monster: "普通怪物：接触后进入战斗",
    elite: `精英怪：更危险，掉落更好${obj.affix ? `，${ctx.enemyAffixText(obj)}` : ""}`,
    boss: "Boss：本层首领",
    chest: "宝箱：可能获得装备、符文或金币",
    lockedChest:
      "上锁宝箱：需要符文钥匙。钥匙可以从附近钥匙守卫、Boss或中立委托人处获得",
    altar: "符文祭坛：恢复生命和法力",
    forge: "合成台：强化装备或合成符文",
    shop: "商人：购买药水和补给",
    roomEvent: obj.name ? `${obj.name}：可互动事件` : "可互动事件",
    guideNpc: `${obj.npcName || "引路人"}：说明地牢背景，并交给你第一张残页`,
    questNpc: obj.npcName
      ? `${obj.npcName}：提供${obj.roomName || ctx.roomName(obj.roomId)}相关委托`
      : "中立委托人：完成任务获得钥匙和金币",
    rescueNpc: `${obj.npcName || "被困者"}：清理${ctx.roomName(obj.roomId)}后确认救援`,
    lockedDoor: `${obj.roomName || "上锁房门"}：需要${obj.keyName || "指定钥匙"}或万能钥匙`,
    roomEntrance: `${obj.roomName || ctx.roomName(obj.roomId) || "房间"}：未上锁入口，可直接通过`,
    fenceGate: "符文门栅：有钥匙后可打开围栏入口",
    trap: "陷阱：触发后受到伤害",
    portal: "传送门：进入下一层",
    stairsDown: obj.locked
      ? `封印楼梯：击败${obj.seal?.targetName || "封印守卫"}后才能进入下一层`
      : "下行楼梯：进入下一层",
    stairsUp: "上行楼梯：返回上一层"
  };
  return labels[cell.object.type] || "未知物体";
}
