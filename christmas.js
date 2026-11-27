/**
 * ==============================================================================
 *  LUPMAX RPG — SILENT NIGHT CINEMA (WINTER / CHRISTMAS ENGINE V4.0)
 * ==============================================================================
 *  100% Photorealistic & Physics-Driven — Zero Cartoons, Zero Emojis.
 *  Layers:
 *   1. Real macro-photographed frosted Norway spruce corner framing (screen blend)
 *   2. Interactive physics catenary warm-tungsten (2600K) fairy lights
 *   3. 4-plane optical Depth-of-Field bokeh snowfall + mouse wind vortex
 *   4. Subtle navbar frost-dust accumulation with cursor brush-off powder burst
 *   5. Optional procedural WebAudio winter night breeze & subtle hearth crackle
 *  Isolated module — comment out the <script> tag in ucp.html to remove completely.
 * ==============================================================================
 */
(function () {
  "use strict";

  const CFG = {
    enabled: true,
    flakeCount: 72,
    bokehCount: 14,
    frostGrainsMax: 95,
    spruceImage: "/assets/xmas-spruce-corner.jpg",
  };

  if (!CFG.enabled) return;

  const PREF_KEY = "lupmax_winter_v4_off";
  const REDUCED_MOTION = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let isOff = localStorage.getItem(PREF_KEY) === "true";

  // Runtime state
  let rafId = null;
  let snowCanvas = null;
  let snowCtx = null;
  let lightsCanvas = null;
  let lightsCtx = null;
  let flakes = [];
  let bokehFlakes = [];
  let powderParticles = [];
  let frostGrains = [];
  let lightNodes = [];
  let sprites = null;

  let mouse = { x: -9999, y: -9999, vx: 0, vy: 0, active: false };
  let wind = { base: 0.22, gust: 0, gustTarget: 0, phase: 0 };
  let ambient = { active: false, ctx: null, masterGain: null, nodes: [], crackleTimer: null };
  let frameTime = 0;

  // ============================================================================
  // 1. ISOLATED MINIMAL OBSIDIAN STYLES
  // ============================================================================
  function injectStyles() {
    if (document.getElementById("lm-winter-v4-css")) return;
    const css = `
      .lm-win-vignette {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 9980;
        background:
          radial-gradient(ellipse 14% 12% at 0% 0%, rgba(215, 232, 255, 0.055), transparent 100%),
          radial-gradient(ellipse 14% 12% at 100% 0%, rgba(215, 232, 255, 0.055), transparent 100%),
          radial-gradient(ellipse 16% 12% at 0% 100%, rgba(205, 224, 250, 0.045), transparent 100%),
          radial-gradient(ellipse 16% 12% at 100% 100%, rgba(205, 224, 250, 0.045), transparent 100%);
      }

      /* Photorealistic Frosted Norway Spruce Macro Framing */
      .lm-win-spruce {
        position: fixed;
        top: 0;
        pointer-events: none;
        z-index: 9984;
        mix-blend-mode: screen;
        opacity: 0.86;
        user-select: none;
        will-change: transform;
        -webkit-mask-image: radial-gradient(ellipse 76% 76% at 18% 18%, #000 45%, transparent 94%);
        mask-image: radial-gradient(ellipse 76% 76% at 18% 18%, #000 45%, transparent 94%);
      }

      .lm-win-spruce-left {
        left: -6px;
        width: 248px;
        height: 248px;
        transform-origin: 0% 0%;
        animation: lmSpruceSwayL 9s ease-in-out infinite;
      }

      .lm-win-spruce-right {
        right: -6px;
        width: 210px;
        height: 210px;
        opacity: 0.72;
        transform-origin: 100% 0%;
        animation: lmSpruceSwayR 10.5s ease-in-out infinite;
      }

      .lm-win-spruce img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .lm-win-spruce-right img {
        transform: scaleX(-1);
      }

      @keyframes lmSpruceSwayL {
        0%, 100% { transform: rotate(0deg); }
        50%      { transform: rotate(0.9deg); }
      }

      @keyframes lmSpruceSwayR {
        0%, 100% { transform: rotate(0deg); }
        50%      { transform: rotate(-0.85deg); }
      }

      @media (max-width: 1380px) {
        .lm-win-spruce-right { display: none; }
      }
      @media (max-width: 1120px) {
        .lm-win-spruce-left { display: none; }
      }

      #lm-win-lights-canvas {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 68px;
        pointer-events: none;
        z-index: 9986;
      }

      #lm-win-snow-canvas {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 9985;
      }

      /* Ultra-Clean Obsidian Control Dock (Bottom-Left) */
      .lm-win-dock {
        position: fixed;
        bottom: 16px;
        left: 18px;
        z-index: 9990;
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 3px;
        border-radius: 8px;
        background: rgba(16, 18, 22, 0.9);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.095);
        box-shadow: 0 10px 28px -8px rgba(0, 0, 0, 0.8);
        font-family: "Inter", -apple-system, sans-serif;
        user-select: none;
      }

      .lm-win-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 28px;
        padding: 0 10px;
        border: none;
        border-radius: 5px;
        background: transparent;
        color: #b4bac5;
        font-size: 11.5px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.14s ease, color 0.14s ease;
      }

      .lm-win-btn:hover {
        background: rgba(255, 255, 255, 0.06);
        color: #f4f5f7;
      }

      .lm-win-btn.active {
        background: rgba(212, 168, 83, 0.14);
        color: #ebd08f;
      }

      .lm-win-btn-icon {
        padding: 0 8px;
      }

      .lm-win-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #d4a853;
      }

      .lm-win-dock.is-off .lm-win-dot {
        background: #5c6370;
      }

      .lm-win-sep {
        width: 1px;
        height: 14px;
        background: rgba(255, 255, 255, 0.08);
      }
    `;
    const style = document.createElement("style");
    style.id = "lm-winter-v4-css";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================================
  // 2. PRE-CACHED HIGH-DPI OPTICAL SPRITES (BOKEH & CRISP SNOW CRYSTALS)
  // ============================================================================
  function makeRadialSprite(size, stops) {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d");
    const h = size / 2;
    const grad = g.createRadialGradient(h, h, 0, h, h, h);
    for (let i = 0; i < stops.length; i++) {
      grad.addColorStop(stops[i][0], stops[i][1]);
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }

  function buildOpticalSprites() {
    return {
      // Crisp distant snow flake
      crisp: makeRadialSprite(16, [
        [0, "rgba(255,255,255,0.95)"],
        [0.45, "rgba(235,244,255,0.55)"],
        [1, "rgba(220,235,255,0)"],
      ]),
      // Soft mid-plane natural snow puff
      soft: makeRadialSprite(32, [
        [0, "rgba(255,255,255,0.85)"],
        [0.35, "rgba(236,244,255,0.42)"],
        [0.75, "rgba(220,235,255,0.1)"],
        [1, "rgba(220,235,255,0)"],
      ]),
      // Near-camera cool cinematic lens bokeh disc
      bokehCool: makeRadialSprite(64, [
        [0, "rgba(235,245,255,0.22)"],
        [0.55, "rgba(225,238,255,0.16)"],
        [0.82, "rgba(245,250,255,0.26)"],
        [0.92, "rgba(225,238,255,0.06)"],
        [1, "rgba(225,238,255,0)"],
      ]),
      // Near-camera warm tungsten-lit optical bokeh disc
      bokehWarm: makeRadialSprite(64, [
        [0, "rgba(255,226,175,0.24)"],
        [0.58, "rgba(255,205,130,0.16)"],
        [0.82, "rgba(255,228,180,0.28)"],
        [0.93, "rgba(255,200,120,0.05)"],
        [1, "rgba(255,190,100,0)"],
      ]),
      // Real warm-white 2600K incandescent bulb halo
      tungstenGlow: makeRadialSprite(80, [
        [0, "rgba(255,246,220,0.92)"],
        [0.14, "rgba(255,212,138,0.52)"],
        [0.38, "rgba(255,172,78,0.17)"],
        [0.72, "rgba(235,140,48,0.045)"],
        [1, "rgba(235,140,48,0)"],
      ]),
    };
  }

  // ============================================================================
  // 3. PHYSICS CATENARY WARM-TUNGSTEN FAIRY LIGHT STRAND
  // ============================================================================
  function initLightStrand() {
    const w = window.innerWidth;
    const spans = Math.max(3, Math.min(7, Math.round(w / 245)));
    const spanW = w / spans;
    const bulbsPerSpan = 5;
    lightNodes = [];

    for (let s = 0; s < spans; s++) {
      const x0 = s * spanW;
      const x1 = (s + 1) * spanW;
      const sag = 15 + (s % 2) * 5; // subtle organic asymmetry

      for (let b = 0; b <= bulbsPerSpan; b++) {
        if (s > 0 && b === 0) continue; // shared anchor pin
        const u = b / bulbsPerSpan;
        const bx = x0 + u * spanW;
        // Parabolic catenary droop: 0 at anchors, max at u=0.5
        const catY = 4 * u * (1 - u) * sag;
        const isAnchor = b === 0 || b === bulbsPerSpan;
        lightNodes.push({
          baseX: bx,
          baseY: isAnchor ? 0 : 2 + catY,
          ox: 0,
          oy: 0,
          vx: 0,
          vy: 0,
          isAnchor: isAnchor,
          hasBulb: !isAnchor,
          phase: Math.random() * Math.PI * 2,
          flickerRate: 0.9 + Math.random() * 1.1,
          warmth: 0.85 + Math.random() * 0.28,
          tilt: (u - 0.5) * 0.25,
        });
      }
    }
  }

  function updateAndRenderLights(dt) {
    if (!lightsCtx || !lightsCanvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = 68;
    if (lightsCanvas.width !== Math.round(w * dpr) || lightsCanvas.height !== Math.round(h * dpr)) {
      lightsCanvas.width = Math.round(w * dpr);
      lightsCanvas.height = Math.round(h * dpr);
      initLightStrand();
    }
    lightsCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lightsCtx.clearRect(0, 0, w, h);

    if (!lightNodes.length) return;

    // 1. Update damped harmonic pendulum physics per node
    const windPush = (wind.base + wind.gust) * 0.45;
    for (let i = 0; i < lightNodes.length; i++) {
      const n = lightNodes[i];
      if (n.isAnchor) continue;

      // Natural ambient breeze sway
      const breezeForce = Math.sin(frameTime * 1.35 + n.phase) * 0.04 + windPush * 0.14;
      n.vx += breezeForce;

      // Cursor physical brushing interaction!
      if (mouse.active && mouse.y < 105) {
        const dx = mouse.x - (n.baseX + n.ox);
        const dy = mouse.y - (n.baseY + n.oy);
        const distSq = dx * dx + dy * dy;
        if (distSq < 7200) {
          const factor = (1 - Math.sqrt(distSq) / 85) * 0.14;
          n.vx += Math.max(-3.5, Math.min(3.5, mouse.vx * factor));
          n.vy += Math.max(-2.2, Math.min(2.2, mouse.vy * factor * 0.7));
        }
      }

      // Hooke spring restore + smooth damping
      n.vx += -n.ox * 0.085;
      n.vy += -n.oy * 0.095;
      n.vx *= 0.90;
      n.vy *= 0.90;
      n.ox = Math.max(-18, Math.min(18, n.ox + n.vx * dt));
      n.oy = Math.max(-12, Math.min(16, n.oy + n.vy * dt));
    }

    // 2. Render thin matte dark-braided cord
    lightsCtx.beginPath();
    lightsCtx.moveTo(lightNodes[0].baseX + lightNodes[0].ox, lightNodes[0].baseY + lightNodes[0].oy);
    for (let i = 1; i < lightNodes.length - 1; i++) {
      const curr = lightNodes[i];
      const next = lightNodes[i + 1];
      const cx = curr.baseX + curr.ox;
      const cy = curr.baseY + curr.oy;
      const mx = (cx + next.baseX + next.ox) * 0.5;
      const my = (cy + next.baseY + next.oy) * 0.5;
      lightsCtx.quadraticCurveTo(cx, cy, mx, my);
    }
    const last = lightNodes[lightNodes.length - 1];
    lightsCtx.lineTo(last.baseX + last.ox, last.baseY + last.oy);
    lightsCtx.strokeStyle = "rgba(38, 42, 50, 0.92)";
    lightsCtx.lineWidth = 1.25;
    lightsCtx.stroke();

    // 3. Render warm incandescent 2600K bulbs & optical bloom halos
    for (let i = 0; i < lightNodes.length; i++) {
      const n = lightNodes[i];
      if (!n.hasBulb) continue;

      const x = n.baseX + n.ox;
      const y = n.baseY + n.oy;
      // Gentle thermal filament breathing (NOT frantic RGB blinking!)
      const breath = 0.76 + 0.24 * Math.sin(frameTime * n.flickerRate + n.phase);
      const glowRadius = (18 + breath * 8) * n.warmth;

      // Optical warm bloom halo (additive screen feel)
      lightsCtx.save();
      lightsCtx.globalCompositeOperation = "lighter";
      lightsCtx.globalAlpha = 0.42 * breath;
      lightsCtx.drawImage(sprites.tungstenGlow, x - glowRadius, y + 6 - glowRadius, glowRadius * 2, glowRadius * 2);
      lightsCtx.restore();

      // Tiny dark-metal bulb socket + delicate warm Edison filament capsule
      lightsCtx.save();
      lightsCtx.translate(x, y);
      lightsCtx.rotate(n.tilt + n.ox * 0.032);

      // Matte brass/black socket cap
      lightsCtx.fillStyle = "#22252b";
      lightsCtx.fillRect(-1.8, 0, 3.6, 3.8);

      // Glass tear-drop envelope
      lightsCtx.beginPath();
      lightsCtx.ellipse(0, 6.8, 2.2, 3.5, 0, 0, Math.PI * 2);
      lightsCtx.fillStyle = `rgba(255, 224, 162, ${0.72 + breath * 0.28})`;
      lightsCtx.fill();

      // White-hot filament pinhead
      lightsCtx.beginPath();
      lightsCtx.arc(0, 6.6, 1.0, 0, Math.PI * 2);
      lightsCtx.fillStyle = "#fffaf0";
      lightsCtx.fill();

      lightsCtx.restore();
    }
  }

  // ============================================================================
  // 4. CINEMA DEPTH-OF-FIELD BOKEH SNOWFALL & NAVBAR FROST BRUSH-OFF
  // ============================================================================
  function createFlake(initial) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // 3 snow focal planes: 0 far, 1 mid, 2 near
    const r = Math.random();
    const plane = r < 0.52 ? 0 : r < 0.86 ? 1 : 2;
    let size, vy, alpha;
    if (plane === 0) {
      size = 2.4 + Math.random() * 2.0;
      vy = 0.35 + Math.random() * 0.35;
      alpha = 0.22 + Math.random() * 0.22;
    } else if (plane === 1) {
      size = 4.6 + Math.random() * 3.0;
      vy = 0.72 + Math.random() * 0.55;
      alpha = 0.36 + Math.random() * 0.28;
    } else {
      size = 7.5 + Math.random() * 4.5;
      vy = 1.15 + Math.random() * 0.7;
      alpha = 0.45 + Math.random() * 0.3;
    }
    return {
      plane,
      x: Math.random() * (w + 120) - 60,
      y: initial ? Math.random() * h : -20 - Math.random() * 40,
      size,
      vy,
      vx: (Math.random() - 0.5) * 0.28,
      alpha,
      sway: Math.random() * Math.PI * 2,
      swayFreq: 0.008 + Math.random() * 0.015,
      swayAmp: 0.18 + Math.random() * 0.38,
    };
  }

  function createBokeh(initial) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return {
      x: Math.random() * w,
      y: initial ? Math.random() * h : -60,
      size: 24 + Math.random() * 32,
      vy: 0.28 + Math.random() * 0.42,
      vx: (Math.random() - 0.5) * 0.22,
      alpha: 0.22 + Math.random() * 0.28,
      sway: Math.random() * Math.PI * 2,
      swayFreq: 0.005 + Math.random() * 0.008,
    };
  }

  function spawnNavbarFrostGrain() {
    if (frostGrains.length >= CFG.frostGrainsMax) return;
    const w = window.innerWidth;
    frostGrains.push({
      x: 24 + Math.random() * Math.max(100, w - 48),
      y: 61.5 + (Math.random() - 0.5) * 1.4,
      r: 0.9 + Math.random() * 1.6,
      alpha: 0,
      targetAlpha: 0.16 + Math.random() * 0.26,
    });
  }

  function initSnowField() {
    flakes = [];
    bokehFlakes = [];
    powderParticles = [];
    frostGrains = [];

    const count = REDUCED_MOTION ? 22 : CFG.flakeCount;
    for (let i = 0; i < count; i++) flakes.push(createFlake(true));
    const bCount = REDUCED_MOTION ? 4 : CFG.bokehCount;
    for (let i = 0; i < bCount; i++) bokehFlakes.push(createBokeh(true));
    for (let i = 0; i < 36; i++) spawnNavbarFrostGrain();
  }

  function updateAndRenderSnow(dt) {
    if (!snowCtx || !snowCanvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (snowCanvas.width !== Math.round(w * dpr) || snowCanvas.height !== Math.round(h * dpr)) {
      snowCanvas.width = Math.round(w * dpr);
      snowCanvas.height = Math.round(h * dpr);
    }
    snowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    snowCtx.clearRect(0, 0, w, h);

    // Smooth atmospheric wind oscillation + gust decay
    wind.phase += 0.004 * dt;
    wind.base = Math.sin(wind.phase) * 0.28 + 0.12;
    wind.gust += (wind.gustTarget - wind.gust) * 0.04 * dt;
    wind.gustTarget *= Math.pow(0.985, dt);
    const curWind = wind.base + wind.gust;

    // 1. Subtle micro-frost dust resting along sticky navbar hairline (brushes off on mouse sweep!)
    if (!REDUCED_MOTION && Math.random() < 0.12) spawnNavbarFrostGrain();
    for (let i = frostGrains.length - 1; i >= 0; i--) {
      const g = frostGrains[i];
      if (g.alpha < g.targetAlpha) g.alpha = Math.min(g.targetAlpha, g.alpha + 0.004 * dt);

      // Brush off if cursor sweeps near navbar bottom edge (y ~ 62) or strong gust hits
      let brushed = false;
      if (mouse.active && Math.abs(mouse.y - g.y) < 28 && Math.abs(mouse.x - g.x) < 42 && (Math.abs(mouse.vx) + Math.abs(mouse.vy)) > 2) {
        brushed = true;
      } else if (wind.gust > 2.2 && Math.random() < 0.08) {
        brushed = true;
      }

      if (brushed) {
        powderParticles.push({
          x: g.x,
          y: g.y,
          vx: (mouse.vx * 0.22) + curWind * 0.9 + (Math.random() - 0.5) * 1.4,
          vy: -0.6 - Math.random() * 1.4 + (mouse.vy * 0.1),
          r: g.r * 1.15,
          life: 1.0,
        });
        frostGrains.splice(i, 1);
        continue;
      }

      snowCtx.beginPath();
      snowCtx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
      snowCtx.fillStyle = `rgba(235, 243, 255, ${g.alpha})`;
      snowCtx.fill();
    }

    // 2. Brushed-off micro snow powder particles
    for (let i = powderParticles.length - 1; i >= 0; i--) {
      const p = powderParticles[i];
      p.vx = p.vx * 0.96 + curWind * 0.08;
      p.vy += 0.045 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= 0.022 * dt;
      if (p.life <= 0) {
        powderParticles.splice(i, 1);
        continue;
      }
      snowCtx.globalAlpha = Math.max(0, p.life * 0.72);
      snowCtx.drawImage(sprites.crisp, p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4);
    }

    // 3. 3-plane snowfall with subtle mouse aerodynamic wake
    for (let i = 0; i < flakes.length; i++) {
      const f = flakes[i];
      f.sway += f.swayFreq * dt;

      // Subtle mouse vortex push
      if (mouse.active && f.plane >= 1) {
        const dx = f.x - mouse.x;
        const dy = f.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 11000 && d2 > 4) {
          const d = Math.sqrt(d2);
          const force = (1 - d / 105) * 0.22;
          f.x += (mouse.vx * 0.16 + (dx / d) * 0.6) * force;
          f.y += (mouse.vy * 0.12 + (dy / d) * 0.3) * force;
        }
      }

      const windMul = f.plane === 0 ? 0.45 : f.plane === 1 ? 0.95 : 1.45;
      f.x += (f.vx + Math.sin(f.sway) * f.swayAmp + curWind * windMul) * dt;
      f.y += f.vy * dt;

      if (f.y > h + 24 || f.x > w + 70 || f.x < -70) {
        flakes[i] = createFlake(false);
        if (curWind > 1.2) flakes[i].x = Math.random() * w - 120;
        continue;
      }

      const sprite = f.plane === 0 ? sprites.crisp : sprites.soft;
      snowCtx.globalAlpha = f.alpha;
      snowCtx.drawImage(sprite, f.x - f.size * 0.5, f.y - f.size * 0.5, f.size, f.size);
    }

    // 4. Foreground cinema lens bokeh discs (pick up warm tungsten tint near top!)
    for (let i = 0; i < bokehFlakes.length; i++) {
      const b = bokehFlakes[i];
      b.sway += b.swayFreq * dt;
      b.x += (b.vx + Math.sin(b.sway) * 0.25 + curWind * 1.15) * dt;
      b.y += b.vy * dt;

      if (b.y > h + 60 || b.x > w + 90 || b.x < -90) {
        bokehFlakes[i] = createBokeh(false);
        continue;
      }

      const isNearWarmLights = b.y < 145;
      snowCtx.globalAlpha = b.alpha;
      snowCtx.drawImage(
        isNearWarmLights ? sprites.bokehWarm : sprites.bokehCool,
        b.x - b.size * 0.5,
        b.y - b.size * 0.5,
        b.size,
        b.size
      );
    }

    snowCtx.globalAlpha = 1;
  }

  // ============================================================================
  // 5. OPTIONAL PROCEDURAL WINTER NIGHT AMBIENCE (WEBAUDIO — MUTED BY DEFAULT)
  // ============================================================================
  function toggleWinterAmbience() {
    if (ambient.active) {
      stopWinterAmbience();
      syncDockState();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, ctx.currentTime);
      master.gain.exponentialRampToValueAtTime(0.065, ctx.currentTime + 0.9);
      master.connect(ctx.destination);

      // Soft pink-filtered December night wind buffer (4 seconds looped seamlessly)
      const sr = ctx.sampleRate;
      const len = sr * 4;
      const buf = ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.950 * b2 + white * 0.048;
        data[i] = (b0 + b1 + b2) * 0.25;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 260;
      filter.Q.value = 1.6;

      // Slow organic wind swell LFO
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = "sine";
      lfo.frequency.value = 0.14;
      lfoGain.gain.value = 95;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      noise.connect(filter);
      filter.connect(master);
      noise.start();
      lfo.start();

      // Subtle warm wooden hearth micro-crackle every ~0.3-1.4s
      const scheduleCrackle = () => {
        if (!ambient.active || !ambient.ctx) return;
        try {
          const now = ctx.currentTime;
          const osc = ctx.createOscillator();
          const cg = ctx.createGain();
          const hp = ctx.createBiquadFilter();
          hp.type = "highpass";
          hp.frequency.value = 1600;
          osc.type = "triangle";
          osc.frequency.setValueAtTime(1800 + Math.random() * 2200, now);
          osc.frequency.exponentialRampToValueAtTime(300, now + 0.014);
          cg.gain.setValueAtTime(0.0001, now);
          cg.gain.exponentialRampToValueAtTime(0.012 + Math.random() * 0.018, now + 0.002);
          cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.016);
          osc.connect(hp);
          hp.connect(cg);
          cg.connect(master);
          osc.start(now);
          osc.stop(now + 0.018);
        } catch (_) {}
        ambient.crackleTimer = setTimeout(scheduleCrackle, 280 + Math.random() * 1150);
      };

      ambient.active = true;
      ambient.ctx = ctx;
      ambient.masterGain = master;
      ambient.nodes = [noise, lfo];
      scheduleCrackle();
      syncDockState();
    } catch (_) {}
  }

  function stopWinterAmbience() {
    ambient.active = false;
    if (ambient.crackleTimer) {
      clearTimeout(ambient.crackleTimer);
      ambient.crackleTimer = null;
    }
    if (ambient.ctx) {
      try {
        if (ambient.masterGain) {
          ambient.masterGain.gain.exponentialRampToValueAtTime(0.0001, ambient.ctx.currentTime + 0.35);
        }
        const closingCtx = ambient.ctx;
        setTimeout(() => {
          try { closingCtx.close(); } catch (_) {}
        }, 400);
      } catch (_) {}
      ambient.ctx = null;
      ambient.masterGain = null;
      ambient.nodes = [];
    }
  }

  function triggerWindGust() {
    if (isOff) return;
    wind.gustTarget = 5.4;
    // Physically rock hanging tungsten lights on gust!
    for (let i = 0; i < lightNodes.length; i++) {
      if (!lightNodes[i].isAnchor) {
        lightNodes[i].vx += 1.6 + Math.random() * 1.4;
        lightNodes[i].vy -= 0.4 + Math.random() * 0.5;
      }
    }
  }

  // ============================================================================
  // 6. MAIN LOOP, DOM MOUNTING & CLEAN CONTROL DOCK
  // ============================================================================
  let lastTs = 0;
  function tick(ts) {
    if (isOff) return;
    const dt = lastTs ? Math.min(2.2, (ts - lastTs) / 16.67) : 1;
    lastTs = ts;
    frameTime += 0.016 * dt;

    if (!document.hidden) {
      updateAndRenderSnow(dt);
      updateAndRenderLights(dt);
    }

    // Decay cursor velocity gently
    mouse.vx *= 0.82;
    mouse.vy *= 0.82;
    rafId = requestAnimationFrame(tick);
  }

  function mountVisuals() {
    if (isOff) return;
    if (!sprites) sprites = buildOpticalSprites();

    // Subtle cold glass corner vignette
    if (!document.querySelector(".lm-win-vignette")) {
      const vig = document.createElement("div");
      vig.className = "lm-win-vignette";
      document.body.appendChild(vig);
    }

    // Photorealistic frosted Norway spruce macro corner photography
    if (!document.querySelector(".lm-win-spruce-left")) {
      const sL = document.createElement("div");
      sL.className = "lm-win-spruce lm-win-spruce-left";
      sL.innerHTML = `<img src="${CFG.spruceImage}" alt="" aria-hidden="true" />`;
      document.body.appendChild(sL);

      const sR = document.createElement("div");
      sR.className = "lm-win-spruce lm-win-spruce-right";
      sR.innerHTML = `<img src="${CFG.spruceImage}" alt="" aria-hidden="true" />`;
      document.body.appendChild(sR);
    }

    // Snowfall & Frost Canvas
    if (!snowCanvas) {
      snowCanvas = document.createElement("canvas");
      snowCanvas.id = "lm-win-snow-canvas";
      document.body.appendChild(snowCanvas);
      snowCtx = snowCanvas.getContext("2d");
      initSnowField();
    }

    // Interactive Catenary Tungsten Lights Canvas
    if (!lightsCanvas) {
      lightsCanvas = document.createElement("canvas");
      lightsCanvas.id = "lm-win-lights-canvas";
      document.body.appendChild(lightsCanvas);
      lightsCtx = lightsCanvas.getContext("2d");
      initLightStrand();
    }

    lastTs = 0;
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function unmountVisuals() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    stopWinterAmbience();
    document.querySelectorAll(".lm-win-vignette, .lm-win-spruce, #lm-win-snow-canvas, #lm-win-lights-canvas").forEach((el) => el.remove());
    snowCanvas = null;
    snowCtx = null;
    lightsCanvas = null;
    lightsCtx = null;
  }

  function syncDockState() {
    const dock = document.getElementById("lmWinDock");
    if (!dock) return;
    dock.classList.toggle("is-off", isOff);
    const label = dock.querySelector(".lm-win-toggle-label");
    if (label) label.textContent = isOff ? "Iarnă: OFF" : "Iarnă: ON";
    const gustBtn = document.getElementById("lmWinGustBtn");
    const ambBtn = document.getElementById("lmWinAmbBtn");
    if (gustBtn) gustBtn.style.display = isOff ? "none" : "inline-flex";
    if (ambBtn) {
      ambBtn.style.display = isOff ? "none" : "inline-flex";
      ambBtn.classList.toggle("active", ambient.active);
    }
    const sep = dock.querySelectorAll(".lm-win-sep");
    sep.forEach((s) => (s.style.display = isOff ? "none" : "block"));
  }

  function mountDock() {
    if (document.getElementById("lmWinDock")) return;
    const dock = document.createElement("div");
    dock.id = "lmWinDock";
    dock.className = "lm-win-dock" + (isOff ? " is-off" : "");
    dock.innerHTML = `
      <button type="button" class="lm-win-btn" id="lmWinToggleBtn" title="Activează / Dezactivează atmosfera de iarnă">
        <span class="lm-win-dot"></span>
        <span class="lm-win-toggle-label">${isOff ? "Iarnă: OFF" : "Iarnă: ON"}</span>
      </button>
      <span class="lm-win-sep"></span>
      <button type="button" class="lm-win-btn lm-win-btn-icon" id="lmWinGustBtn" title="Rafală de vânt & ninsoare">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
        </svg>
      </button>
      <span class="lm-win-sep"></span>
      <button type="button" class="lm-win-btn lm-win-btn-icon" id="lmWinAmbBtn" title="Ambient sonor noapte de iarnă (Vânt & Șemineu)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M12 3v18M8 7v10M16 7v10M4 10v4M20 10v4" />
        </svg>
      </button>
    `;
    document.body.appendChild(dock);

    document.getElementById("lmWinToggleBtn").addEventListener("click", () => {
      isOff = !isOff;
      localStorage.setItem(PREF_KEY, String(isOff));
      if (isOff) unmountVisuals();
      else mountVisuals();
      syncDockState();
    });

    document.getElementById("lmWinGustBtn").addEventListener("click", () => {
      triggerWindGust();
    });

    document.getElementById("lmWinAmbBtn").addEventListener("click", () => {
      toggleWinterAmbience();
    });

    syncDockState();
  }

  function bindInputListeners() {
    window.addEventListener(
      "mousemove",
      (ev) => {
        if (mouse.active) {
          mouse.vx = ev.clientX - mouse.x;
          mouse.vy = ev.clientY - mouse.y;
        }
        mouse.x = ev.clientX;
        mouse.y = ev.clientY;
        mouse.active = true;
      },
      { passive: true }
    );

    window.addEventListener(
      "mouseleave",
      () => {
        mouse.active = false;
      },
      { passive: true }
    );
  }

  function init() {
    injectStyles();
    bindInputListeners();
    mountDock();
    if (!isOff) mountVisuals();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
