import type { Player } from "./core";
import type { Enemy } from "./combat";

export type Terrain = "wall" | "floor" | "door" | "fence" | "lava";

export interface CellObject {
  type: string;
  name?: string;
  npcName?: string;
  questId?: string;
  roomId?: string;
  roomName?: string;
  rescueName?: string;
  target?: number;
  targetFloor?: number;
  keyId?: string;
  keyName?: string;
  doorKeyId?: string;
  doorKeyName?: string;
  [key: string]: unknown;
}

export interface Cell {
  x: number;
  y: number;
  terrain: Terrain;
  object: CellObject | Enemy | null;
  seen?: boolean;
  visible?: boolean;
  roomId?: string | null;
  mainPath?: boolean;
}

export interface Room {
  id: string;
  name: string;
  threat?: string;
  locked?: boolean;
  keyId?: string;
  keyName?: string;
  cells?: Cell[];
}

export interface GameMap {
  size?: number;
  effect?: {
    id: string;
    name: string;
    className: string;
    desc: string;
    difficulty: number;
    reward: number;
  } | null;
  cells: Cell[][];
  rooms?: Room[];
  stairsDown?: Player;
  stairsUp?: Player;
  explorationVersion?: number;
}
