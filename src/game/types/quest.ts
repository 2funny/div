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
