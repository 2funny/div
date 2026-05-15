import type { Cell } from "../types";

// 地图几何工具保持纯函数，供生成、交互、渲染和传送逻辑共享。
export function cardinalNeighbors<T extends Cell>(map: T[][], x: number, y: number): T[] {
  return [map[y - 1]?.[x], map[y + 1]?.[x], map[y]?.[x - 1], map[y]?.[x + 1]].filter(
    Boolean
  ) as T[];
}

export function cellsWithin<T extends Cell>(map: T[][], x: number, y: number, radius: number): T[] {
  const cells: T[] = [];
  for (let yy = Math.max(1, y - radius); yy <= Math.min(map.length - 2, y + radius); yy++) {
    for (let xx = Math.max(1, x - radius); xx <= Math.min(map.length - 2, x + radius); xx++) {
      if (Math.abs(xx - x) + Math.abs(yy - y) <= radius) cells.push(map[yy][xx]);
    }
  }
  return cells;
}

export function distance(a: Pick<Cell, "x" | "y">, b: Pick<Cell, "x" | "y">): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function floorNeighborCount(map: Cell[][], x: number, y: number): number {
  return cardinalNeighbors(map, x, y).filter((cell) => cell.terrain === "floor").length;
}

export function validRoomDoor(map: Cell[][], door: Cell, roomId: string): boolean {
  const neighbors = cardinalNeighbors(map, door.x, door.y);
  const roomFloorCount = neighbors.filter(
    (cell) => cell.roomId === roomId && cell.terrain === "floor"
  ).length;
  const outsideFloorCount = neighbors.filter(
    (cell) => !cell.roomId && cell.terrain === "floor"
  ).length;
  const wallCount = neighbors.filter((cell) => cell.terrain === "wall").length;
  return roomFloorCount >= 1 && outsideFloorCount >= 1 && wallCount >= 1;
}
