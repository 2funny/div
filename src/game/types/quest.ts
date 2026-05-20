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

export interface LoreState {
  chapters: string[];
  pages: string[];
}

export interface NarrativeState {
  relations: Record<string, number>;
  flags: Record<string, boolean>;
  eventChoices: Record<string, string>;
  rescuedNpcIds: string[];
  merchantTrust: number;
  factionLeanings: Record<string, number>;
}
