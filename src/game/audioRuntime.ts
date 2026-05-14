// @ts-nocheck
import { MASTER_VOLUME } from "./data";
import { choice, rand } from "./random";
import { soundProfile } from "./audioProfiles";
import { playNoiseLayer, playToneLayer } from "./audioEngine";

export function createAudioRuntime({ $, getState, isDefeatedEnemy }) {
  let audioState = null;
  let audioEnabled = localStorage.getItem("rune-dungeon-audio") === "on";

  function initAudio(playReady = false) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    if (!audioState) {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = audioEnabled ? MASTER_VOLUME : 0;
      master.connect(ctx.destination);
      audioState = { ctx, master, music: null, drone: null, battlePulse: null, ambienceTimer: null, musicTimer: null, musicStep: 0, musicMode: null };
    }
    const start = () => {
      syncMusicToGame();
      if (playReady || !audioState.unlocked) {
        audioState.unlocked = true;
        playSound("ready", false);
      }
      updateSoundButton();
    };
    if (audioState.ctx.state === "suspended") audioState.ctx.resume().then(start).catch(() => updateSoundButton());
    else start();
    return audioState;
  }

  function toggleAudio() {
    setAudioEnabled(!audioEnabled, true);
  }

  function setAudioEnabled(enabled, playReady = false) {
    audioEnabled = enabled;
    localStorage.setItem("rune-dungeon-audio", enabled ? "on" : "off");
    if (audioState?.master) {
      const now = audioState.ctx.currentTime;
      audioState.master.gain.cancelScheduledValues(now);
      audioState.master.gain.setTargetAtTime(enabled ? MASTER_VOLUME : 0, now, .035);
    }
    updateSoundButton();
    if (enabled) initAudio(playReady);
  }

  function updateSoundButton() {
    const button = $("soundBtn");
    if (!button) return;
    button.textContent = audioEnabled ? "声音：开" : "声音：关";
    button.setAttribute("aria-pressed", audioEnabled ? "true" : "false");
    button.classList.toggle("muted", !audioEnabled);
  }

  function syncMusicToGame() {
    if (!audioState) return;
    const state = getState();
    if (!state) stopMusicLayer();
    else if (state.currentEnemy && !isDefeatedEnemy(state.currentEnemy)) startBattleMusic();
    else startDungeonMusic();
  }

  function stopMusicLayer() {
    if (!audioState) return;
    if (audioState.ambienceTimer) clearTimeout(audioState.ambienceTimer);
    if (audioState.musicTimer) clearTimeout(audioState.musicTimer);
    audioState.ambienceTimer = null;
    audioState.musicTimer = null;
    if (audioState.drone) {
      audioState.drone.low.stop();
      audioState.drone.high.stop();
      audioState.drone = null;
    }
    if (audioState.battlePulse) {
      audioState.battlePulse.low.stop();
      audioState.battlePulse.mid.stop();
      audioState.battlePulse.tick.stop();
      audioState.battlePulse = null;
    }
    if (audioState.music) {
      const { ctx, music } = audioState;
      const now = ctx.currentTime;
      music.gain.cancelScheduledValues(now);
      music.gain.setTargetAtTime(0, now, .04);
      setTimeout(() => music.disconnect(), 220);
      audioState.music = null;
    }
    audioState.musicMode = null;
  }

  function startDungeonMusic() {
    if (!audioState || audioState.musicMode === "dungeon") return;
    stopMusicLayer();
    const { ctx, master } = audioState;
    const music = ctx.createGain();
    music.gain.value = .2;
    music.connect(master);
    audioState.music = music;
    audioState.musicMode = "dungeon";
    audioState.musicStep = 0;
    startDungeonDrone();
    playAmbientTone(.1);
    playDungeonChord();
    scheduleDungeonMotif();
    scheduleDungeonAmbience();
  }

  function startDungeonDrone() {
    if (!audioState?.music || audioState.drone) return;
    const { ctx, music } = audioState;
    const drone = ctx.createGain();
    const low = ctx.createOscillator();
    const high = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    drone.gain.value = .075;
    low.type = "sine";
    high.type = "triangle";
    low.frequency.value = 55;
    high.frequency.value = 82.41;
    filter.type = "lowpass";
    filter.frequency.value = 260;
    low.connect(filter);
    high.connect(filter);
    filter.connect(drone);
    drone.connect(music);
    low.start();
    high.start();
    audioState.drone = { drone, low, high, filter };
  }

  function scheduleDungeonAmbience() {
    if (!audioState?.music || audioState.musicMode !== "dungeon") return;
    const delay = rand(3600, 6800);
    audioState.ambienceTimer = setTimeout(() => {
      playAmbientTone();
      scheduleDungeonAmbience();
    }, delay);
  }

  function scheduleDungeonMotif() {
    if (!audioState?.music || audioState.musicMode !== "dungeon") return;
    const phrases = [
      [293.66, 349.23, 392, 329.63, 293.66, 261.63],
      [329.63, 392, 440, 392, 349.23, 293.66],
      [261.63, 293.66, 349.23, 392, 329.63, 246.94],
      [293.66, 329.63, 392, 440, 392, 349.23]
    ];
    const phrase = phrases[audioState.musicStep % phrases.length];
    const bass = [73.42, 82.41, 98, 110][audioState.musicStep % 4];
    phrase.forEach((note, index) => {
      const delay = index * .24;
      playMusicNote(note, index % 3 === 2 ? .36 : .24, .12, "triangle", 1500, delay);
      if (index === 1 || index === 4) playMusicNote(note * 1.5, .18, .045, "sine", 2100, delay + .08);
    });
    playMusicNote(bass, 1.4, .07, "sine", 520, .02);
    if (audioState.musicStep % 2 === 0) playDungeonChord();
    audioState.musicStep++;
    audioState.musicTimer = setTimeout(scheduleDungeonMotif, 1780);
  }

  function playAmbientTone(volume = .045) {
    if (!audioState?.music || audioState.musicMode !== "dungeon") return;
    const { ctx, music } = audioState;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const notes = [55, 61.74, 73.42, 82.41, 98];
    osc.type = "sine";
    osc.frequency.value = choice(notes);
    filter.type = "lowpass";
    filter.frequency.value = 360;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + .8);
    gain.gain.exponentialRampToValueAtTime(.0001, now + 4.8);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(music);
    osc.start(now);
    osc.stop(now + 5);
  }

  function playDungeonChord() {
    if (!audioState?.music || audioState.musicMode !== "dungeon") return;
    [146.83, 220, 293.66].forEach((note, index) => {
      playMusicNote(note, .52, index ? .075 : .1, index ? "triangle" : "sine", 1100, index * .07);
    });
  }

  function playMusicNote(frequency, duration, volume, type = "sine", filterFrequency = 1200, delay = 0) {
    if (!audioState?.music) return;
    const { ctx, music } = audioState;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    filter.type = "lowpass";
    filter.frequency.value = filterFrequency;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + .025);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(music);
    osc.start(now);
    osc.stop(now + duration + .02);
  }

  function startBattleMusic() {
    if (!audioState || audioState.musicMode === "battle") return;
    stopMusicLayer();
    const { ctx, master } = audioState;
    const music = ctx.createGain();
    const pulse = ctx.createGain();
    const low = ctx.createOscillator();
    const mid = ctx.createOscillator();
    const tick = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const tickFilter = ctx.createBiquadFilter();
    const now = ctx.currentTime;
    music.gain.value = .16;
    pulse.gain.setValueAtTime(.0001, now);
    pulse.gain.linearRampToValueAtTime(.06, now + .08);
    low.type = "triangle";
    mid.type = "square";
    tick.type = "triangle";
    low.frequency.value = 73.42;
    mid.frequency.value = 146.83;
    tick.frequency.value = 220;
    filter.type = "lowpass";
    filter.frequency.value = 560;
    tickFilter.type = "bandpass";
    tickFilter.frequency.value = 1050;
    low.connect(filter);
    mid.connect(filter);
    filter.connect(pulse);
    tick.connect(tickFilter);
    tickFilter.connect(pulse);
    pulse.connect(music);
    music.connect(master);
    low.start();
    mid.start();
    tick.start();
    audioState.music = music;
    audioState.musicMode = "battle";
    audioState.musicStep = 0;
    audioState.battlePulse = { low, mid, tick, pulse };
    scheduleBattlePulse();
  }

  function scheduleBattlePulse() {
    if (!audioState?.battlePulse || audioState.musicMode !== "battle") return;
    const { ctx, battlePulse } = audioState;
    const now = ctx.currentTime;
    const phrases = [
      [293.66, 349.23, 392, 329.63, 261.63, 293.66, 440, 392],
      [329.63, 392, 440, 392, 349.23, 293.66, 261.63, 293.66]
    ];
    const phraseIndex = audioState.musicStep % phrases.length;
    const phrase = phrases[phraseIndex];
    const bass = phraseIndex ? 82.41 : 73.42;
    const rhythm = [
      { delay: 0, duration: .28, strong: true },
      { delay: .3, duration: .16 },
      { delay: .5, duration: .34, strong: true, echo: true },
      { delay: .88, duration: .18 },
      { delay: 1.1, duration: .24 },
      { delay: 1.42, duration: .16 },
      { delay: 1.62, duration: .4, strong: true, echo: true },
      { delay: 2.12, duration: .28 }
    ];
    battlePulse.pulse.gain.cancelScheduledValues(now);
    battlePulse.pulse.gain.setValueAtTime(.018, now);
    [0, .5, 1.1, 1.62].forEach((delay, index) => {
      const hitAt = now + delay;
      battlePulse.pulse.gain.linearRampToValueAtTime(index === 0 || index === 3 ? .105 : .072, hitAt + .055);
      battlePulse.pulse.gain.exponentialRampToValueAtTime(.022, hitAt + .42);
    });
    phrase.forEach((note, index) => {
      const beat = rhythm[index];
      playMusicNote(note, beat.duration, beat.strong ? .1 : .068, beat.strong ? "square" : "triangle", 1480, beat.delay);
      if (beat.echo) playMusicNote(note / 2, .42, .052, "triangle", 720, beat.delay + .08);
    });
    playMusicNote(bass, 1.14, .082, "triangle", 520, .02);
    playMusicNote(bass * 2, .36, .052, "square", 850, 1.1);
    audioState.musicStep++;
    audioState.ambienceTimer = setTimeout(scheduleBattlePulse, 2500);
  }

  function playSound(kind, ensure = true) {
    if (!audioEnabled) return;
    const audio = ensure ? initAudio() : audioState;
    if (!audio) return;
    const profile = soundProfile(kind);
    const { ctx, master } = audio;
    const now = ctx.currentTime;
    playToneLayer(ctx, master, now, profile);
    if (profile.harmonic) playToneLayer(ctx, master, now + (profile.harmonicDelay || 0), profile.harmonic);
    if (profile.noise) playNoiseLayer(ctx, master, now, profile.noise);
  }

  return {
    getAudioEnabled: () => audioEnabled,
    initAudio,
    playSound,
    setAudioEnabled,
    setAudioEnabledForRuntime: (enabled) => setAudioEnabled(enabled, false),
    syncMusicToGame,
    toggleAudio,
    updateSoundButton
  };
}
