type WeatherMode = "rain" | "snow" | "lava";

type WeatherParticle = {
  x: number;
  y: number;
  size: number;
  speed: number;
  drift: number;
  alpha: number;
  phase: number;
  length?: number;
};

type WeatherRuntime = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  mode: WeatherMode;
  particles: WeatherParticle[];
  width: number;
  height: number;
  dpr: number;
  frame: number;
  last: number;
};

let runtime: WeatherRuntime | null = null;

export function syncWeatherCanvas(effect: { id?: string } | null | undefined) {
  const mode = effect?.id;
  if (mode !== "rain" && mode !== "snow" && mode !== "lava") {
    stopWeatherCanvas();
    return;
  }

  const stage = document.querySelector<HTMLElement>(".map-stage");
  if (!stage) {
    stopWeatherCanvas();
    return;
  }

  let canvas = stage.querySelector<HTMLCanvasElement>(".weather-canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "weather-canvas";
    canvas.setAttribute("aria-hidden", "true");
    stage.appendChild(canvas);
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (!runtime || runtime.canvas !== canvas || runtime.mode !== mode) {
    stopWeatherCanvas(false);
    runtime = {
      canvas,
      ctx,
      mode,
      particles: [],
      width: 0,
      height: 0,
      dpr: 1,
      frame: 0,
      last: performance.now()
    };
    resizeWeather(runtime, true);
    seedWeather(runtime);
    runtime.frame = requestAnimationFrame(drawWeather);
    return;
  }

  resizeWeather(runtime);
}

function stopWeatherCanvas(removeCanvas = true) {
  if (!runtime) return;
  if (runtime.frame) cancelAnimationFrame(runtime.frame);
  runtime.ctx.clearRect(0, 0, runtime.canvas.width, runtime.canvas.height);
  if (removeCanvas) runtime.canvas.remove();
  runtime = null;
}

function resizeWeather(target: WeatherRuntime, force = false) {
  const rect = target.canvas.parentElement?.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect?.width || target.canvas.clientWidth || 1));
  const height = Math.max(1, Math.round(rect?.height || target.canvas.clientHeight || width));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (!force && width === target.width && height === target.height && dpr === target.dpr) return;
  target.width = width;
  target.height = height;
  target.dpr = dpr;
  target.canvas.width = Math.round(width * dpr);
  target.canvas.height = Math.round(height * dpr);
  target.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  seedWeather(target);
}

function seedWeather(target: WeatherRuntime) {
  const area = target.width * target.height;
  const count =
    target.mode === "rain"
      ? clamp(Math.round(area / 4200), 90, 210)
      : target.mode === "snow"
        ? clamp(Math.round(area / 7600), 70, 140)
        : clamp(Math.round(area / 12500), 34, 78);
  target.particles = Array.from({ length: count }, () => createParticle(target, true));
}

function createParticle(target: WeatherRuntime, scatter = false): WeatherParticle {
  const { width, height, mode } = target;
  if (mode === "rain") {
    return {
      x: random(-width * 0.15, width * 1.15),
      y: scatter ? random(-height, height) : random(-height * 0.28, -12),
      size: random(0.55, 1.35),
      speed: random(170, 310),
      drift: random(-58, -28),
      alpha: random(0.22, 0.52),
      phase: random(0, Math.PI * 2),
      length: random(8, 18)
    };
  }
  if (mode === "snow") {
    return {
      x: random(-width * 0.08, width * 1.08),
      y: scatter ? random(-height * 0.1, height * 1.05) : random(-height * 0.24, -8),
      size: random(1.1, 3.4),
      speed: random(24, 78),
      drift: random(-16, 18),
      alpha: random(0.42, 0.9),
      phase: random(0, Math.PI * 2)
    };
  }
  return {
    x: random(0, width),
    y: scatter ? random(height * 0.25, height * 1.05) : random(height * 0.82, height * 1.08),
    size: random(1.2, 3.8),
    speed: random(18, 68),
    drift: random(-18, 18),
    alpha: random(0.34, 0.82),
    phase: random(0, Math.PI * 2)
  };
}

function drawWeather(now: number) {
  if (!runtime) return;
  resizeWeather(runtime);
  const dt = Math.min(0.05, Math.max(0.001, (now - runtime.last) / 1000));
  runtime.last = now;
  const { ctx, width, height, mode } = runtime;
  ctx.clearRect(0, 0, width, height);
  if (mode === "rain") drawRain(runtime, dt, now);
  else if (mode === "snow") drawSnow(runtime, dt, now);
  else drawLava(runtime, dt, now);
  runtime.frame = requestAnimationFrame(drawWeather);
}

function drawRain(target: WeatherRuntime, dt: number, now: number) {
  const { ctx, width, height } = target;
  const t = now / 1000;
  const mist = ctx.createLinearGradient(0, 0, 0, height);
  mist.addColorStop(0, "rgba(115, 166, 202, 0.05)");
  mist.addColorStop(0.66, "rgba(20, 43, 61, 0.11)");
  mist.addColorStop(1, "rgba(142, 190, 220, 0.09)");
  ctx.fillStyle = mist;
  ctx.fillRect(0, 0, width, height);
  ctx.lineCap = "round";
  for (const p of target.particles) {
    p.x += p.drift * dt;
    p.y += p.speed * dt;
    if (p.y > height + 42 || p.x < -width * 0.25) Object.assign(p, createParticle(target));
    const sway = Math.sin(t * 5.4 + p.phase) * 1.2;
    ctx.strokeStyle = `rgba(188, 224, 250, ${p.alpha})`;
    ctx.lineWidth = p.size;
    ctx.beginPath();
    ctx.moveTo(p.x + sway, p.y);
    ctx.lineTo(p.x + p.drift * 0.045 + sway, p.y + (p.length || 24));
    ctx.stroke();
    if (p.y > height * 0.78 && p.alpha > 0.52) {
      ctx.strokeStyle = `rgba(170, 213, 239, ${p.alpha * 0.25})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(p.x - 4, Math.min(height - 3, p.y + 4));
      ctx.lineTo(p.x + 5, Math.min(height - 1, p.y + 2));
      ctx.stroke();
    }
  }
}

function drawSnow(target: WeatherRuntime, dt: number, now: number) {
  const { ctx, width, height } = target;
  const t = now / 1000;
  const veil = ctx.createRadialGradient(
    width * 0.5,
    height * 0.12,
    0,
    width * 0.5,
    height * 0.2,
    height * 0.72
  );
  veil.addColorStop(0, "rgba(236, 247, 255, 0.10)");
  veil.addColorStop(1, "rgba(236, 247, 255, 0)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, width, height);
  for (const p of target.particles) {
    p.phase += dt * (0.16 + p.size * 0.04);
    p.x += (p.drift + Math.sin(t * 0.8 + p.phase) * 18) * dt;
    p.y += p.speed * dt;
    if (p.y > height + 12 || p.x < -24 || p.x > width + 24)
      Object.assign(p, createParticle(target));
    ctx.fillStyle = `rgba(244, 251, 255, ${p.alpha})`;
    ctx.shadowColor = "rgba(205, 231, 255, .42)";
    ctx.shadowBlur = p.size * 1.8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function drawLava(target: WeatherRuntime, dt: number, now: number) {
  const { ctx, width, height } = target;
  const t = now / 1000;
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 9; i++) {
    const x = width * (0.12 + 0.78 * noiseWave(t * 0.12 + i * 8.37));
    const y = height * (0.2 + 0.72 * noiseWave(t * 0.09 + i * 5.91));
    const radius = (randomStable(i, 48, 120) * Math.max(width, height)) / 760;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `rgba(255, ${120 + i * 9}, 42, ${0.08 + noiseWave(t + i) * 0.12})`);
    glow.addColorStop(0.42, "rgba(255, 74, 28, .055)");
    glow.addColorStop(1, "rgba(255, 74, 28, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  ctx.globalCompositeOperation = "source-over";
  for (const p of target.particles) {
    p.phase += dt * 2;
    p.x += (p.drift + Math.sin(p.phase) * 22) * dt;
    p.y -= p.speed * dt;
    p.alpha -= dt * 0.045;
    if (p.y < -10 || p.alpha <= 0.12 || p.x < -20 || p.x > width + 20)
      Object.assign(p, createParticle(target));
    const ember = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4.2);
    ember.addColorStop(0, `rgba(255, 220, 116, ${p.alpha})`);
    ember.addColorStop(0.38, `rgba(255, 112, 34, ${p.alpha * 0.55})`);
    ember.addColorStop(1, "rgba(255, 72, 24, 0)");
    ctx.fillStyle = ember;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function random(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function randomStable(seed: number, min: number, max: number) {
  const value = Math.sin(seed * 9301 + 49297) * 233280;
  return min + (value - Math.floor(value)) * (max - min);
}

function noiseWave(value: number) {
  return (
    (Math.sin(value) + Math.sin(value * 1.7 + 1.8) * 0.5 + Math.sin(value * 2.9 + 0.4) * 0.25) /
      3.5 +
    0.5
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
