export interface BattleFxEntry {
  type?: string;
  text?: string;
  label?: string;
  seq?: string;
}

export interface BattleFxState {
  kind: string;
  hero: BattleFxEntry | null;
  enemy: BattleFxEntry | null;
  center: BattleFxEntry | null;
  seq: number;
}

let battleFx: BattleFxState | null = null;

export function getBattleFx(): BattleFxState | null {
  return battleFx;
}

export function clearBattleFx(): void {
  battleFx = null;
}

export function resetBattleFx(kind = "action"): void {
  battleFx = { kind, hero: null, enemy: null, center: null, seq: Date.now() };
}

export function setBattleFx(target: "hero" | "enemy" | "center", data: BattleFxEntry): void {
  if (!battleFx) resetBattleFx();
  if (!battleFx) return;
  battleFx[target] = { ...data, seq: `${battleFx.seq}-${target}` };
}

