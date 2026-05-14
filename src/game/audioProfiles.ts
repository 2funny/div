export interface SoundProfile {
  type: OscillatorType;
  start: number;
  end: number;
  duration: number;
  volume: number;
  attack?: number;
  filter?: number;
  harmonic?: SoundProfile;
  harmonicDelay?: number;
  noise?: {
    duration: number;
    volume: number;
    attack?: number;
    filter?: number;
  };
}

const profiles: Record<string, SoundProfile> = {
  ready: { type: "sine", start: 392, end: 659, duration: 0.2, volume: 0.16, attack: 0.014, filter: 1700, harmonic: { type: "sine", start: 523, end: 784, duration: 0.14, volume: 0.07, attack: 0.012, filter: 2100 }, harmonicDelay: 0.06 },
  step: { type: "triangle", start: 104, end: 72, duration: 0.07, volume: 0.16, attack: 0.004, filter: 560, harmonic: { type: "sine", start: 160, end: 112, duration: 0.045, volume: 0.05, attack: 0.003, filter: 980 } },
  encounter: { type: "sine", start: 165, end: 123, duration: 0.18, volume: 0.1, attack: 0.018, filter: 650 },
  attack: { type: "triangle", start: 185, end: 132, duration: 0.07, volume: 0.09, attack: 0.004, filter: 820 },
  hurt: { type: "sine", start: 110, end: 78, duration: 0.1, volume: 0.095, attack: 0.004, filter: 520 },
  guard: { type: "sine", start: 123, end: 98, duration: 0.12, volume: 0.082, attack: 0.012, filter: 480 },
  spell: { type: "sine", start: 392, end: 587, duration: 0.2, volume: 0.105, attack: 0.03, filter: 1500, harmonic: { type: "sine", start: 523, end: 784, duration: 0.14, volume: 0.052, attack: 0.024, filter: 1900 }, harmonicDelay: 0.05 },
  chest: { type: "sine", start: 523, end: 1046, duration: 0.28, volume: 0.24, attack: 0.01, filter: 2600, harmonic: { type: "triangle", start: 784, end: 1318, duration: 0.2, volume: 0.14, attack: 0.012, filter: 3200 }, harmonicDelay: 0.06 },
  hit: { type: "triangle", start: 170, end: 82, duration: 0.1, volume: 0.095, attack: 0.004, filter: 760 },
  cast: { type: "sine", start: 294, end: 587, duration: 0.2, volume: 0.105, attack: 0.024, filter: 1600 },
  altar: { type: "sine", start: 330, end: 660, duration: 0.38, volume: 0.15, attack: 0.04, filter: 2100, harmonic: { type: "sine", start: 495, end: 990, duration: 0.32, volume: 0.08, attack: 0.04, filter: 2600 }, harmonicDelay: 0.08 },
  quest: { type: "sine", start: 349, end: 698, duration: 0.2, volume: 0.12, attack: 0.018, filter: 1900, harmonic: { type: "sine", start: 523, end: 784, duration: 0.16, volume: 0.06, attack: 0.018, filter: 2300 }, harmonicDelay: 0.07 },
  sell: { type: "sine", start: 659, end: 880, duration: 0.11, volume: 0.11, attack: 0.01, filter: 2400, harmonic: { type: "sine", start: 880, end: 1175, duration: 0.09, volume: 0.055, attack: 0.008, filter: 3000 }, harmonicDelay: 0.05 },
  danger: { type: "sine", start: 146, end: 73, duration: 0.26, volume: 0.12, attack: 0.02, filter: 620 }
};

export function soundProfile(kind: string): SoundProfile {
  return profiles[kind] || profiles.step;
}

