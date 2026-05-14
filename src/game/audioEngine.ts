import type { SoundProfile } from "./audioProfiles";

export type AudioOutput = AudioNode;

export function playToneLayer(
  ctx: AudioContext,
  output: AudioOutput,
  startAt: number,
  profile: SoundProfile
): void {
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  const endAt = startAt + profile.duration;
  osc.type = profile.type;
  osc.frequency.setValueAtTime(profile.start, startAt);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, profile.end), endAt);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(profile.filter || 1400, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.linearRampToValueAtTime(profile.volume, startAt + (profile.attack || 0.01));
  gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  osc.start(startAt);
  osc.stop(endAt + 0.02);
}

export function playNoiseLayer(
  ctx: AudioContext,
  output: AudioOutput,
  startAt: number,
  profile: NonNullable<SoundProfile["noise"]>
): void {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * profile.duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.value = profile.filter || 900;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.linearRampToValueAtTime(profile.volume, startAt + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + profile.duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  source.start(startAt);
  source.stop(startAt + profile.duration + 0.02);
}

