export type StatKey = "atk" | "mag" | "def" | "res" | "spd" | "luk";
export type SlotKey = "weapon" | "armor" | "boots" | "ring" | "amulet";
export type Terrain = "wall" | "floor" | "door" | "fence" | "lava";

export interface Stats {
  atk?: number;
  mag?: number;
  def?: number;
  res?: number;
  spd?: number;
  luk?: number;
  hp?: number;
  mp?: number;
}

export interface Skill {
  id: string;
  name: string;
  mp: number;
  desc: string;
  type: string;
  scale?: StatKey;
  power: number;
}

export interface PlayerClass {
  name: string;
  avatar: string;
  role: string;
  primary: string;
  desc: string;
  stats: Record<StatKey, number>;
  hp: number;
  mp: number;
  growth: {
    hp: number;
    mp: number;
    primary: StatKey;
    primaryEvery: number;
    secondary: StatKey;
    secondaryEvery: number;
  };
  skills: Skill[];
}

export interface Player {
  x: number;
  y: number;
}

export interface Enemy {
  type?: string;
  name: string;
  hp: number;
  maxHp: number;
  atk?: number;
  def?: number;
  res?: number;
  spd?: number;
  luk?: number;
  affix?: string;
  defeated?: boolean;
  roomId?: string;
  dropsKey?: boolean;
  roomBoss?: boolean;
}

export interface Item {
  id: string;
  kind: string;
  name: string;
  type?: string;
  slot?: SlotKey;
  quality?: string;
  stats?: Stats;
  runeSlots?: number;
  runes?: string[];
  level?: number;
  amount?: number;
  effect?: string;
}

export type EquipmentSet = Record<SlotKey, Item | null>;

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

export interface QuestState {
  id: string;
  giver?: string;
  floor: number;
  targetFloor?: number;
  kills: number;
  target: number;
  roomId?: string | null;
  roomName?: string | null;
  targetRoomName?: string | null;
  rescueName?: string | null;
  doorKeyId?: string | null;
  doorKeyName?: string | null;
  roomCleared?: boolean;
  rescued?: boolean;
  accepted: boolean;
  completed: boolean;
  claimed: boolean;
}

export interface GameState {
  floor: number;
  classId?: string;
  player: Player;
  facing?: string;
  map: GameMap;
  floorStates?: Record<string, Partial<GameState>>;
  inventory: Item[];
  equipment?: Partial<Record<SlotKey, Item | null>>;
  currentEnemy?: Enemy | null;
  gold?: number;
  keys?: number;
  universalKeys?: number;
  doorKeys?: Record<string, number>;
  doorKeyNames?: Record<string, string>;
  hp?: number;
  mp?: number;
  xp?: number;
  xpNext?: number;
  level?: number;
  statPoints?: number;
  skillPoints?: number;
  skillDust?: number;
  quest?: QuestState;
  quests?: QuestState[];
  log: string[];
  [key: string]: unknown;
}

export interface ModalAction {
  text: string;
  action: () => void;
}
