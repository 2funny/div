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
  _lastSkillId?: string;
  _phaseFlags?: string[];
  _phaseScriptIds?: string[];
  _bossMechanicFlags?: string[];
  _bossNextIntent?: EnemySkill["type"] | "";
  statuses?: Partial<Record<DamageStatusType, DamageStatus>>;
  defeated?: boolean;
  roomId?: string;
  dropsKey?: boolean;
  roomBoss?: boolean;
}

export type DamageStatusType = "burn" | "poison";

export interface DamageStatus {
  type: DamageStatusType;
  name: string;
  damage: number;
  turns: number;
  element?: string;
}

export interface EnemySkill {
  id: string;
  name: string;
  type: "damage" | "guard" | "heal" | "drain" | "weaken";
  power?: number;
  element?: string;
  chance?: number;
}
