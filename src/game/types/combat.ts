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
  element?: string;
  weaknesses?: string[];
  resistances?: string[];
  skills?: EnemySkill[];
  _guard?: number;
  defeated?: boolean;
  roomId?: string;
  dropsKey?: boolean;
  roomBoss?: boolean;
}

export interface EnemySkill {
  id: string;
  name: string;
  type: "damage" | "guard" | "heal" | "drain" | "weaken";
  power?: number;
  element?: string;
  chance?: number;
}
