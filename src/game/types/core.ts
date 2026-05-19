export type StatKey = "atk" | "mag" | "def" | "res" | "spd" | "luk";
export type SlotKey = "weapon" | "armor" | "boots" | "ring" | "amulet";

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
  cooldown?: number;
  desc: string;
  type: string;
  scale?: StatKey;
  power: number;
  baseDamage?: number;
  atkMultiplier?: number;
  magMultiplier?: number;
  hpMultiplier?: number;
  defMultiplier?: number;
  element?: string;
  branches?: SkillBranch[];
}

export interface SkillBranch {
  id: string;
  name: string;
  desc: string;
  powerBonus?: number;
  mpDelta?: number;
  element?: string;
  statusBonus?: number;
  pierceResist?: boolean;
  cooldownDelta?: number;
}

export interface PassiveEffect {
  id: string;
  name: string;
  desc: string;
  tags?: string[];
  chanceBase?: number;
  chancePerSpeed?: number;
  chanceMax?: number;
  value?: number;
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
  passives?: PassiveEffect[];
  skills: Skill[];
}

export interface Player {
  x: number;
  y: number;
}
