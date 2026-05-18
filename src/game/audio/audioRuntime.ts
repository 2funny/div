import { MASTER_VOLUME } from "../constants";
import { choice, rand } from "../random";
import { soundProfile } from "./audioProfiles";
import { playNoiseLayer, playToneLayer } from "./audioEngine";

// 音频运行时只负责 Web Audio 生命周期、音效播放和探索/战斗音乐切换。
export function createAudioRuntime({ $, getState, isDefeatedEnemy }) {
  let audioState = null;
  let audioEnabled = localStorage.getItem("rune-dungeon-audio") === "on";

  // 在用户触发交互后创建或恢复 AudioContext，满足浏览器自动播放限制。
  function initAudio(playReady = false) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    if (!audioState) {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = audioEnabled ? MASTER_VOLUME : 0;
      master.connect(ctx.destination);
      audioState = {
        ctx,
        master,
        music: null,
        drone: null,
        battlePulse: null,
        ambienceTimer: null,
        musicTimer: null,
        musicStep: 0,
        musicMode: null
      };
    }
    const start = () => {
      syncMusicToGame();
      if (playReady || !audioState.unlocked) {
        audioState.unlocked = true;
        playSound("ready", false);
      }
      updateSoundButton();
    };
    if (audioState.ctx.state === "suspended")
      audioState.ctx
        .resume()
        .then(start)
        .catch(() => updateSoundButton());
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
      audioState.master.gain.setTargetAtTime(enabled ? MASTER_VOLUME : 0, now, 0.035);
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

  // 根据当前游戏状态选择静音、地牢氛围或战斗节奏。
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
      audioState.battlePulse.low?.stop();
      audioState.battlePulse.mid?.stop();
      audioState.battlePulse.tick?.stop();
      audioState.battlePulse = null;
    }
    if (audioState.music) {
      const { ctx, music } = audioState;
      const now = ctx.currentTime;
      music.gain.cancelScheduledValues(now);
      music.gain.setTargetAtTime(0, now, 0.04);
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
    music.gain.value = 0.18;
    music.connect(master);
    audioState.music = music;
    audioState.musicMode = "dungeon";
    audioState.musicStep = 0;
    startDungeonDrone();
    playAmbientTone(0.075);
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
    drone.gain.value = 0.065;
    low.type = "triangle";
    high.type = "sine";
    low.frequency.value = 36.71;
    high.frequency.value = 73.42;
    filter.type = "lowpass";
    filter.frequency.value = 210;
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
      [293.66, 349.23, 311.13, 293.66, 220, 261.63],
      [220, 261.63, 293.66, 349.23, 311.13, 261.63],
      [196, 220, 261.63, 293.66, 349.23, 293.66],
      [293.66, 440, 392, 349.23, 311.13, 293.66],
      [261.63, 293.66, 349.23, 392, 349.23, 311.13],
      [220, 293.66, 349.23, 329.63, 293.66, 246.94],
      [196, 246.94, 293.66, 349.23, 293.66, 220],
      [293.66, 311.13, 349.23, 293.66, 261.63, 220]
    ];
    const phrase = phrases[audioState.musicStep % phrases.length];
    const bassLine = [73.42, 73.42, 65.41, 58.27, 55, 49, 55, 65.41];
    const bass = bassLine[audioState.musicStep % bassLine.length];
    const rhythm = [0, 0.42, 0.88, 1.36, 1.84, 2.32];
    phrase.forEach((note, index) => {
      const delay = rhythm[index];
      const accent = index === 0 || index === 3;
      playMusicNote(note, accent ? 0.48 : 0.28, accent ? 0.095 : 0.06, "triangle", 1150, delay);
      if (index === 1 || index === 4)
        playMusicNote(note * 1.5, 0.34, 0.026, "sine", 1850, delay + 0.13);
    });
    [0, 1.36, 2.32].forEach((delay, index) => {
      playMusicNote(
        index === 1 ? bass * 1.5 : bass,
        index === 1 ? 0.34 : 0.78,
        index === 1 ? 0.028 : 0.055,
        "sine",
        430,
        delay
      );
    });
    if (audioState.musicStep % 4 === 0) playDungeonChord();
    if (audioState.musicStep % 3 === 1) playDungeonTexture(0.7);
    audioState.musicStep++;
    audioState.musicTimer = setTimeout(scheduleDungeonMotif, 3000);
  }

  function playAmbientTone(volume = 0.045) {
    if (!audioState?.music || audioState.musicMode !== "dungeon") return;
    const { ctx, music } = audioState;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const notes = [36.71, 49, 55, 65.41, 73.42, 98];
    osc.type = "sine";
    osc.frequency.value = choice(notes);
    filter.type = "lowpass";
    filter.frequency.value = 300;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 1.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 6.2);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(music);
    osc.start(now);
    osc.stop(now + 6.4);
  }

  function playDungeonTexture(delay = 0) {
    if (!audioState?.music || audioState.musicMode !== "dungeon") return;
    playMusicNoise(0.42, 0.012, 520, delay);
    playMusicNote(choice([392, 440, 523.25, 587.33]), 0.7, 0.018, "sine", 2400, delay + 0.12);
  }

  function playDungeonChord() {
    if (!audioState?.music || audioState.musicMode !== "dungeon") return;
    const chords = [
      [73.42, 146.83, 220, 293.66],
      [65.41, 130.81, 196, 261.63],
      [58.27, 116.54, 174.61, 233.08],
      [55, 110, 165, 220]
    ];
    const chord = chords[Math.floor((audioState.musicStep || 0) / 4) % chords.length];
    chord.forEach((note, index) => {
      playMusicNote(
        note,
        0.82,
        index ? 0.052 : 0.08,
        index > 1 ? "triangle" : "sine",
        920,
        index * 0.055
      );
    });
  }

  function playMusicNote(
    frequency,
    duration,
    volume,
    type: OscillatorType = "sine",
    filterFrequency = 1200,
    delay = 0
  ) {
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
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(music);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function playMusicSweep(
    start,
    end,
    duration,
    volume,
    type: OscillatorType = "sine",
    filterFrequency = 1200,
    delay = 0
  ) {
    if (!audioState?.music) return;
    const { ctx, music } = audioState;
    playToneLayer(ctx, music, ctx.currentTime + delay, {
      type,
      start,
      end,
      duration,
      volume,
      attack: 0.006,
      filter: filterFrequency
    });
  }

  function playMusicNoise(duration, volume, filterFrequency = 900, delay = 0) {
    if (!audioState?.music) return;
    const { ctx, music } = audioState;
    playNoiseLayer(ctx, music, ctx.currentTime + delay, {
      duration,
      volume,
      filter: filterFrequency
    });
  }

  function startBattleMusic() {
    if (!audioState || audioState.musicMode === "battle") return;
    stopMusicLayer();
    const { ctx, master } = audioState;
    const music = ctx.createGain();
    music.gain.value = 0.145;
    music.connect(master);
    audioState.music = music;
    audioState.musicMode = "battle";
    audioState.musicStep = 0;
    audioState.battlePulse = {};
    scheduleBattlePulse();
  }

  function scheduleBattlePulse() {
    if (!audioState?.battlePulse || audioState.musicMode !== "battle") return;
    const phrases = [
      [293.66, 349.23, 440, 587.33, 523.25, 440, 392, 349.23, 311.13, 349.23, 440, 523.25],
      [293.66, 220, 293.66, 349.23, 440, 523.25, 587.33, 523.25, 466.16, 440, 349.23, 311.13],
      [349.23, 440, 523.25, 659.25, 587.33, 523.25, 440, 392, 349.23, 392, 440, 587.33],
      [261.63, 293.66, 349.23, 440, 392, 349.23, 293.66, 261.63, 246.94, 293.66, 349.23, 440],
      [392, 440, 523.25, 587.33, 523.25, 440, 392, 349.23, 293.66, 349.23, 392, 440],
      [311.13, 349.23, 440, 523.25, 440, 392, 349.23, 311.13, 293.66, 349.23, 440, 392]
    ];
    const phraseIndex = audioState.musicStep % phrases.length;
    const phrase = phrases[phraseIndex];
    const bassPatterns = [
      [73.42, 73.42, 146.83, 73.42, 65.41, 65.41, 58.27, 55],
      [73.42, 110, 146.83, 110, 65.41, 98, 116.54, 98],
      [87.31, 87.31, 174.61, 87.31, 73.42, 73.42, 65.41, 55],
      [65.41, 65.41, 130.81, 65.41, 58.27, 58.27, 55, 49]
    ];
    const bass = bassPatterns[phraseIndex % bassPatterns.length];
    const rhythm = [0, 0.16, 0.32, 0.5, 0.72, 0.88, 1.04, 1.24, 1.46, 1.62, 1.82, 2.1];
    const bassRhythm = [0, 0.32, 0.64, 0.96, 1.28, 1.6, 1.92, 2.16];
    phrase.forEach((note, index) => {
      const delay = rhythm[index];
      const strong = index === 0 || index === 3 || index === 7 || index === 11;
      playMusicNote(
        note,
        strong ? 0.16 : 0.105,
        strong ? 0.062 : 0.038,
        strong ? "triangle" : "sine",
        strong ? 1600 : 1250,
        delay
      );
      if (index === 3 || index === 10)
        playMusicNote(note / 2, 0.22, 0.02, "sine", 560, delay + 0.055);
    });
    bass.forEach((note, index) => {
      playMusicNote(
        note,
        index % 2 ? 0.12 : 0.18,
        index % 2 ? 0.022 : 0.038,
        "sine",
        360,
        bassRhythm[index]
      );
    });
    [
      { notes: [146.83, 220, 293.66], delay: 0 },
      { notes: [130.81, 196, 261.63], delay: 1.28 }
    ].forEach((stab) => {
      stab.notes.forEach((note, index) =>
        playMusicNote(
          note,
          0.16,
          index ? 0.018 : 0.026,
          "triangle",
          720,
          stab.delay + index * 0.025
        )
      );
    });
    playBattleDrums();
    audioState.musicStep++;
    audioState.ambienceTimer = setTimeout(scheduleBattlePulse, 2400);
  }

  function playBattleDrums() {
    if (!audioState?.music || audioState.musicMode !== "battle") return;
    [0, 0.64, 1.28, 1.92].forEach((delay) => {
      playMusicSweep(82, 46, 0.13, 0.05, "sine", 360, delay);
    });
    [0.48, 1.48, 2.18].forEach((delay) => {
      playMusicNoise(0.08, 0.022, 2400, delay);
      playMusicSweep(210, 150, 0.055, 0.012, "triangle", 900, delay);
    });
    [0.16, 0.32, 0.8, 0.96, 1.12, 1.66, 1.82, 2.32].forEach((delay) => {
      playMusicNoise(0.026, 0.01, 5600, delay);
    });
  }

  function playSound(kind, ensure = true) {
    if (!audioEnabled) return;
    const audio = ensure ? initAudio() : audioState;
    if (!audio) return;
    const profile = soundProfile(kind);
    const { ctx, master } = audio;
    const now = ctx.currentTime;
    playToneLayer(ctx, master, now, profile);
    if (profile.harmonic)
      playToneLayer(ctx, master, now + (profile.harmonicDelay || 0), profile.harmonic);
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
