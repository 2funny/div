type RandomSource = () => number;

let randomSource: RandomSource | null = null;

export function random(): number {
  return (randomSource || Math.random)();
}

export function setRandomSource(source: RandomSource = Math.random): void {
  randomSource = source;
}

export function resetRandomSource(): void {
  randomSource = null;
}

export function createSeededRandom(seed: number | string): RandomSource {
  let value = seedToUint32(seed);
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function setRandomSeed(seed: number | string): RandomSource {
  const source = createSeededRandom(seed);
  setRandomSource(source);
  return source;
}

function seedToUint32(seed: number | string): number {
  if (typeof seed === "number") return seed >>> 0;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function rand(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

export function choice<T>(list: T[]): T {
  return list[rand(0, list.length - 1)];
}

export function uid(): string {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id-${Date.now()}-${random().toString(16).slice(2)}`;
}
