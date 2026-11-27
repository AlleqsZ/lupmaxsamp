/* ============================================================================
   LUPMAX RPG — USER CONTROL PANEL (UCP) CLIENT ENGINE
   Clean SA-MP UCP Interface • Anti-Hijack Device Binding • Live Game Queue
   ============================================================================ */
(() => {
  "use strict";

  // --------------------------------------------------------------------------
  // 1. STATE & ANTI-HIJACK CRYPTOGRAPHIC FINGERPRINT
  // --------------------------------------------------------------------------
  const THEMES = {
    obsidian: { name: "Obsidian Gold" },
    cobalt: { name: "Steel Cobalt" },
    arctic: { name: "Titanium Silver" },
    crimson: { name: "Crimson Noir" },
    emerald: { name: "Emerald Slate" },
    ocean: { name: "Deep Ocean" },
    amber: { name: "Warm Amber" },
    copper: { name: "Brushed Copper" },
    amethyst: { name: "Royal Violet" },
    lime: { name: "Tactical Olive" },
    synth: { name: "Rose Slate" },
  };

  const CUSTOM_MIX_STORAGE_KEY = "lupmax_ucp_custom_mix";
  const DEFAULT_CUSTOM_MIX = { mode: "dual", c1: "#d4a853", c2: "#b98934", ratio: 50 };
  const CUSTOM_THEME_VARS = [
    "--accent",
    "--accent-rgb",
    "--accent-light",
    "--accent-2",
    "--accent-2-rgb",
    "--accent-btn-a",
    "--accent-btn-b",
    "--accent-btn-ink",
  ];

  function normalizeHex(val, fallback = "#3b82f6") {
    if (typeof val !== "string") return fallback;
    let s = val.trim().toLowerCase();
    if (/^#[0-9a-f]{3}$/.test(s)) {
      s = "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    }
    return /^#[0-9a-f]{6}$/.test(s) ? s : fallback;
  }

  function hexToRgb(hex) {
    const clean = normalizeHex(hex).slice(1);
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }

  function rgbToHex(rgb) {
    const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return "#" + c(rgb.r) + c(rgb.g) + c(rgb.b);
  }

  function mixRgb(a, b, t) {
    const k = Math.max(0, Math.min(1, Number(t) || 0));
    return {
      r: Math.round(a.r + (b.r - a.r) * k),
      g: Math.round(a.g + (b.g - a.g) * k),
      b: Math.round(a.b + (b.b - a.b) * k),
    };
  }

  function perceivedBrightness(rgb) {
    return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  }

  function ensureVisibleOnDark(rgb, minBrightness = 74) {
    const b = perceivedBrightness(rgb);
    if (b >= minBrightness) return rgb;
    const t = Math.min(0.66, (minBrightness - b) / minBrightness);
    return mixRgb(rgb, { r: 168, g: 184, b: 212 }, t);
  }

  function pickInk(rgb) {
    return perceivedBrightness(rgb) >= 158 ? "#090d14" : "#ffffff";
  }

  function rgbCss(rgb) {
    return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
  }

  function loadStoredCustomMix() {
    try {
      const raw = localStorage.getItem(CUSTOM_MIX_STORAGE_KEY);
      if (!raw) return { ...DEFAULT_CUSTOM_MIX };
      const parsed = JSON.parse(raw);
      return {
        mode: parsed && parsed.mode === "single" ? "single" : "dual",
        c1: normalizeHex(parsed && parsed.c1, DEFAULT_CUSTOM_MIX.c1),
        c2: normalizeHex(parsed && parsed.c2, DEFAULT_CUSTOM_MIX.c2),
        ratio: Math.max(0, Math.min(100, Number.isFinite(Number(parsed && parsed.ratio)) ? Math.round(Number(parsed.ratio)) : 50)),
      };
    } catch (_) {
      return { ...DEFAULT_CUSTOM_MIX };
    }
  }

  function saveCustomMix(mix) {
    try {
      localStorage.setItem(CUSTOM_MIX_STORAGE_KEY, JSON.stringify(mix));
    } catch (_) { }
  }

  function computeCustomThemeTokens(mix) {
    const white = { r: 255, g: 255, b: 255 };
    const darkObsidian = { r: 7, g: 10, b: 17 };
    const rgb1 = hexToRgb(mix.c1);
    const rgb2 = mix.mode === "single" ? rgb1 : hexToRgb(mix.c2);
    const t = mix.mode === "single" ? 0 : Math.max(0, Math.min(100, Number(mix.ratio) || 0)) / 100;

    const mixed = mixRgb(rgb1, rgb2, t);
    const vis1 = ensureVisibleOnDark(rgb1);
    const vis2 = ensureVisibleOnDark(rgb2);
    const visMixed = ensureVisibleOnDark(mixed);
    const accentLight = mixRgb(visMixed, white, 0.56);

    let accent2;
    let btnA;
    let btnB;
    if (mix.mode === "single") {
      accent2 = mixRgb(vis1, { r: 210, g: 235, b: 255 }, 0.28);
      btnA = mixRgb(vis1, white, 0.18);
      btnB = perceivedBrightness(rgb1) < 55 ? mixRgb(vis1, darkObsidian, 0.25) : mixRgb(rgb1, darkObsidian, 0.22);
    } else {
      const lift1 = mixRgb(vis1, white, 0.15);
      const lift2 = mixRgb(vis2, white, 0.15);
      const deep1 = mixRgb(vis1, darkObsidian, 0.2);
      const deep2 = mixRgb(vis2, darkObsidian, 0.2);
      const midDeep2 = mixRgb(vis2, deep2, 0.25);

      btnA = t <= 0.5 ? mixRgb(lift1, vis1, t * 2) : mixRgb(vis1, lift2, (t - 0.5) * 2);
      btnB = t <= 0.5 ? mixRgb(deep1, midDeep2, t * 2) : mixRgb(midDeep2, deep2, (t - 0.5) * 2);
      accent2 = t <= 0.5 ? mixRgb(mixRgb(vis1, white, 0.2), vis2, t * 2) : mixRgb(vis2, vis1, (t - 0.5) * 0.25);
    }

    const midBtn = mixRgb(btnA, btnB, 0.5);
    const ink = pickInk(midBtn);

    const bgBody = mixRgb({ r: 6, g: 9, b: 14 }, visMixed, 0.045);
    const bgTop = mixRgb({ r: 9, g: 13, b: 22 }, visMixed, 0.095);
    const bgGlass = mixRgb({ r: 9, g: 13, b: 20 }, visMixed, 0.065);

    const glow1 = mixRgb(vis1, visMixed, 0.22);
    const glow2 = mix.mode === "single" ? accent2 : mixRgb(vis2, visMixed, 0.22);

    return {
      vars: {
        "--accent": rgbToHex(visMixed),
        "--accent-rgb": rgbCss(visMixed),
        "--accent-light": rgbToHex(accentLight),
        "--accent-2": rgbToHex(accent2),
        "--accent-2-rgb": rgbCss(accent2),
        "--accent-btn-a": rgbToHex(btnA),
        "--accent-btn-b": rgbToHex(btnB),
        "--accent-btn-ink": ink,
      },
      mixedRawHex: rgbToHex(mixed).toUpperCase(),
      accentHex: rgbToHex(visMixed).toUpperCase(),
      btnA: rgbToHex(btnA),
      btnB: rgbToHex(btnB),
    };
  }

  function clearCustomCssVars() {
    const rootStyle = document.documentElement.style;
    for (let i = 0; i < CUSTOM_THEME_VARS.length; i++) {
      rootStyle.removeProperty(CUSTOM_THEME_VARS[i]);
    }
  }

  function syncMixerControls() {
    const mix = STATE.customMix || DEFAULT_CUSTOM_MIX;
    const isDual = mix.mode !== "single";
    const c1 = normalizeHex(mix.c1, DEFAULT_CUSTOM_MIX.c1);
    const c2 = normalizeHex(mix.c2, DEFAULT_CUSTOM_MIX.c2);
    const ratio = Math.max(0, Math.min(100, Math.round(Number(mix.ratio) || 0)));
    const tokens = computeCustomThemeTokens(mix);

    const orb = document.getElementById("mixSwatchOrb");
    if (orb) {
      orb.style.background =
        STATE.theme === "custom" ? (isDual ? `linear-gradient(135deg, ${c1}, ${c2})` : c1) : "var(--accent)";
    }

    const mixerBtn = document.getElementById("themeMixerToggleBtn");
    if (mixerBtn) {
      mixerBtn.classList.toggle("active", STATE.theme === "custom");
    }

    const c1In = document.getElementById("mixColor1Input");
    const c2In = document.getElementById("mixColor2Input");
    const c1Hex = document.getElementById("mixColor1Hex");
    const c2Hex = document.getElementById("mixColor2Hex");
    if (c1In && c1In.value.toLowerCase() !== c1) c1In.value = c1;
    if (c2In && c2In.value.toLowerCase() !== c2) c2In.value = c2;
    if (c1Hex) c1Hex.textContent = c1.toUpperCase();
    if (c2Hex) c2Hex.textContent = c2.toUpperCase();

    const range = document.getElementById("mixRatioRange");
    const ratioVal = document.getElementById("mixRatioValue");
    if (range && Number(range.value) !== ratio) range.value = String(ratio);
    if (ratioVal) ratioVal.textContent = `${100 - ratio}% C1 / ${ratio}% C2`;

    const modeBadge = document.getElementById("mixModeBadge");
    if (modeBadge) modeBadge.textContent = isDual ? "Mix 2 Culori" : "1 Culoare";

    const slotsGrid = document.getElementById("mixSlotsGrid");
    const slot2Card = document.getElementById("mixSlot2Card");
    const swapBtn = document.getElementById("mixSwapBtn");
    const ratioBox = document.getElementById("mixRatioBox");
    if (slotsGrid) slotsGrid.classList.toggle("single-mode", !isDual);
    if (slot2Card) slot2Card.classList.toggle("hidden", !isDual);
    if (swapBtn) swapBtn.classList.toggle("hidden", !isDual);
    if (ratioBox) ratioBox.classList.toggle("hidden", !isDual);

    document.querySelectorAll("[data-action='set-mixer-mode']").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-mode") === (isDual ? "dual" : "single"));
    });

    document.querySelectorAll(".mixer-chip[data-slot='1']").forEach((btn) => {
      btn.classList.toggle("active", normalizeHex(btn.getAttribute("data-color"), "") === c1);
    });
    document.querySelectorAll(".mixer-chip[data-slot='2']").forEach((btn) => {
      btn.classList.toggle("active", normalizeHex(btn.getAttribute("data-color"), "") === c2);
    });

    const previewStrip = document.getElementById("mixPreviewStrip");
    if (previewStrip) {
      previewStrip.style.background = isDual
        ? `linear-gradient(90deg, ${c1} 0%, ${tokens.mixedRawHex} ${ratio}%, ${c2} 100%)`
        : `linear-gradient(90deg, ${tokens.btnA} 0%, ${c1} 55%, ${tokens.btnB} 100%)`;
    }

    const resultLbl = document.getElementById("mixResultLabel");
    const resultHex = document.getElementById("mixPreviewResultHex");
    if (resultLbl) resultLbl.textContent = isDual ? "Combinație rezultată" : "Nuanță principală";
    if (resultHex) {
      resultHex.textContent = isDual ? `${c1.toUpperCase()} + ${c2.toUpperCase()} → ${tokens.mixedRawHex}` : c1.toUpperCase();
    }

    const samplePill = document.getElementById("mixPreviewSamplePill");
    if (samplePill) {
      samplePill.style.background = `linear-gradient(180deg, ${tokens.btnA}, ${tokens.btnB})`;
      samplePill.style.color = tokens.vars["--accent-btn-ink"];
    }
  }

  function applyTheme(themeId, persist = true) {
    const isCustom = themeId === "custom";
    const id = isCustom ? "custom" : Object.prototype.hasOwnProperty.call(THEMES, themeId) ? themeId : "obsidian";
    STATE.theme = id;

    if (id === "custom") {
      const tokens = computeCustomThemeTokens(STATE.customMix || DEFAULT_CUSTOM_MIX);
      const rootStyle = document.documentElement.style;
      Object.keys(tokens.vars).forEach((k) => rootStyle.setProperty(k, tokens.vars[k]));
      document.documentElement.setAttribute("data-theme", "custom");
    } else {
      clearCustomCssVars();
      document.documentElement.setAttribute("data-theme", id);
    }

    if (persist) {
      try {
        localStorage.setItem("lupmax_ucp_theme_v4", id);
      } catch (_) { }
    }

    const lbl = document.getElementById("activeThemeLabel");
    if (lbl) {
      if (id === "custom") {
        const m = STATE.customMix || DEFAULT_CUSTOM_MIX;
        lbl.textContent = m.mode === "single" ? "Custom Mono" : "Mix Custom";
      } else {
        lbl.textContent = THEMES[id].name;
      }
    }

    document.querySelectorAll(".theme-swatch").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-theme") === id);
    });
    syncMixerControls();
    return id;
  }

  function setThemeMixerOpen(open) {
    const pop = document.getElementById("themeMixerPopover");
    const btn = document.getElementById("themeMixerToggleBtn");
    if (!pop) return;
    const nextOpen = typeof open === "boolean" ? open : pop.classList.contains("hidden");
    pop.classList.toggle("hidden", !nextOpen);
    if (btn) {
      btn.classList.toggle("open", nextOpen);
      btn.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    }
    if (nextOpen) syncMixerControls();
  }

  function updateCustomMix(patch, persist = true) {
    const cur = STATE.customMix || { ...DEFAULT_CUSTOM_MIX };
    STATE.customMix = {
      mode: patch.mode === "single" ? "single" : patch.mode === "dual" ? "dual" : cur.mode,
      c1: patch.c1 !== undefined ? normalizeHex(patch.c1, cur.c1) : cur.c1,
      c2: patch.c2 !== undefined ? normalizeHex(patch.c2, cur.c2) : cur.c2,
      ratio:
        patch.ratio !== undefined && Number.isFinite(Number(patch.ratio))
          ? Math.max(0, Math.min(100, Math.round(Number(patch.ratio))))
          : cur.ratio,
    };
    if (persist) saveCustomMix(STATE.customMix);
    applyTheme("custom", persist);
  }

  const STATE = {
    view: "dashboard",
    subTab: {},
    theme: localStorage.getItem("lupmax_ucp_theme_v4") || "obsidian",
    customMix: loadStoredCustomMix(),
    bootstrap: null,
    user: null,
    csrf: localStorage.getItem("lupmax_ucp_csrf") || "",
    fingerprint: "",
    activeProfileName: "",
    activeFactionId: 1,
    activeClanId: 0,
    cachedProfile: null,
    cachedFaction: null,
    cachedClans: null,
    cachedWars: null,
    cachedEconomy: null,
    cachedLeaderboards: null,
    cachedComplaints: null,
    cachedTickets: null,
    cachedBans: null,
    cachedShop: null,
    cachedSecurity: null,
    cachedAdmin: null,
    cachedWheel: null,
    wheelRotation: 0,
    wheelSpinning: false,
    wheelTimerId: null,
    wheelLastResultMsg: "",
  };

  applyTheme(STATE.theme, false);

  function getOrCreateDeviceFingerprint() {
    let fp = localStorage.getItem("lupmax_ucp_fp");
    if (fp && fp.length >= 16) return fp;
    const raw = [
      navigator.userAgent || "ua",
      navigator.language || "ro",
      screen.width + "x" + screen.height,
      screen.colorDepth || 24,
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    ].join("|");
    let h1 = 0xdeadbeef ^ raw.length;
    let h2 = 0x41c6ce57 ^ raw.length;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const rand = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    fp = "LMFP-" + (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0") + "-" + rand;
    localStorage.setItem("lupmax_ucp_fp", fp);
    return fp;
  }

  STATE.fingerprint = getOrCreateDeviceFingerprint();

  // Clean inline SVG Icons
  const SVG = {
    online: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>`,
    users: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    home: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    car: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>`,
    bizz: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`,
    shield: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    scale: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    lock: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    unlock: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`,
  };

  // --------------------------------------------------------------------------
  // 2. HTML ESCAPING, FORMATTING & SKIN/VEHICLE ASSETS
  // --------------------------------------------------------------------------
  function esc(val) {
    if (val === null || val === undefined) return "";
    return String(val)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fmtNum(n) {
    const num = Number(n || 0);
    return Number.isFinite(num) ? num.toLocaleString("ro-RO") : "0";
  }

  function fmtMoney(n) {
    return "$" + fmtNum(n);
  }

  function skinImgUrl(model) {
    const id = Math.max(0, Math.min(311, Number(model || 170) || 170));
    return `https://assets.open.mp/assets/images/skins/${id}.png`;
  }

  function vehicleImgUrl(model) {
    const id = Math.max(400, Math.min(611, Number(model || 411) || 411));
    return `https://assets.open.mp/assets/images/vehiclePictures/Vehicle_${id}.jpg`;
  }

  function renderBadges(badges) {
    if (!Array.isArray(badges) || !badges.length) return "";
    return badges
      .map(
        (b) =>
          `<span class="role-badge" style="background:${esc(b.color)}1f;color:${esc(b.color)};border-color:${esc(b.color)}4d">${esc(b.label)}</span>`
      )
      .join(" ");
  }

  function renderOnlineStatus(status) {
    return Number(status) === 1
      ? `<span class="status-pill status-online">Online</span>`
      : `<span class="status-pill status-offline">Offline</span>`;
  }

  function renderGtaSegBar(pct, variant = "") {
    const clamped = Math.max(0, Math.min(100, Number(pct || 0)));
    const segs = [];
    for (let i = 0; i < 5; i++) {
      const segMin = i * 20;
      const fillPct = Math.max(0, Math.min(100, ((clamped - segMin) / 20) * 100));
      segs.push(`<div class="gta-seg-unit"><span style="width:${fillPct.toFixed(0)}%"></span></div>`);
    }
    return `<div class="gta-seg-bars ${variant}">${segs.join("")}</div>`;
  }

  function playerBtn(name, extraClass = "") {
    if (!name || name === "Fără Lider" || name === "The State" || name === "AdmBot") {
      return `<span>${esc(name || "-")}</span>`;
    }
    return `<button type="button" class="player-link ${extraClass}" data-action="view-player" data-player="${esc(name)}">${esc(name)}</button>`;
  }

  function classifyFhEntry(txt) {
    const low = String(txt || "").toLowerCase();
    if (low.includes("demis") || low.includes("uninvited") || low.includes("kicked") || low.includes("quit")) return "fh-leave";
    if (low.includes("intrat") || low.includes("joined") || low.includes("invited") || low.includes("lider") || low.includes("promoted")) return "fh-join";
    return "";
  }

  // --------------------------------------------------------------------------
  // 3. GTA V PAUSE MENU WEBAUDIO SYNTHESIZER + TOASTS & MODAL MANAGER
  // --------------------------------------------------------------------------
  const SFX = {
    ctx: null,
    enabled: localStorage.getItem("lupmax_ucp_sfx") !== "off",

    getContext() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => { });
      }
      return this.ctx;
    },

    tone(freqStart, freqEnd, durationSec, type = "triangle", peakGain = 0.045, delaySec = 0) {
      if (!this.enabled) return;
      const ctx = this.getContext();
      if (!ctx) return;
      try {
        const now = ctx.currentTime + delaySec;
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, now);
        if (freqEnd && freqEnd !== freqStart) {
          osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + durationSec);
        }

        filter.type = "lowpass";
        filter.frequency.setValueAtTime(2400, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(peakGain, now + Math.min(0.012, durationSec * 0.25));
        gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + durationSec + 0.01);
      } catch (_) { }
    },

    play(kind) {
      if (!this.enabled) return;
      if (kind === "tab") {
        // GTA V Pause Menu horizontal tab tick
        this.tone(680, 940, 0.028, "triangle", 0.038, 0);
      } else if (kind === "nav") {
        // GTA V Pause Menu category switch
        this.tone(210, 165, 0.045, "sine", 0.032, 0);
        this.tone(540, 810, 0.042, "triangle", 0.04, 0.012);
      } else if (kind === "select") {
        // GTA V Menu Confirm ("SELECT")
        this.tone(587.33, 587.33, 0.038, "triangle", 0.042, 0);
        this.tone(880.0, 920.0, 0.055, "triangle", 0.046, 0.034);
      } else if (kind === "back") {
        // GTA V Menu Back ("BACK")
        this.tone(740.0, 440.0, 0.058, "triangle", 0.04, 0);
      } else if (kind === "cash") {
        // GTA V / Maze Bank / Legendary Motorsport Purchase Chime
        this.tone(523.25, 523.25, 0.065, "triangle", 0.05, 0);
        this.tone(659.25, 659.25, 0.065, "triangle", 0.05, 0.055);
        this.tone(1046.5, 1080.0, 0.14, "sine", 0.058, 0.11);
      } else if (kind === "error") {
        // GTA V Menu Error / Locked low double-buzz
        this.tone(185, 150, 0.06, "sawtooth", 0.036, 0);
        this.tone(155, 125, 0.085, "sawtooth", 0.038, 0.065);
      }
    },

    syncButton() {
      const btn = document.getElementById("topbarAudioBtn");
      const iconWrap = document.getElementById("topbarAudioIconWrap");
      const lbl = document.getElementById("topbarAudioLabel");
      if (!btn) return;
      btn.classList.toggle("sfx-on", this.enabled);
      btn.classList.toggle("sfx-off", !this.enabled);
      if (lbl) lbl.textContent = this.enabled ? "SFX ON" : "MUTE";
      if (iconWrap) {
        iconWrap.innerHTML = this.enabled
          ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
               <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
               <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
             </svg>`
          : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
               <line x1="23" y1="9" x2="17" y2="15" />
               <line x1="17" y1="9" x2="23" y2="15" />
             </svg>`;
      }
    },

    toggle() {
      this.enabled = !this.enabled;
      localStorage.setItem("lupmax_ucp_sfx", this.enabled ? "on" : "off");
      this.syncButton();
      if (this.enabled) {
        this.play("select");
      }
    },
  };

  function toast(message, type = "info") {
    if (type === "success") SFX.play("cash");
    else if (type === "error" || type === "warn") SFX.play("error");
    const container = document.getElementById("ucpToastContainer");
    if (!container) return;
    const el = document.createElement("div");
    el.className = `ucp-toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateY(6px)";
      setTimeout(() => el.remove(), 220);
    }, 4200);
  }

  function openModal(title, htmlContent) {
    const backdrop = document.getElementById("ucpModalBackdrop");
    const titleEl = document.getElementById("ucpModalTitle");
    const bodyEl = document.getElementById("ucpModalBody");
    if (!backdrop || !titleEl || !bodyEl) return;
    SFX.play("select");
    titleEl.textContent = title;
    bodyEl.innerHTML = htmlContent;
    backdrop.classList.remove("hidden");
  }

  function closeModal() {
    const backdrop = document.getElementById("ucpModalBackdrop");
    if (backdrop && !backdrop.classList.contains("hidden")) {
      SFX.play("back");
    }
    if (backdrop) backdrop.classList.add("hidden");
  }

  // --------------------------------------------------------------------------
  // 4. SECURE API FETCH WRAPPER (ANTI-HIJACK + CSRF)
  // --------------------------------------------------------------------------
  async function api(path, options = {}) {
    const method = options.method || (options.body ? "POST" : "GET");
    const headers = {
      "X-UCP-Fingerprint": STATE.fingerprint,
    };
    if (method === "POST") {
      headers["Content-Type"] = "application/json";
      if (STATE.csrf) headers["X-CSRF-Token"] = STATE.csrf;
    }
    const resp = await fetch(path, {
      method,
      credentials: "same-origin",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    let payload = {};
    try {
      payload = await resp.json();
    } catch (_) {
      payload = { error: "Răspuns invalid de la server." };
    }
    if (!resp.ok) {
      if (payload.code === "HIJACK_BLOCKED" || payload.code === "SESSION_EXPIRED") {
        STATE.user = null;
        STATE.csrf = "";
        localStorage.removeItem("lupmax_ucp_csrf");
        syncShellHeader();
      }
      const err = new Error(payload.error || `Eroare HTTP ${resp.status}`);
      err.code = payload.code || "API_ERROR";
      err.status = resp.status;
      throw err;
    }
    return payload;
  }

  // --------------------------------------------------------------------------
  // 5. SHELL HEADER & SIDEBAR SYNCHRONIZATION
  // --------------------------------------------------------------------------
  function syncShellHeader() {
    const b = STATE.bootstrap;
    if (!b) return;
    STATE.user = b.user || null;

    const stats = b.stats || {};
    const setTxt = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };

    setTxt("navBadgeOnline", fmtNum(stats.online || 0));
    setTxt("navBadgeUsers", fmtNum(stats.total_users || 0));
    setTxt("navBadgeUpdates", fmtNum((b.updates || []).length));
    setTxt("navBadgeApps", fmtNum(stats.open_applications || 0));
    setTxt("navBadgeLeaderApps", fmtNum(stats.open_leader_apps || 0));
    setTxt("navBadgeClans", fmtNum(stats.total_clans || 0));
    setTxt("navBadgeComplaints", fmtNum(stats.open_complaints || 0));
    setTxt("navBadgeTickets", fmtNum(stats.open_tickets || 0));
    setTxt("navBadgeModTotal", fmtNum((stats.open_complaints || 0) + (stats.open_tickets || 0)));
    setTxt("navBadgeBans", fmtNum(stats.active_bans || 0));
    setTxt("navBadgeEmails", fmtNum(b.unread_emails || 0));

    setTxt("dailyJobName", b.daily_job ? `${b.daily_job.name}` : "N/A");
    setTxt("topbarOnlineCount", `${fmtNum(stats.online || 0)} Online`);
    setTxt("topbarDbName", b.database_name || "MySQL");

    const wheelReadyDot = document.getElementById("navWheelReadyDot");
    if (wheelReadyDot) {
      wheelReadyDot.classList.toggle("hidden", !Boolean(b.wheel_ready));
    }

    const emailBadge = document.getElementById("topbarEmailBadge");
    if (emailBadge) {
      if ((b.unread_emails || 0) > 0) {
        emailBadge.textContent = b.unread_emails;
        emailBadge.classList.remove("hidden");
      } else {
        emailBadge.classList.add("hidden");
      }
    }

    const fpBadge = document.getElementById("topbarFingerprintBadge");
    if (fpBadge) {
      if (b.security && b.security.session_bound) {
        fpBadge.innerHTML = `<span class="pill-dot dot-green"></span> Sesiune legată: <span class="mono-text">${esc(b.security.fingerprint)}</span>`;
      } else {
        fpBadge.innerHTML = `<span class="pill-dot dot-green"></span> Device ID: <span class="mono-text">${esc(STATE.fingerprint.slice(0, 13))}</span>`;
      }
    }

    const isStaffUser = Boolean(STATE.user && (Number(STATE.user.Admin) > 0 || Number(STATE.user.Helper) > 0));
    const adminNav = document.getElementById("navItemAdmin");
    if (adminNav) adminNav.classList.toggle("hidden", !isStaffUser);
    const adminNavMobile = document.getElementById("navItemAdminMobile");
    if (adminNavMobile) adminNavMobile.classList.toggle("hidden", !isStaffUser);

    const sbAcc = document.getElementById("sidebarAccountBox");
    const tbAuth = document.getElementById("topbarAuthArea");

    if (STATE.user) {
      const u = STATE.user;
      if (sbAcc) {
        sbAcc.innerHTML = `
          <div class="logged-account-card">
            <div class="account-card-top">
              <div class="skin-avatar-circle">
                <img src="${skinImgUrl(u.Model)}" alt="Skin" />
              </div>
              <div class="account-card-meta">
                <div class="account-card-name">${esc(u.name)}</div>
                <div class="account-card-sub">Level ${u.Level} &middot; ${esc(u.FactionTag)}</div>
              </div>
              ${renderOnlineStatus(u.Status)}
            </div>
            <div class="account-card-stats">
              <div class="acc-mini-stat">
                <span>Cash</span>
                <strong>${fmtMoney(u.Money)}</strong>
              </div>
              <div class="acc-mini-stat">
                <span>Bank</span>
                <strong>${fmtMoney(u.Bank)}</strong>
              </div>
              <div class="acc-mini-stat">
                <span>PP</span>
                <strong>${fmtNum(u.PremiumPoints)}</strong>
              </div>
            </div>
            <div style="display:flex;gap:6px">
              <button type="button" class="btn btn-outline btn-xs btn-block" data-action="view-player" data-player="${esc(u.name)}">
                Profilul Meu
              </button>
              <button type="button" class="btn btn-crimson btn-xs" data-action="logout" title="Deconectare">
                Ieșire
              </button>
            </div>
          </div>
        `;
      }
      if (tbAuth) {
        tbAuth.innerHTML = `
          <div class="nav-dropdown" data-dropdown="account">
            <button type="button" class="lm-account-chip" data-action="toggle-nav-dd" data-dd="account" title="Contul tău LupMax">
              <div class="skin-avatar-circle">
                <img src="${skinImgUrl(u.Model)}" alt="Skin" />
              </div>
              <div class="lm-account-chip-meta">
                <span class="lm-account-chip-name">${esc(u.name)}</span>
                <span class="lm-account-chip-sub">Lvl ${u.Level} &middot; ${fmtNum(u.PremiumPoints)} PP</span>
              </div>
              <span class="nav-caret">&#9662;</span>
            </button>
            <div class="nav-dropdown-menu lm-account-menu">
              <div style="padding:8px 10px 9px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:4px">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:5px">
                  <strong style="font-size:13px;color:#fff">${esc(u.name)}</strong>
                  ${renderOnlineStatus(u.Status)}
                </div>
                <div style="font-size:11px;color:var(--text-muted);display:flex;justify-content:space-between;gap:8px">
                  <span>Cash: <strong style="color:#34d399">${fmtMoney(u.Money)}</strong></span>
                  <span>Bank: <strong style="color:#e2e8f0">${fmtMoney(u.Bank)}</strong></span>
                </div>
              </div>
              <button type="button" class="nav-dd-item" data-action="view-player" data-player="${esc(u.name)}">
                <span>Profilul Meu (ID Card)</span>
                <span class="mono-text" style="color:var(--text-muted)">#${u.id}</span>
              </button>
              <button type="button" class="nav-dd-item" data-action="modal-customize-profile">
                <span>Personalizează Profilul</span>
                <span class="nav-badge badge-accent">STUDIO</span>
              </button>
              <button type="button" class="nav-dd-item" data-nav="wheel">
                <span>Roata LupMax</span>
                <span class="nav-badge ${b.wheel_ready ? "badge-accent" : ""}">${b.wheel_ready ? "READY" : "24H"}</span>
              </button>
              <button type="button" class="nav-dd-item" data-nav="security">
                <span>Setări Cont &amp; /Email</span>
                <span class="nav-badge badge-amber">${fmtNum(b.unread_emails || 0)}</span>
              </button>
              <div style="border-top:1px solid rgba(255,255,255,0.08);margin:4px 0"></div>
              <button type="button" class="nav-dd-item" style="color:#f87171" data-action="logout">
                <span>Deconectare Cont</span>
                <span>&#8618;</span>
              </button>
            </div>
          </div>
        `;
      }
    } else {
      if (sbAcc) {
        sbAcc.innerHTML = `
          <div class="guest-account-card">
            <div>
              <div class="guest-title">Neautentificat</div>
              <div class="guest-sub">Conectează-te cu contul din joc</div>
            </div>
            <button type="button" class="btn btn-primary btn-sm btn-block" data-action="open-login">
              Autentificare
            </button>
          </div>
        `;
      }
      if (tbAuth) {
        tbAuth.innerHTML = `
          <button type="button" class="btn btn-primary btn-sm" data-action="open-login">
            Autentificare
          </button>
        `;
      }
    }
  }

  // --------------------------------------------------------------------------
  // 6. VIEW 1: SIMPLIFIED ESSENTIAL DASHBOARD + LIVE PLAYER SEARCH (5-10 DESC)
  // --------------------------------------------------------------------------
  function renderPlayerSearchItemsHTML(list, maxItems = 8) {
    const items = (list || []).slice(0, maxItems);
    if (!items.length) {
      return `<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:12.5px">Niciun jucător găsit pentru acest nume.</div>`;
    }
    return items
      .map(
        (p, idx) => `
      <button type="button" class="search-item" data-action="view-player" data-player="${esc(p.name)}" data-search-idx="${idx}">
        <div class="search-item-left">
          <div class="skin-avatar-circle">
            <img src="${skinImgUrl(p.Model)}" alt="Skin" />
          </div>
          <div>
            <div class="search-item-name">
              <span>${esc(p.name)}</span>
              <span class="mono-text" style="font-size:11px;color:var(--text-muted)">#${p.id}</span>
            </div>
            <div class="search-item-sub">
              Level ${p.Level} &middot; ${fmtNum(p.ConnectedTime)}h jucate
            </div>
          </div>
        </div>
        <div class="search-item-right">
          <span class="role-badge" style="background:${esc(p.FactionColor)}1f;color:${esc(p.FactionColor)};border-color:${esc(p.FactionColor)}4d">
            ${esc(p.FactionTag)}
          </span>
          ${renderOnlineStatus(p.Status)}
        </div>
      </button>`
      )
      .join("");
  }

  function renderDashboardView() {
    const b = STATE.bootstrap;
    if (!b) return "";
    const s = b.stats || {};
    const dj = b.daily_job || { job_id: 1, name: "Detective" };
    const sq = b.samp_query || {};
    const maxCap = Number(sq.max_players || 100);
    const onlinePct = Math.min(100, Math.round((Number(s.online || 0) / Math.max(1, maxCap)) * 100));
    const sampAddr = sq.address || "rpg.lupmax.ro:7777";
    const latestUp = Array.isArray(b.updates) && b.updates.length ? b.updates[0] : null;
    const latestPreview = latestUp
      ? String(latestUp.text || "")
        .replace(/^#+\s*/gm, "")
        .replace(/\s+/g, " ")
        .trim()
      : "";
    const latestScoreBadge =
      latestUp && Number(latestUp.rating_count || 0) > 0
        ? `<span class="update-rating-score" style="font-size:13px;padding:2px 9px">&#9733; ${Number(latestUp.rating_avg || 0).toFixed(1)}</span>`
        : "";
    const pushUpdateBannerHTML = latestUp
      ? `
      <div class="up-push-banner anim-enter" role="region" aria-label="Ultimul update server">
        <div class="up-push-left">
          <span class="up-push-tag">
            <span class="pill-dot"></span>
            Update #${latestUp.id}
          </span>
          <span class="up-push-body">${esc(latestPreview)}</span>
        </div>
        <div class="up-push-actions">
          ${latestScoreBadge}
          <button type="button" class="btn btn-accent btn-xs up-push-btn" data-nav="updates">
            Vezi Update-ul <span class="btn-arrow">&rarr;</span>
          </button>
        </div>
      </div>`
      : "";

    const hudRightHTML = STATE.user
      ? `
        <div class="gta-hud-stack">
          <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-secondary);margin-bottom:2px">
            HUD Financiar &middot; ${esc(STATE.user.name)}
          </div>
          <div class="gta-hud-cash-line">${fmtMoney(STATE.user.Money)}</div>
          <div class="gta-hud-bank-line"><span>MAZE BANK</span>${fmtMoney(STATE.user.Bank)}</div>
          <div style="font-size:11px;color:#60a5fa;margin-top:4px;font-weight:600">
            ${fmtNum(STATE.user.PremiumPoints)} Puncte Premium (PP)
          </div>
        </div>
      `
      : `
        <div class="gta-hud-stack">
          <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-secondary);margin-bottom:2px">
            Economie &amp; Maze Bank
          </div>
          <div class="gta-hud-cash-line">${fmtMoney(s.server_wealth || 0)}</div>
          <div class="gta-hud-bank-line"><span>PIAȚĂ AUTO</span>${fmtNum(s.total_cars || 0)} Vehicule</div>
          <div style="margin-top:8px">
            <button type="button" class="btn btn-primary btn-xs btn-block" data-action="open-login">
              Autentificare în Cont
            </button>
          </div>
        </div>
      `;

    const onlineRows = (b.online_players || []).length
      ? b.online_players
        .slice(0, 10)
        .map(
          (p) => `
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:10px">
                <div class="skin-avatar-circle">
                  <img src="${skinImgUrl(p.Model)}" alt="Skin" />
                </div>
                <div>
                  ${playerBtn(p.name)}
                  <div style="font-size:11px;color:var(--text-muted)">SQL #${p.id}</div>
                </div>
              </div>
            </td>
            <td><strong>Level ${p.Level}</strong> <span style="color:var(--text-muted);font-size:11px">(${p.ConnectedTime}h)</span></td>
            <td><span class="role-badge" style="background:${esc(p.FactionColor)}1f;color:${esc(p.FactionColor)};border-color:${esc(p.FactionColor)}4d">${esc(p.FactionTag)}</span></td>
            <td>${renderBadges(p.badges) || `<span style="color:var(--text-muted);font-size:11.5px">Jucător</span>`}</td>
          </tr>`
        )
        .join("")
      : `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px">Niciun jucător conectat în acest moment.</td></tr>`;

    return `
      ${pushUpdateBannerHTML}
      <!-- Atmospheric Los Santos / GTA V Server Hero Banner -->
      <div class="ls-hero-banner anim-enter">
        <div class="ls-hero-left">
          <div class="ls-hero-eyebrow">
            <span class="pill-dot dot-green"></span>
            <span>${sq.udp_online ? `LIVE SERVER • UDP :${sq.port || 7777}` : `MYSQL REALTIME SYNC • :${sq.port || 7777}`}</span>
            <span>&middot;</span>
            <span class="mono-text">${esc(sampAddr)}</span>
          </div>
          <div class="ls-hero-title">
            LUPMAX <span>RPG</span> &mdash; OFFICIAL PLAYER HUB
          </div>
          <div class="ls-hero-sub">
            Experiența oficială <strong>LupMax Signature</strong> sincronizată live cu serverul SA-MP. Învârte zilnic <strong>Roata LupMax</strong>, personalizează-ți <strong>San Andreas Citizen ID-ul</strong>, explorează garajul vizual și tranzacționează pe Piața Auto Online.
          </div>

          <div class="ls-hero-bar-row">
            <div class="ls-capacity-pill">
              <div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:5px">
                <span style="color:var(--text-secondary);font-weight:600">Jucători Online</span>
                <strong style="color:var(--accent-light)">${fmtNum(s.online)} / ${maxCap} (${onlinePct}%)</strong>
              </div>
              <div class="progress-track" style="height:6px">
                <div class="progress-fill" style="width:${Math.max(4, onlinePct)}%;background:linear-gradient(90deg,var(--accent),var(--accent-2))"></div>
              </div>
            </div>

            <a href="samp://${esc(sampAddr)}" class="btn btn-accent btn-sm">
              Conectează-te pe Server <span class="btn-arrow">&rarr;</span>
            </a>
            <button type="button" class="btn btn-amber btn-sm" data-nav="wheel">
              Roata LupMax ${b.wheel_ready ? `<span class="wheel-ready-dot" style="margin-left:2px"></span>` : `(Premii Zilnice)`}
            </button>
            <button type="button" class="btn btn-outline btn-sm" data-nav="economy" data-subtab="economy:market">
              Piață Auto Online
            </button>
            <button type="button" class="btn btn-outline btn-sm" data-nav="economy" data-subtab="economy:map">
              Hartă Case &amp; Bizz
            </button>
          </div>
        </div>

        <div class="ls-hero-right">
          ${hudRightHTML}
        </div>
      </div>

      <!-- Essential Server KPIs: Online, Accounts, Houses, Cars, Businesses, Factions -->
      <div class="ucp-grid-6 anim-enter stagger-1" style="margin-bottom:16px">
        <div class="kpi-card">
          <div>
            <div class="kpi-label">Jucători Online</div>
            <div class="kpi-value" style="color:var(--accent-light)">${fmtNum(s.online)} <span style="font-size:13px;color:var(--text-muted);font-weight:500">/ ${sq.max_players || 100}</span></div>
            <div class="kpi-sub">Conectați pe server</div>
          </div>
          <div class="kpi-icon">${SVG.online}</div>
        </div>

        <div class="kpi-card">
          <div>
            <div class="kpi-label">Conturi</div>
            <div class="kpi-value">${fmtNum(s.total_users)}</div>
            <div class="kpi-sub">Conturi înregistrate</div>
          </div>
          <div class="kpi-icon">${SVG.users}</div>
        </div>

        <div class="kpi-card">
          <div>
            <div class="kpi-label">Case</div>
            <div class="kpi-value">${fmtNum(s.owned_houses)} <span style="font-size:13px;color:var(--text-muted);font-weight:500">/ ${fmtNum(s.total_houses)}</span></div>
            <div class="kpi-sub">Case deținute pe server</div>
          </div>
          <div class="kpi-icon">${SVG.home}</div>
        </div>

        <div class="kpi-card">
          <div>
            <div class="kpi-label">Mașini Personale</div>
            <div class="kpi-value">${fmtNum(s.total_cars)}</div>
            <div class="kpi-sub">${fmtNum(s.vip_cars)} vehicule VIP</div>
          </div>
          <div class="kpi-icon">${SVG.car}</div>
        </div>

        <div class="kpi-card">
          <div>
            <div class="kpi-label">Afaceri (Bizz)</div>
            <div class="kpi-value">${fmtNum(s.owned_bizz)} <span style="font-size:13px;color:var(--text-muted);font-weight:500">/ ${fmtNum(s.total_bizz)}</span></div>
            <div class="kpi-sub">Afaceri cu proprietar</div>
          </div>
          <div class="kpi-icon">${SVG.bizz}</div>
        </div>

        <div class="kpi-card">
          <div>
            <div class="kpi-label">Facțiuni &amp; Clanuri</div>
            <div class="kpi-value">${fmtNum(s.total_factions)}</div>
            <div class="kpi-sub">${fmtNum(s.total_clans)} clanuri &middot; ${fmtNum(s.open_applications)} aplicații</div>
          </div>
          <div class="kpi-icon">${SVG.shield}</div>
        </div>
      </div>

      <!-- Main 2-Column Essential Dashboard: Online Players + SA-MP Live Query Status -->
      <div class="ucp-grid-2 anim-enter stagger-2">
        <!-- Left: Online Players -->
        <div class="ucp-card">
          <div class="card-header">
            <div>
              <div class="card-title">Jucători Online (${fmtNum(s.online)})</div>
              <div class="card-subtitle">Jucători conectați în acest moment pe server</div>
            </div>
            <button type="button" class="btn btn-outline btn-xs" data-nav="players">Vezi Toți</button>
          </div>
          <div class="ucp-table-wrap">
            <table class="ucp-table">
              <thead>
                <tr>
                  <th>Jucător</th>
                  <th>Nivel / Ore</th>
                  <th>Facțiune</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>${onlineRows}</tbody>
            </table>
          </div>
        </div>

        <!-- Right: Live SA-MP Query Status (UDP Port 7777 + Essential Server Info) -->
        <div class="ucp-card">
          <div class="card-header">
            <div>
              <div class="card-title">Status Server SA-MP (UDP Query :${sq.port || 7777})</div>
              <div class="card-subtitle">${esc(sq.hostname || "LupMax RPG [0.3.7]")}</div>
            </div>
            <span class="status-pill ${sq.udp_online ? "status-online" : "status-closed"}">
              ${sq.udp_online ? `UDP Live (${sq.ping_ms || 1} ms)` : "MySQL Sync Activ"}
            </span>
          </div>
          <div class="kv-list">
            <div class="kv-row">
              <span class="kv-key">Adresă Conectare</span>
              <span class="kv-val mono-text">${esc(sq.address || "rpg.lupmax.ro:7777")}</span>
            </div>
            <div class="kv-row">
              <span class="kv-key">Gamemode &amp; Versiune</span>
              <span class="kv-val">${esc(sq.gamemode || "LupMax RPG")} &middot; <span class="mono-text">${esc(sq.version || "0.3.7-R2")}</span></span>
            </div>
            <div class="kv-row">
              <span class="kv-key">Hartă &amp; Limbă</span>
              <span class="kv-val">${esc(sq.mapname || "San Andreas")} &middot; ${esc(sq.language || "RO/EN")}</span>
            </div>
            <div class="kv-row">
              <span class="kv-key">Oră Joc &amp; Vreme (WorldTime)</span>
              <span class="kv-val mono-text">${esc(sq.worldtime || "12:00")} &middot; Weather #${esc(sq.weather || "10")} &middot; LagComp: ${esc(sq.lagcomp || "On")}</span>
            </div>
            <div class="kv-row">
              <span class="kv-key">Jobul Zilei (/dailyjob)</span>
              <span class="kv-val"><strong>${esc(dj.name)}</strong> (#${esc(dj.job_id || dj.id || "-")})</span>
            </div>
            <div class="kv-row">
              <span class="kv-key">Moderare &amp; Suport Activ</span>
              <span class="kv-val">${fmtNum(s.open_complaints)} Reclamații &middot; ${fmtNum(s.open_tickets)} Tichete &middot; ${fmtNum(s.active_bans)} Banuri</span>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
            <button type="button" class="btn btn-accent btn-xs" data-nav="updates">Server Updates (${fmtNum((b.updates || []).length)})</button>
            <button type="button" class="btn btn-primary btn-xs" data-nav="economy" data-subtab="economy:map">Hartă Case &amp; Bizz</button>
            <button type="button" class="btn btn-outline btn-xs" data-nav="factions">Facțiuni &amp; Rapoarte</button>
            <button type="button" class="btn btn-outline btn-xs" data-nav="wars">Turf Map (48)</button>
          </div>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 7. VIEW 2: CLASSIC SA-MP 2-COLUMN PLAYER PROFILE (ALL 190+ COLUMNS)
  // --------------------------------------------------------------------------
  async function loadAndRenderProfile(ident) {
    const targetIdent = ident || STATE.activeProfileName || (STATE.user ? STATE.user.name : "");
    if (!targetIdent) {
      const fallback =
        (STATE.bootstrap && STATE.bootstrap.online_players && STATE.bootstrap.online_players[0] && STATE.bootstrap.online_players[0].name) ||
        "1";
      STATE.activeProfileName = fallback;
    } else {
      STATE.activeProfileName = targetIdent;
    }
    const vp = document.getElementById("ucpViewport");
    try {
      const data = await api(`/api/player/${encodeURIComponent(STATE.activeProfileName)}`);
      STATE.cachedProfile = data;
      if (vp && STATE.view === "profile") {
        vp.innerHTML = renderProfileHTML(data);
      }
    } catch (err) {
      toast(err.message, "error");
      if (vp) {
        vp.innerHTML = `
          <div class="ucp-card">
            <div class="card-title">Jucătorul nu a fost găsit</div>
            <p style="color:var(--text-secondary);margin-top:6px">${esc(err.message)}</p>
          </div>`;
      }
    }
  }

  function renderProfileHTML(p) {
    if (!p || !p.summary) return "";
    const u = p.summary;
    const idn = p.identity || {};
    const gp = p.gameplay || {};
    const rp = p.raport || {};
    const tab = STATE.subTab.profile || "overview";
    const isSelf = STATE.user && Number(STATE.user.id) === Number(u.id);
    const isAdminViewer = STATE.user && Number(STATE.user.Admin) >= 1;

    const respectProgressPct = Math.min(100, Math.round((u.Respect / Math.max(1, u.RespectNeeded)) * 100));

    let tabBody = "";

    if (tab === "overview") {
      tabBody = `
        <div class="ucp-grid-2 anim-enter" style="margin-bottom:16px">
          <!-- General & Economy -->
          <div class="ucp-card">
            <div class="card-header">
              <div class="card-title">Situație Financiară &amp; Cont</div>
            </div>
            <div class="kv-list">
              <div class="kv-row"><span class="kv-key">Bani în Mână (Cash)</span><span class="kv-val" style="color:#34d399">${fmtMoney(u.Money)}</span></div>
              <div class="kv-row"><span class="kv-key">Cont Bancar (Bank)</span><span class="kv-val">${fmtMoney(u.Bank)}</span></div>
              <div class="kv-row"><span class="kv-key">Avere Totală</span><span class="kv-val" style="color:#fbbf24">${fmtMoney(u.Money + u.Bank)}</span></div>
              <div class="kv-row"><span class="kv-key">Puncte Premium</span><span class="kv-val" style="color:#60a5fa">${fmtNum(u.PremiumPoints)} PP</span></div>
              <div class="kv-row"><span class="kv-key">Statut VIP</span><span class="kv-val">${esc(u.VIPStatus ? u.VIPStatus.label : "Fără VIP")}</span></div>
              <div class="kv-row"><span class="kv-key">Loc de Muncă (Job)</span><span class="kv-val">${esc(u.JobName)} (#${u.Job})</span></div>
              <div class="kv-row"><span class="kv-key">Telefon &amp; Credit</span><span class="kv-val">${u.PhoneNr || "Fără"} (${esc(gp.phone_type || "-")}, ${fmtNum(gp.phone_credits)} credit)</span></div>
              <div class="kv-row"><span class="kv-key">Sex / Vârstă / Origine</span><span class="kv-val">${esc(idn.sex)} &middot; ${idn.age} ani &middot; ${esc(idn.origin)}</span></div>
              <div class="kv-row"><span class="kv-key">Proprietăți &amp; Chirie</span><span class="kv-val">Casă: ${u.House !== 999 ? "#" + u.House : "Fără"} &middot; Bizz: ${u.Bizz !== 255 ? "#" + u.Bizz : "Fără"} &middot; Chirie: ${idn.rented_house ? "#" + idn.rented_house : "Fără"}</span></div>
            </div>
          </div>

          <!-- Activity, Warnings & Status -->
          <div class="ucp-card">
            <div class="card-header">
              <div class="card-title">Activitate, Cazier &amp; Statistici</div>
            </div>
            <div class="kv-list">
              <div class="kv-row"><span class="kv-key">Ore Jucate Total</span><span class="kv-val">${u.ConnectedTime} ore (${fmtNum(idn.payday_had)} PayDay-uri)</span></div>
              <div class="kv-row"><span class="kv-key">Ore Azi / Săptămâna Curentă</span><span class="kv-val">${idn.online_today}h azi &middot; ${idn.online_this_week}h săpt. asta</span></div>
              <div class="kv-row"><span class="kv-key">Ore Săptămâna Trecută</span><span class="kv-val">${idn.online_last_week} ore</span></div>
              <div class="kv-row"><span class="kv-key">Avertismente (Warnings)</span><span class="kv-val" style="color:${u.Warnings > 0 ? "#f87171" : "#34d399"}">${u.Warnings} / 3</span></div>
              <div class="kv-row"><span class="kv-key">Faction Warns / Faction Punish</span><span class="kv-val">${u.FWarn} / 3 FW &middot; ${u.FPunish} / 20 FP</span></div>
              <div class="kv-row"><span class="kv-key">Wanted / Jail / Mute</span><span class="kv-val">Wanted ${gp.wanted_level} &middot; ${gp.jailed ? `Jail (${gp.jail_time}s)` : "Liber"} &middot; ${gp.muted ? `Mute (${gp.mute_time}s)` : "Fără Mute"}</span></div>
              <div class="kv-row"><span class="kv-key">Kills / Deaths / Crime</span><span class="kv-val">${fmtNum(gp.kills)} K / ${fmtNum(gp.deaths)} D &middot; ${fmtNum(gp.crimes)} Crime</span></div>
              <div class="kv-row"><span class="kv-key">Paintball &amp; Race Arena</span><span class="kv-val">Paintball: ${fmtNum(gp.paintball?.kills)}K / ${fmtNum(gp.paintball?.deaths)}D &middot; Race: ${fmtNum(gp.race_arena?.points)} pct</span></div>
              <div class="kv-row"><span class="kv-key">Clan Oficial</span><span class="kv-val">${p.clan ? `<span style="color:#${esc(p.clan.color)}">[${esc(p.clan.tag)}] ${esc(p.clan.name)}</span> (Rank ${p.clan.rank}, ${p.clan.days} zile)` : "Fără Clan"}</span></div>
            </div>
          </div>
        </div>

        <!-- Licenses & Inventory -->
        <div class="ucp-card anim-enter">
          <div class="card-header">
            <div class="card-title">Licențe &amp; Inventar Jucător</div>
          </div>
          <div class="ucp-grid-2">
            <div class="kv-list">
              ${(p.licenses || [])
          .map(
            (lic) => `
                <div class="kv-row">
                  <span class="kv-key">${esc(lic.name)}</span>
                  <span class="kv-val" style="color:${lic.has ? "#34d399" : "#f87171"}">
                    ${lic.has ? `Validă (${lic.hours}h)` : "Expirată"}
                    ${lic.suspended > 0 ? `<span style="color:#fbbf24"> (Suspendată ${lic.suspended}h)</span>` : ""}
                  </span>
                </div>`
          )
          .join("")}
            </div>
            <div class="kv-list">
              <div class="kv-row"><span class="kv-key">Materiale &amp; Droguri</span><span class="kv-val">${fmtNum(gp.materials)} Materiale &middot; ${fmtNum(gp.drugs)}g Droguri</span></div>
              <div class="kv-row"><span class="kv-key">Puncte Jefuire (Rob Points)</span><span class="kv-val">${gp.rob_points} / 10</span></div>
              <div class="kv-row"><span class="kv-key">Hidden Colors &amp; Canistră Combustibil</span><span class="kv-val">${gp.hidden_color} Hidden &middot; ${gp.gas_can}L GasCan</span></div>
              <div class="kv-row"><span class="kv-key">Stil de Luptă (/fightstyle)</span><span class="kv-val">${esc(gp.fight_style)}</span></div>
              <div class="kv-row"><span class="kv-key">Accesorii (Walkie-Talkie / MP3)</span><span class="kv-val">WT: ${gp.wtalkie ? "Da" : "Nu"} &middot; MP3: ${gp.mp3 ? "Da" : "Nu"}</span></div>
            </div>
          </div>
        </div>
      `;
    } else if (tab === "raport") {
      tabBody = `
        <div class="ucp-grid-2 anim-enter">
          <div class="ucp-card">
            <div class="card-header">
              <div class="card-title">Raport Activitate Facțiune — ${esc(rp.faction_name)}</div>
            </div>
            <div class="kv-list">
              <div class="kv-row"><span class="kv-key">Facțiune &amp; Rank</span><span class="kv-val">${esc(rp.faction_name)} &middot; Rank ${rp.rank} (${esc(rp.rank_name)})</span></div>
              <div class="kv-row"><span class="kv-key">Vechime în Facțiune</span><span class="kv-val">${rp.faction_days} zile (Data intrării: ${esc(rp.faction_join)})</span></div>
              <div class="kv-row"><span class="kv-key">Faction Warns / Faction Punish</span><span class="kv-val">${rp.fwarns}/3 FW &middot; ${rp.fpunish}/20 FP</span></div>
              <div class="kv-row"><span class="kv-key">Puncte Raport General (FWorks)</span><span class="kv-val" style="color:var(--brand-primary)">${fmtNum(rp.fworks)} acțiuni</span></div>
              <div class="kv-row"><span class="kv-key">Suspecți Arestați / Amenzi Acordate</span><span class="kv-val">${fmtNum(rp.arrested)} arestări &middot; ${fmtNum(rp.tickets_issued)} amenzi</span></div>
              <div class="kv-row"><span class="kv-key">Permise Confiscate / Percheziții</span><span class="kv-val">${fmtNum(rp.licenses_confiscated)} permise &middot; ${fmtNum(rp.frisks)} percheziții</span></div>
              <div class="kv-row"><span class="kv-key">Droguri / Materiale Confiscate</span><span class="kv-val">${fmtNum(rp.drugs_confiscated)}g droguri &middot; ${fmtNum(rp.mats_confiscated)} materiale</span></div>
              <div class="kv-row"><span class="kv-key">Pacienți Vindecați / Interviuri Live</span><span class="kv-val">${fmtNum(rp.medics_healed)} pacienți &middot; ${fmtNum(rp.news_lives)} interviuri</span></div>
            </div>
          </div>

          <div class="ucp-card">
            <div class="card-header">
              <div class="card-title">Contoare Staff &amp; Sisteme Adiționale</div>
            </div>
            <div class="kv-list">
              <div class="kv-row"><span class="kv-key">Comenzi Admin / Jucători Ajutați</span><span class="kv-val">${fmtNum(gp.staff_metrics?.admin_commands)} cmd &middot; ${fmtNum(gp.staff_metrics?.helped_players)} ajutați (${fmtNum(gp.staff_metrics?.helped_today)} azi)</span></div>
              <div class="kv-row"><span class="kv-key">Puncte Helper / Avertismente Staff</span><span class="kv-val">${fmtNum(gp.staff_metrics?.helper_points)} HPts &middot; AW ${gp.staff_metrics?.admin_warns}/3 &middot; HW ${gp.staff_metrics?.helper_warns}/3</span></div>
              <div class="kv-row"><span class="kv-key">Portofel Crypto (LMC / BTC)</span><span class="kv-val">${p.extended?.crypto ? `${p.extended.crypto.lmc_balance} LMC &middot; ${p.extended.crypto.btc_balance} BTC (${p.extended.crypto.gpu_rigs} Rigs)` : "Fără portofel"}</span></div>
              <div class="kv-row"><span class="kv-key">Buncăr Subteran</span><span class="kv-val">${p.extended?.bunker && p.extended.bunker.owned ? `Deținut (Stoc: ${p.extended.bunker.stock}%, Securitate: Lvl ${p.extended.bunker.upgrade_security})` : "Fără Buncăr"}</span></div>
              <div class="kv-row"><span class="kv-key">BattlePass Sezonier</span><span class="kv-val">${p.extended?.battlepass ? `Level ${p.extended.battlepass.bp_level} (${p.extended.battlepass.bp_xp} XP) ${p.extended.battlepass.has_premium ? "&middot; Premium" : ""}` : "Level 1 (0 XP)"}</span></div>
              <div class="kv-row"><span class="kv-key">Cutii Crates &amp; Chei</span><span class="kv-val">${p.extended?.crates ? `${p.extended.crates.common_crates} Common &middot; ${p.extended.crates.rare_crates} Rare &middot; ${p.extended.crates.epic_crates} Epic &middot; ${p.extended.crates.legendary_crates} Leg &middot; ${p.extended.crates.crate_keys} Chei` : "0 Cutii"}</span></div>
            </div>
          </div>
        </div>
      `;
    } else if (tab === "skills") {
      const skCards = (p.skills || [])
        .map(
          (sk) => `
          <div class="ucp-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <strong style="font-size:13.5px;color:var(--text-heading)">${esc(sk.name)}</strong>
              <span class="role-badge" style="background:rgba(59,130,246,0.14);color:#60a5fa;border-color:rgba(59,130,246,0.3)">
                Skill ${sk.level} / 5
              </span>
            </div>
            <div class="progress-track" style="margin:8px 0">
              <div class="progress-fill" style="width:${sk.progress_pct}%"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--text-secondary)">
              <span>Curse: <strong>${fmtNum(sk.deliveries)}</strong></span>
              <span>${sk.level >= 5 ? "Skill Maxim" : `Rămase: ${fmtNum(sk.remaining)}`} (${sk.progress_pct}%)</span>
            </div>
          </div>`
        )
        .join("");

      const q1 = gp.quests?.q1 || {};
      const q2 = gp.quests?.q2 || {};
      const sq = gp.quests?.special_quest || { found: 0, total: 50, completed: false };
      const xm = gp.quests?.christmas || { season: 2026, claimed_days: [], grand_claimed: false };
      const q1Pct = q1.target > 0 ? Math.min(100, Math.round((q1.progress / q1.target) * 100)) : 0;
      const q2Pct = q2.target > 0 ? Math.min(100, Math.round((q2.progress / q2.target) * 100)) : 0;
      const sqPct = Math.min(100, Math.round((sq.found / 50) * 100));

      let adventCells = "";
      for (let d = 1; d <= 25; d++) {
        const claimed = Array.isArray(xm.claimed_days) && xm.claimed_days.includes(d);
        adventCells += `<div class="advent-cell ${claimed ? "claimed" : ""}">Zi ${d}<br/>${claimed ? "Da" : "-"}</div>`;
      }

      tabBody = `
        <div class="ucp-grid-3 anim-enter" style="margin-bottom:16px">${skCards}</div>
        <div class="ucp-grid-2 anim-enter">
          <div class="ucp-card">
            <div class="card-header">
              <div class="card-title">Misiuni Zilnice (/quests) &amp; Special Quest</div>
            </div>
            <div class="kv-list" style="gap:10px">
              <div style="padding:10px;background:var(--bg-inset);border:1px solid var(--border-subtle);border-radius:6px">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                  <strong>Misiunea Zilnică #1</strong>
                  <span class="status-pill ${q1.done ? "status-closed" : "status-open"}">${q1.done ? "Finalizată" : `${q1.progress} / ${q1.target}`}</span>
                </div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">${esc(q1.text)}</div>
                <div class="progress-track"><div class="progress-fill" style="width:${q1Pct}%"></div></div>
              </div>
              <div style="padding:10px;background:var(--bg-inset);border:1px solid var(--border-subtle);border-radius:6px">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                  <strong>Misiunea Zilnică #2</strong>
                  <span class="status-pill ${q2.done ? "status-closed" : "status-open"}">${q2.done ? "Finalizată" : `${q2.progress} / ${q2.target}`}</span>
                </div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">${esc(q2.text)}</div>
                <div class="progress-track"><div class="progress-fill" style="width:${q2Pct}%"></div></div>
              </div>
              <div style="padding:10px;background:var(--bg-inset);border:1px solid var(--border-subtle);border-radius:6px">
                <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                  <strong>Special Quest — Obiecte Colectate</strong>
                  <span class="mono-text">${sq.found} / 50</span>
                </div>
                <div class="progress-track"><div class="progress-fill" style="width:${sqPct}%"></div></div>
              </div>
            </div>
          </div>

          <div class="ucp-card">
            <div class="card-header">
              <div class="card-title">Calendar Advent (Sezon ${xm.season})</div>
              <span class="status-pill ${xm.grand_claimed ? "status-closed" : "status-open"}">
                ${xm.grand_claimed ? "Premiu Final Revendicat" : `${(xm.claimed_days || []).length} / 25 Zile`}
              </span>
            </div>
            <div class="advent-grid">${adventCells}</div>
          </div>
        </div>
      `;
    } else if (tab === "assets") {
      const carsHTML = (p.cars || []).length
        ? p.cars
          .map((c) => {
            const gasPct = Math.max(0, Math.min(100, Math.round(Number(c.Gas || 0))));
            const hpPct = Math.max(0, Math.min(100, Math.round((Number(c.HP || 1000) / 1000) * 100)));
            const hpGrad =
              hpPct >= 70
                ? "linear-gradient(90deg,#10b981,#34d399)"
                : hpPct >= 40
                  ? "linear-gradient(90deg,#f59e0b,#fbbf24)"
                  : "linear-gradient(90deg,#ef4444,#f87171)";
            return `
            <div class="lm-garage-card">
              <div class="lm-garage-stage">
                <img src="${vehicleImgUrl(c.Model)}" alt="${esc(c.ModelName)}" loading="lazy" />
                ${c.Vip ? `<span class="role-badge" style="position:absolute;top:10px;left:10px;z-index:2;background:rgba(245,158,11,0.28);color:#fde68a;border-color:rgba(251,191,36,0.65);backdrop-filter:blur(6px)">VIP &middot; ${esc(c.VipName || "VIP")}</span>` : ""}
                <span class="role-badge" style="position:absolute;top:10px;right:10px;z-index:2;background:rgba(8,12,22,0.75);color:#cbd5e1;border-color:rgba(255,255,255,0.18)">#${c.ID}</span>
                <span class="samp-plate" style="position:absolute;bottom:10px;right:10px;z-index:2">${esc(c.License || "SAN ANDREAS")}</span>
              </div>
              <div class="lm-garage-body">
                <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
                  <strong style="font-size:15.5px;color:#ffffff;letter-spacing:0.01em">${esc(c.ModelName)}</strong>
                  <span style="color:#34d399;font-weight:700;font-family:'JetBrains Mono',monospace;font-size:13px">${fmtMoney(c.Value)}</span>
                </div>

                <div class="lm-garage-bars">
                  <div class="lm-mini-gauge">
                    <label><span>Combustibil</span><strong style="color:#fbbf24">${gasPct}%</strong></label>
                    <div class="progress-track" style="height:6px">
                      <div class="progress-fill" style="width:${gasPct}%;background:linear-gradient(90deg,#f59e0b,#fde047)"></div>
                    </div>
                  </div>
                  <div class="lm-mini-gauge">
                    <label><span>Integritate</span><strong style="color:${hpPct >= 70 ? "#34d399" : hpPct >= 40 ? "#fbbf24" : "#f87171"}">${c.HP} HP</strong></label>
                    <div class="progress-track" style="height:6px">
                      <div class="progress-fill" style="width:${hpPct}%;background:${hpGrad}"></div>
                    </div>
                  </div>
                </div>

                <div class="kv-list" style="font-size:12px">
                  <div class="kv-row"><span class="kv-key">Rulaj &amp; Vechime</span><span class="kv-val">${fmtNum(Math.round(Number(c.KM || 0)))} KM &middot; ${c.Days} zile</span></div>
                  <div class="kv-row"><span class="kv-key">Culori / Închidere</span><span class="kv-val">${c.ColorOne}/${c.ColorTwo} &middot; ${c.Locked ? "Încuiat" : "Descuiat"}</span></div>
                  <div class="kv-row"><span class="kv-key">Asigurare</span><span class="kv-val">${c.InsurancePoints} pct (${fmtMoney(c.InsurancePrice)})</span></div>
                </div>

                ${isSelf || isAdminViewer
                ? `<div style="display:flex;gap:8px;margin-top:auto;padding-top:4px">
                         <button type="button" class="btn btn-outline btn-xs" style="flex:1" data-action="unstuck-car" data-id="${c.ID}">
                           Deblochează LS
                         </button>
                         ${isSelf ? `<button type="button" class="btn btn-amber btn-xs" style="flex:1" data-action="modal-list-car">Vinde pe Piață</button>` : ""}
                       </div>`
                : ""
              }
              </div>
            </div>`;
          })
          .join("")
        : `<div class="ucp-card"><p style="color:var(--text-muted)">Acest jucător nu deține vehicule personale în garaj.</p></div>`;

      const housesHTML = (p.houses || [])
        .map(
          (h) => `
          <div class="ucp-card">
            <div class="card-header">
              <div class="card-title">Casa #${h.ID} — ${esc(h.Discription)}</div>
              <span class="role-badge" style="background:rgba(16,185,129,0.15);color:#34d399">Level ${h.Level}</span>
            </div>
            <div class="kv-list">
              <div class="kv-row"><span class="kv-key">Valoare / Seif</span><span class="kv-val">${fmtMoney(h.Value)} &middot; Seif: ${fmtMoney(h.Takings)}</span></div>
              <div class="kv-row"><span class="kv-key">Chirie / Ușă</span><span class="kv-val">${h.Rentabil ? fmtMoney(h.Rent) : "Neînchiriabilă"} &middot; ${h.Lockk ? "Încuiată" : "Descuiată"}</span></div>
            </div>
            ${isSelf || isAdminViewer
              ? `<button type="button" class="btn btn-primary btn-xs" style="margin-top:10px" data-action="modal-edit-house" data-id="${h.ID}" data-desc="${esc(h.Discription)}" data-rent="${h.Rent}" data-rentabil="${h.Rentabil}" data-lock="${h.Lockk}">
                     Configurează Casa #${h.ID}
                   </button>`
              : ""
            }
          </div>`
        )
        .join("");

      const bizzHTML = (p.businesses || [])
        .map(
          (b) => `
          <div class="ucp-card">
            <div class="card-header">
              <div class="card-title">Business #${b.ID} — ${esc(b.Message)}</div>
              <span class="role-badge" style="background:${esc(b.TypeColor)}1f;color:${esc(b.TypeColor)}">${esc(b.TypeName)}</span>
            </div>
            <div class="kv-list">
              <div class="kv-row"><span class="kv-key">Valoare / Seif (Till)</span><span class="kv-val">${fmtMoney(b.BuyPrice)} &middot; Seif: ${fmtMoney(b.Till)}</span></div>
              <div class="kv-row"><span class="kv-key">Taxă Intrare / Status</span><span class="kv-val">${fmtMoney(b.EntranceCost)} &middot; ${b.Locked ? "Încuiat" : "Deschis"}</span></div>
            </div>
            ${isSelf || isAdminViewer
              ? `<button type="button" class="btn btn-primary btn-xs" style="margin-top:10px" data-action="modal-edit-bizz" data-id="${b.ID}" data-msg="${esc(b.Message)}" data-fee="${b.EntranceCost}" data-lock="${b.Locked}">
                     Configurează Business #${b.ID}
                   </button>`
              : ""
            }
          </div>`
        )
        .join("");

      tabBody = `
        <div class="lm-garage-grid anim-enter" style="margin-bottom:18px">${carsHTML}</div>
        <div class="ucp-grid-2 anim-enter">
          ${housesHTML || `<div class="ucp-card" style="color:var(--text-muted)">Fără case deținute.</div>`}
          ${bizzHTML || `<div class="ucp-card" style="color:var(--text-muted)">Fără afaceri deținute.</div>`}
        </div>
      `;
    } else if (tab === "history") {
      const fhList = (p.faction_history || []).length
        ? p.faction_history
          .map(
            (f) => `
            <div class="fh-entry ${classifyFhEntry(f.text)}">
              <div style="font-size:13px;color:var(--text-primary)">${esc(f.text)}</div>
              <div class="mono-text" style="font-size:11px;color:var(--text-muted);margin-top:2px">${esc(f.time)}</div>
            </div>`
          )
          .join("")
        : `<div style="color:var(--text-muted)">Jucătorul nu are intrări în Faction History.</div>`;

      const sancList = (p.sanctions || []).length
        ? p.sanctions
          .map(
            (s) => `
            <tr>
              <td><span class="role-badge" style="background:${esc(s.action_color)}1f;color:${esc(s.action_color)}">${esc(s.action_label)}</span></td>
              <td>${playerBtn(s.givername)}</td>
              <td>${s.actiontime > 0 ? s.actiontime : "-"}</td>
              <td>${esc(s.reason)}</td>
              <td class="mono-text" style="color:var(--text-muted)">${esc(s.time)}</td>
            </tr>`
          )
          .join("")
        : `<tr><td colspan="5" style="color:var(--text-muted);text-align:center;padding:16px">Fără sancțiuni sau vizibil doar proprietarului și Staff-ului.</td></tr>`;

      tabBody = `
        <div class="ucp-grid-2 anim-enter">
          <div class="ucp-card">
            <div class="card-header"><div class="card-title">Faction History (${(p.faction_history || []).length})</div></div>
            <div class="fh-timeline">${fhList}</div>
          </div>
          <div class="ucp-card">
            <div class="card-header"><div class="card-title">Istoric Sancțiuni (punishlogs)</div></div>
            <div class="ucp-table-wrap">
              <table class="ucp-table">
                <thead><tr><th>Acțiune</th><th>Admin</th><th>Durată</th><th>Motiv</th><th>Data</th></tr></thead>
                <tbody>${sancList}</tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    } else if (tab === "admin_intel" && p.admin_intel) {
      const ai = p.admin_intel;
      const clonesRows = (ai.clones || []).length
        ? ai.clones
          .map(
            (c) => `
            <tr>
              <td>#${c.id}</td>
              <td>${playerBtn(c.name)}</td>
              <td>Level ${c.Level}</td>
              <td class="mono-text">${esc(c.IP)} / ${esc(c.LastIP)}</td>
              <td>${renderOnlineStatus(c.Status)}</td>
            </tr>`
          )
          .join("")
        : `<tr><td colspan="5" style="color:#34d399;text-align:center">Niciun cont asociat pe același IP/PCID.</td></tr>`;

      tabBody = `
        <div class="ucp-grid-2 anim-enter">
          <div class="ucp-card">
            <div class="card-header"><div class="card-title">Verificare IP, PCID &amp; Conturi Asociate</div></div>
            <div class="kv-list" style="margin-bottom:14px">
              <div class="kv-row"><span class="kv-key">IP Curent / LastIP</span><span class="kv-val mono-text">${esc(ai.ip)} / ${esc(ai.last_ip)}</span></div>
              <div class="kv-row"><span class="kv-key">PCID / Email</span><span class="kv-val mono-text">${esc(ai.pcid || "N/A")} &middot; ${esc(ai.email || "Fără email")}</span></div>
              <div class="kv-row"><span class="kv-key">Ban Activ</span><span class="kv-val" style="color:${ai.active_ban ? "#f87171" : "#34d399"}">${ai.active_ban ? `DA (${esc(ai.active_ban.Reason)} de ${esc(ai.active_ban.AdminName)})` : "NU"}</span></div>
            </div>
            <div style="font-weight:600;font-size:12.5px;margin-bottom:8px;color:var(--text-secondary)">Conturi pe același IP / PCID (${(ai.clones || []).length})</div>
            <div class="ucp-table-wrap">
              <table class="ucp-table">
                <thead><tr><th>ID</th><th>Nume</th><th>Nivel</th><th>IP</th><th>Status</th></tr></thead>
                <tbody>${clonesRows}</tbody>
              </table>
            </div>
          </div>

          <div class="ucp-card">
            <div class="card-header"><div class="card-title">Loguri Recente Jucător (playerlogs)</div></div>
            <div class="kv-list" style="max-height:380px;overflow-y:auto">
              ${(ai.player_logs || [])
          .map(
            (l) => `
                <div class="kv-row">
                  <span style="font-size:12.2px">${esc(l.action)}</span>
                  <span class="mono-text" style="color:var(--text-muted)">${esc(l.time)}</span>
                </div>`
          )
          .join("") || `<div style="color:var(--text-muted)">Fără loguri în playerlogs.</div>`}
            </div>
          </div>
        </div>
      `;
    }

    const pc = p.profile_custom || {};
    const customAccent = /^#[0-9a-fA-F]{6}$/.test(pc.accent_color || "") ? pc.accent_color : "";
    const safeBannerUrl =
      typeof pc.banner_url === "string" && /^https:\/\/[^\s<>"'()]+$/i.test(pc.banner_url.trim())
        ? pc.banner_url.trim()
        : "";
    const coverBgStyle = safeBannerUrl
      ? `background-image:url('${esc(safeBannerUrl)}')`
      : `background:${esc(pc.banner_css || "linear-gradient(135deg, #0b132b 0%, #1d4ed8 48%, #020617 100%)")}`;
    const showcaseBadge = pc.showcase_badge_meta || { label: "Alpha Wolf", color: "#38bdf8" };
    const citizenSerial = `LM-${String(u.id).padStart(5, "0")}`;

    return `
      <!-- LupMax Signature Custom Profile Cover Banner -->
      <section class="lm-profile-cover anim-enter" style="${customAccent ? `--lm-p-accent:${esc(customAccent)};border-color:${esc(customAccent)}55;` : ""}">
        <div class="lm-profile-cover-bg" style="${coverBgStyle}"></div>
        <div class="lm-profile-cover-overlay"></div>
        <div class="lm-profile-cover-content">
          <div class="lm-profile-hero-left">
            <div class="lm-profile-avatar-frame">
              <div class="lm-profile-avatar-inner">
                <img src="${skinImgUrl(u.Model)}" alt="Skin ${u.Model}" />
              </div>
            </div>
            <div class="lm-profile-title-block">
              <h2>
                <span>${esc(u.name)}</span>
                ${renderOnlineStatus(u.Status)}
                ${pc.custom_title
        ? `<span class="lm-custom-title-pill" ${customAccent ? `style="border-color:${esc(customAccent)}88;background:${esc(customAccent)}2b"` : ""}>${esc(pc.custom_title)}</span>`
        : ""
      }
              </h2>
              <div class="lm-profile-meta-strip">
                <span class="role-badge" style="background:${esc(showcaseBadge.color)}24;color:${esc(showcaseBadge.color)};border-color:${esc(showcaseBadge.color)}66">
                  &#9733; ${esc(showcaseBadge.label)}
                </span>
                <span class="role-badge" style="background:${esc(u.FactionColor)}24;color:${esc(u.FactionColor)};border-color:${esc(u.FactionColor)}55">
                  ${esc(u.FactionName)} &middot; Rank ${u.Rank}
                </span>
                ${renderBadges(u.badges)}
                ${pc.discord_tag ? `<span class="lm-discord-pill">Discord: ${esc(pc.discord_tag)}</span>` : ""}
                ${Number(pc.wheel_spins_total || 0) > 0 ? `<span class="lm-custom-title-pill" style="border-color:rgba(251,191,36,0.42);color:#fde68a">${fmtNum(pc.wheel_spins_total)} Spins</span>` : ""}
              </div>
              ${pc.bio ? `<p class="lm-profile-bio">${esc(pc.bio)}</p>` : ""}
            </div>
          </div>

          <div class="lm-profile-hero-actions">
            ${isSelf
        ? `<button type="button" class="btn btn-accent btn-sm" data-action="modal-customize-profile">
                     Personalizează Profilul
                   </button>`
        : ""
      }
            <button type="button" class="btn btn-outline btn-sm" data-action="copy-profile-link" data-player="${esc(u.name)}">
              Copiază Link Profil
            </button>
          </div>
        </div>
      </section>

      <div class="profile-layout anim-enter">
        <!-- Left Column: Official STATE OF SAN ANDREAS Citizen ID Card + Vitals -->
        <div class="profile-sidebar-card">
          <div class="sa-id-card" style="${customAccent ? `border-color:${esc(customAccent)}55;` : ""}">
            <div class="sa-id-header">
              <span class="sa-id-state">State of San Andreas</span>
              <span class="sa-id-serial">ID #${citizenSerial}</span>
            </div>
            <div class="sa-id-body">
              <div class="sa-id-photo">
                <img src="${skinImgUrl(u.Model)}" alt="Citizen ${esc(u.name)}" />
                <span class="profile-skin-tag" style="bottom:4px;font-size:9.5px;padding:1px 6px">Skin #${u.Model}</span>
              </div>
              <div class="sa-id-fields">
                <div class="sa-id-field"><span>Cetățean</span><strong>${esc(u.name)}</strong></div>
                <div class="sa-id-field"><span>Origine</span><strong>${esc(idn.origin || "Los Santos")}</strong></div>
                <div class="sa-id-field"><span>Sex / Vârstă</span><strong>${esc(idn.sex || "Masculin")}, ${idn.age || 18}</strong></div>
                <div class="sa-id-field"><span>Facțiune</span><strong>${esc(u.FactionTag)} (R${u.Rank})</strong></div>
                <div class="sa-id-field"><span>Telefon</span><strong class="mono-text">${u.PhoneNr || "N/A"}</strong></div>
                <div class="sa-id-field"><span>Statut VIP</span><strong>${esc(u.VIPStatus && u.VIPStatus.active ? "Activ" : "Standard")}</strong></div>
              </div>
            </div>

            <div style="width:100%;margin-top:14px;text-align:left">
              <div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:var(--text-secondary);margin-bottom:5px">
                <span style="display:inline-flex;align-items:center;gap:6px">
                  <span class="gta-rp-globe">${u.Level}</span>
                  <strong style="color:#fff;font-family:var(--font-gta);letter-spacing:0.04em;text-transform:uppercase">RP Rank ${u.Level}</strong>
                </span>
                <span>${u.Respect} / ${u.RespectNeeded} RP (${respectProgressPct}%)</span>
              </div>
              ${renderGtaSegBar(respectProgressPct)}
            </div>

            <div class="sa-id-footer">
              <div class="sa-id-barcode" aria-hidden="true"></div>
              <span class="mono-text" style="font-size:10px;color:var(--text-muted)">REG ${esc(u.RegisterDate || "-")}</span>
            </div>
          </div>

          <div class="profile-vitals-list">
            <div class="vital-item"><span>Facțiune</span><strong>${esc(u.FactionTag)} &middot; ${esc(u.FactionRankName)}</strong></div>
            <div class="vital-item"><span>Ore Jucate</span><strong>${u.ConnectedTime}h</strong></div>
            <div class="vital-item"><span>Job Actual</span><strong>${esc(u.JobName)}</strong></div>
            <div class="vital-item"><span>Avertismente</span><strong style="color:${u.Warnings > 0 ? "#f87171" : "#34d399"}">${u.Warnings} / 3</strong></div>
            <div class="vital-item"><span>FWarn / FPunish</span><strong>${u.FWarn}/3 &middot; ${u.FPunish}/20</strong></div>
            <div class="vital-item"><span>Înregistrat</span><strong class="mono-text">${esc(u.RegisterDate)}</strong></div>
            <div class="vital-item"><span>Ultima Logare</span><strong class="mono-text">${esc(u.lastOn)}</strong></div>
          </div>

          <div style="display:flex;flex-direction:column;gap:6px;margin-top:16px;padding-top:14px;border-top:1px solid var(--border-subtle)">
            ${!isSelf
        ? `<button type="button" class="btn btn-crimson btn-sm btn-block" data-action="modal-complaint" data-target="${esc(u.name)}">
                     Reclamă Jucătorul
                   </button>`
        : `<button type="button" class="btn btn-primary btn-sm btn-block" data-action="modal-customize-profile">
                     Studio Profil LupMax
                   </button>
                   <button type="button" class="btn btn-outline btn-sm btn-block" data-nav="security">
                     Setări Cont &amp; Email
                   </button>`
      }
            ${isAdminViewer
        ? `<button type="button" class="btn btn-amber btn-sm btn-block" data-action="modal-sanction" data-target="${esc(u.name)}">
                     Sancționează / Acțiune Live
                   </button>`
        : ""
      }
          </div>
        </div>

        <!-- Right Main Content Column: Tabs & Detailed Data -->
        <div class="profile-main-panel">
          <div class="ucp-tabs">
            <button type="button" class="ucp-tab-btn ${tab === "overview" ? "active" : ""}" data-subtab="profile:overview">General &amp; Inventar</button>
            <button type="button" class="ucp-tab-btn ${tab === "raport" ? "active" : ""}" data-subtab="profile:raport">Facțiune &amp; Raport</button>
            <button type="button" class="ucp-tab-btn ${tab === "skills" ? "active" : ""}" data-subtab="profile:skills">Job Skills &amp; Quest-uri</button>
            <button type="button" class="ucp-tab-btn ${tab === "assets" ? "active" : ""}" data-subtab="profile:assets">Garaj Vizual (${(p.cars || []).length}) &amp; Proprietăți</button>
            <button type="button" class="ucp-tab-btn ${tab === "history" ? "active" : ""}" data-subtab="profile:history">Faction History &amp; Sancțiuni</button>
            ${p.admin_intel
        ? `<button type="button" class="ucp-tab-btn ${tab === "admin_intel" ? "active" : ""}" data-subtab="profile:admin_intel">Admin Intel (IP / Clone)</button>`
        : ""
      }
          </div>

          ${tabBody}
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 8. VIEW 3: PLAYERS & STAFF DIRECTORY
  // --------------------------------------------------------------------------
  function renderPlayersTableRowsHTML(players) {
    if (!Array.isArray(players) || !players.length) {
      return `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted)">Niciun jucător găsit.</td></tr>`;
    }
    return players
      .map(
        (p) => `
        <tr>
          <td class="mono-text">#${p.id}</td>
          <td>
            <div style="display:flex;align-items:center;gap:10px">
              <div class="skin-avatar-circle">
                <img src="${skinImgUrl(p.Model)}" alt="Skin" />
              </div>
              <div>
                ${playerBtn(p.name)}
                <div style="font-size:11px;color:var(--text-muted)">Ultima logare: ${esc(p.lastOn)}</div>
              </div>
            </div>
          </td>
          <td><strong>Level ${p.Level}</strong> <span style="color:var(--text-muted);font-size:11.5px">(${p.ConnectedTime}h)</span></td>
          <td>
            <span class="role-badge" style="background:${esc(p.FactionColor)}1f;color:${esc(p.FactionColor)};border-color:${esc(p.FactionColor)}4d">
              ${esc(p.FactionName)} (${p.Rank})
            </span>
          </td>
          <td>${renderBadges(p.badges)}</td>
          <td>${renderOnlineStatus(p.Status)}</td>
          <td>
            <button type="button" class="btn btn-outline btn-xs" data-action="view-player" data-player="${esc(p.name)}">
              Vezi Profil
            </button>
          </td>
        </tr>`
      )
      .join("");
  }

  async function loadAndRenderPlayers(queryParams = {}) {
    const vp = document.getElementById("ucpViewport");
    const role = queryParams.role || STATE.subTab.players || "all";
    STATE.subTab.players = role;
    const q = queryParams.q !== undefined ? queryParams.q : STATE.playersQuery || "";
    STATE.playersQuery = q;
    const qs = new URLSearchParams({ role, q, limit: "10" }).toString();
    const data = await api(`/api/players?${qs}`);
    STATE.cachedPlayers = data;
    if (vp && STATE.view === "players") {
      if (queryParams.onlyTable) {
        const tbody = document.getElementById("directoryTableBody");
        const titleEl = document.getElementById("directoryCountTitle");
        if (tbody) tbody.innerHTML = renderPlayersTableRowsHTML(data.players || []);
        if (titleEl) {
          titleEl.textContent = `Caută un Jucător (${(data.players || []).length} rezultate ordonate descrescător)`;
        }
      } else {
        vp.innerHTML = renderPlayersViewHTML(data, role, q);
      }
    }
  }

  function renderPlayersViewHTML(data, role, q) {
    const rows = renderPlayersTableRowsHTML(data.players || []);

    return `
      <div class="ucp-tabs anim-enter">
        <button type="button" class="ucp-tab-btn ${role === "all" ? "active" : ""}" data-action="filter-players" data-role="all">Toți Jucătorii (Top 10)</button>
        <button type="button" class="ucp-tab-btn ${role === "admins" ? "active" : ""}" data-action="filter-players" data-role="admins">Administratori (${(data.staff?.admins || []).length})</button>
        <button type="button" class="ucp-tab-btn ${role === "helpers" ? "active" : ""}" data-action="filter-players" data-role="helpers">Helperi (${(data.staff?.helpers || []).length})</button>
        <button type="button" class="ucp-tab-btn ${role === "leaders" ? "active" : ""}" data-action="filter-players" data-role="leaders">Lideri Facțiuni (${(data.staff?.leaders || []).length})</button>
        <button type="button" class="ucp-tab-btn ${role === "managers" ? "active" : ""}" data-action="filter-players" data-role="managers">Manageri (${(data.staff?.managers || []).length})</button>
        <button type="button" class="ucp-tab-btn ${role === "vips" ? "active" : ""}" data-action="filter-players" data-role="vips">Conturi VIP</button>
        <button type="button" class="ucp-tab-btn ${role === "legends" ? "active" : ""}" data-action="filter-players" data-role="legends">Legends</button>
      </div>

      <div class="ucp-card anim-enter">
        <div class="card-header">
          <div>
            <div class="card-title" id="directoryCountTitle">Caută un Jucător (${(data.players || []).length} rezultate ordonate descrescător)</div>
            <div class="card-subtitle">Lista afișează top 5-10 rezultate descrescătoare pe măsură ce scrii numele</div>
          </div>
          <div style="display:flex;gap:8px">
            <input type="text" id="directorySearchInput" class="form-control" style="width:260px" placeholder="Scrie numele sau SQL ID..." value="${esc(q)}" autocomplete="off" />
            <button type="button" class="btn btn-primary btn-sm" data-action="run-directory-search">Caută</button>
          </div>
        </div>
        <div class="ucp-table-wrap">
          <table class="ucp-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Jucător</th>
                <th>Nivel &amp; Ore</th>
                <th>Facțiune</th>
                <th>Funcții</th>
                <th>Status</th>
                <th>Profil</th>
              </tr>
            </thead>
            <tbody id="directoryTableBody">${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 9. VIEW 4: LEADERBOARDS (8 LIVE RANKINGS)
  // --------------------------------------------------------------------------
  async function loadAndRenderLeaderboards() {
    const vp = document.getElementById("ucpViewport");
    if (!STATE.cachedLeaderboards) {
      STATE.cachedLeaderboards = await api("/api/leaderboards");
    }
    if (vp && STATE.view === "leaderboards") {
      vp.innerHTML = renderLeaderboardsHTML(STATE.cachedLeaderboards);
    }
  }

  function renderLeaderboardsHTML(lb) {
    const cat = STATE.subTab.leaderboards || "level";
    const metaMap = {
      level: { title: "Top 25 Nivel & Respect Points", colLabel: "Nivel / RP", fmt: (r) => `Level ${r.Level} (${fmtNum(r.Respect)} RP)` },
      hours: { title: "Top 25 Ore Jucate (ConnectedTime)", colLabel: "Ore Jucate", fmt: (r) => `${r.ConnectedTime}h (${r.OnlineThisWeek}h săpt. asta)` },
      wealth: { title: "Top 25 Avere Totală (Cash + Bank)", colLabel: "Avere Totală", fmt: (r) => fmtMoney(r.TotalWealth) },
      paintball: { title: "Top 25 Paintball Arena", colLabel: "Paintball K/D", fmt: (r) => `${fmtNum(r.PaintKills)} Kills / ${fmtNum(r.PaintDeath)} Deaths` },
      race: { title: "Top 25 Race Arena", colLabel: "Race Points", fmt: (r) => `${fmtNum(r.RacePoints)} Puncte (${fmtNum(r.RaceExp)} EXP)` },
      robbers: { title: "Top 25 Rob Points", colLabel: "Rob Points", fmt: (r) => `${fmtNum(r.Rob)} Rob Points` },
      admins: { title: "Top Activitate Administratori", colLabel: "Comenzi Admin", fmt: (r) => `${fmtNum(r.Commands)} Comenzi (Admin ${r.Admin})` },
      helpers: { title: "Top Activitate Helperi", colLabel: "Jucători Ajutați", fmt: (r) => `${fmtNum(r.HelpedPlayers)} Ajutați (Helper ${r.Helper})` },
    };
    const activeMeta = metaMap[cat] || metaMap.level;
    const list = lb[cat] || [];

    const rows = list
      .map(
        (r, idx) => `
        <tr>
          <td><strong class="mono-text" style="color:${idx < 3 ? "#fbbf24" : "var(--text-muted)"}">#${idx + 1}</strong></td>
          <td>
            <div style="display:flex;align-items:center;gap:10px">
              <div class="skin-avatar-circle"><img src="${skinImgUrl(r.Model)}" alt="Skin" /></div>
              ${playerBtn(r.name)}
            </div>
          </td>
          <td><strong>Level ${r.Level}</strong></td>
          <td><span class="role-badge" style="background:${esc(r.FactionColor)}1f;color:${esc(r.FactionColor)}">${esc(r.FactionTag)}</span></td>
          <td><strong style="color:var(--brand-primary)">${activeMeta.fmt(r)}</strong></td>
          <td>${renderOnlineStatus(r.Status)}</td>
        </tr>`
      )
      .join("");

    return `
      <div class="ucp-tabs anim-enter">
        <button type="button" class="ucp-tab-btn ${cat === "level" ? "active" : ""}" data-subtab="leaderboards:level">Top Nivel</button>
        <button type="button" class="ucp-tab-btn ${cat === "hours" ? "active" : ""}" data-subtab="leaderboards:hours">Top Ore Jucate</button>
        <button type="button" class="ucp-tab-btn ${cat === "wealth" ? "active" : ""}" data-subtab="leaderboards:wealth">Top Avere</button>
        <button type="button" class="ucp-tab-btn ${cat === "paintball" ? "active" : ""}" data-subtab="leaderboards:paintball">Top Paintball</button>
        <button type="button" class="ucp-tab-btn ${cat === "race" ? "active" : ""}" data-subtab="leaderboards:race">Top Race Arena</button>
        <button type="button" class="ucp-tab-btn ${cat === "robbers" ? "active" : ""}" data-subtab="leaderboards:robbers">Top Robberi</button>
        <button type="button" class="ucp-tab-btn ${cat === "admins" ? "active" : ""}" data-subtab="leaderboards:admins">Top Admini</button>
        <button type="button" class="ucp-tab-btn ${cat === "helpers" ? "active" : ""}" data-subtab="leaderboards:helpers">Top Helperi</button>
      </div>

      <div class="ucp-card anim-enter">
        <div class="card-header">
          <div class="card-title">${esc(activeMeta.title)}</div>
        </div>
        <div class="ucp-table-wrap">
          <table class="ucp-table">
            <thead>
              <tr>
                <th>Loc</th>
                <th>Jucător</th>
                <th>Nivel</th>
                <th>Facțiune</th>
                <th>${esc(activeMeta.colLabel)}</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 10. VIEW 5: FACTIONS, APPLICATIONS & LEADER CONTROL PANEL
  // --------------------------------------------------------------------------
  async function loadAndRenderFactions(fid) {
    if (fid) STATE.activeFactionId = Number(fid);
    const vp = document.getElementById("ucpViewport");
    const [detail, leaderApps] = await Promise.all([
      api(`/api/faction/${STATE.activeFactionId}`),
      api("/api/leader-applications").catch(() => null),
    ]);
    STATE.cachedFaction = detail;
    if (leaderApps) STATE.cachedLeaderApps = leaderApps;
    if (vp && STATE.view === "factions") {
      vp.innerHTML = renderFactionsHTML(detail);
    }
  }

  function renderFactionsHTML(detail) {
    const factions = (STATE.bootstrap && STATE.bootstrap.factions) || [];
    const f = detail.faction;
    const fTab = STATE.subTab.factions || "members";

    const cards = factions
      .map(
        (fc) => `
        <div class="ucp-card" style="padding:12px 14px;cursor:pointer;border-color:${fc.ID === f.ID ? fc.Color : "var(--border-color)"}" data-action="select-faction" data-id="${fc.ID}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span class="role-badge" style="background:${esc(fc.Color)}1f;color:${esc(fc.Color)};border-color:${esc(fc.Color)}4d">#${fc.ID} &middot; ${esc(fc.Tag)}</span>
            <span class="status-pill ${fc.Application ? "status-closed" : "status-rejected"}">${fc.Application ? "Aplicații Deschise" : "Închise"}</span>
          </div>
          <div style="font-weight:600;color:var(--text-heading);font-size:13.5px;margin-bottom:4px">${esc(fc.Name)}</div>
          <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--text-secondary)">
            <span>Lider: ${esc(fc.LeaderName)}</span>
            <span>${fc.Members}/${fc.MaxMembers} (Lvl ${fc.MinLevel}+)</span>
          </div>
        </div>`
      )
      .join("");

    let bodyHTML = "";
    if (fTab === "members") {
      const mRows = (detail.members || [])
        .map(
          (m) => `
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:10px">
                <div class="skin-avatar-circle">
                  <img src="${skinImgUrl(m.Model)}" alt="Skin" />
                </div>
                ${playerBtn(m.name)}
              </div>
            </td>
            <td><strong>Rank ${m.Rank}</strong> <span style="color:var(--text-muted);font-size:11.5px">(${esc(m.FactionRankName)})</span></td>
            <td>${m.FactionTime} zile <span style="color:var(--text-muted);font-size:11px">(${esc(m.FactionJoin)})</span></td>
            <td><span style="color:${m.FWarn > 0 ? "#fbbf24" : "#34d399"}">${m.FWarn} / 3</span></td>
            <td>
              <span class="mono-text" style="font-size:11.5px;color:var(--text-secondary)">
                FWk:${m.FWorks} &middot; Arr:${m.Arrested} &middot; Tck:${m.Tickets} &middot; Lc:${m.Lconf} &middot; Med:${m.Mdep} &middot; Lv:${m.Lives}
              </span>
            </td>
            <td>${renderOnlineStatus(m.Status)}</td>
            ${detail.can_manage
              ? `<td>
                     <button type="button" class="btn btn-outline btn-xs" data-action="modal-leader-member" data-fid="${f.ID}" data-uid="${m.id}" data-name="${esc(m.name)}" data-rank="${m.Rank}" data-fwarn="${m.FWarn}">
                       Acțiuni Lider
                     </button>
                   </td>`
              : ""
            }
          </tr>`
        )
        .join("");

      bodyHTML = `
        <div class="ucp-table-wrap">
          <table class="ucp-table">
            <thead>
              <tr>
                <th>Membru</th>
                <th>Rank</th>
                <th>Vechime</th>
                <th>FWarn</th>
                <th>Raport Activitate</th>
                <th>Status</th>
                ${detail.can_manage ? "<th>Conducere</th>" : ""}
              </tr>
            </thead>
            <tbody>${mRows || `<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--text-muted)">Facțiunea nu are membri activi.</td></tr>`}</tbody>
          </table>
        </div>
      `;
    } else if (fTab === "raport") {
      const rs = detail.raport_summary || { total: (detail.members || []).length, complete: 0, incomplete: 0, exempt: 0 };
      const rRows = (detail.members || [])
        .map((m) => {
          const ev = m.RaportEval || { points: 0, target: 20, pct: 0, status: "incomplete", status_label: "Raport Incomplet", breakdown: "-" };
          const barColor = ev.status === "complete" ? "#10b981" : ev.status === "exempt" ? "#3b82f6" : "#f59e0b";
          const pillCls = ev.status === "complete" ? "status-online" : ev.status === "exempt" ? "status-closed" : "status-open";
          return `
            <tr>
              <td>
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="skin-avatar-circle">
                    <img src="${skinImgUrl(m.Model)}" alt="Skin" />
                  </div>
                  ${playerBtn(m.name)}
                </div>
              </td>
              <td><strong>Rank ${m.Rank}</strong> <span style="color:var(--text-muted);font-size:11.5px">(${esc(m.FactionRankName)})</span></td>
              <td>${m.FactionTime} zile &middot; <span class="mono-text">${m.OnlineThisWeek || 0}h/săpt</span></td>
              <td style="font-size:12px;color:var(--text-secondary)">${esc(ev.breakdown)}</td>
              <td style="min-width:165px">
                <div style="display:flex;justify-content:space-between;font-size:11.2px;margin-bottom:3px">
                  <strong class="mono-text">${ev.points} / ${ev.target || "-"} pct</strong>
                  <span class="mono-text">${ev.pct}%</span>
                </div>
                <div class="progress-track">
                  <div class="progress-fill" style="width:${ev.pct}%;background:${barColor}"></div>
                </div>
              </td>
              <td><span class="status-pill ${pillCls}">${esc(ev.status_label)}</span></td>
              ${detail.can_manage
              ? `<td>
                       <div style="display:flex;gap:5px">
                         <button type="button" class="btn btn-outline btn-xs" data-action="quick-reset-raport" data-fid="${f.ID}" data-uid="${m.id}" title="Resetează raportul acestui membru">
                           Reset
                         </button>
                         <button type="button" class="btn btn-outline btn-xs" data-action="modal-leader-member" data-fid="${f.ID}" data-uid="${m.id}" data-name="${esc(m.name)}" data-rank="${m.Rank}" data-fwarn="${m.FWarn}">
                           Sancționează
                         </button>
                       </div>
                     </td>`
              : ""
            }
            </tr>`;
        })
        .join("");

      bodyHTML = `
        <div class="ucp-grid-4" style="margin-bottom:14px">
          <div class="kpi-card">
            <div>
              <div class="kpi-label">Total Membri</div>
              <div class="kpi-value">${rs.total}</div>
              <div class="kpi-sub">Activează în ${esc(f.Tag)}</div>
            </div>
          </div>
          <div class="kpi-card">
            <div>
              <div class="kpi-label">Raport Complet</div>
              <div class="kpi-value" style="color:#34d399">${rs.complete}</div>
              <div class="kpi-sub">Eligibili pentru Rank Up</div>
            </div>
          </div>
          <div class="kpi-card">
            <div>
              <div class="kpi-label">Raport Incomplet</div>
              <div class="kpi-value" style="color:#fbbf24">${rs.incomplete}</div>
              <div class="kpi-sub">Sub norma săptămânală</div>
            </div>
          </div>
          <div class="kpi-card">
            <div>
              <div class="kpi-label">Scutiți (Rank 6-7)</div>
              <div class="kpi-value" style="color:#60a5fa">${rs.exempt}</div>
              <div class="kpi-sub">Lider &amp; Co-Lider</div>
            </div>
          </div>
        </div>
        ${detail.can_manage
          ? `<div style="display:flex;justify-content:flex-end;margin-bottom:10px">
                 <button type="button" class="btn btn-primary btn-xs" data-action="reset-all-raport" data-fid="${f.ID}">
                   Resetează Raportul Tuturor Membrilor (După Ședință)
                 </button>
               </div>`
          : ""
        }
        <div class="ucp-table-wrap">
          <table class="ucp-table">
            <thead>
              <tr>
                <th>Membru</th>
                <th>Rank</th>
                <th>Vechime &amp; Ore/Săpt</th>
                <th>Detalii Activitate</th>
                <th>Progres Normă</th>
                <th>Status Raport</th>
                ${detail.can_manage ? "<th>Conducere</th>" : ""}
              </tr>
            </thead>
            <tbody>${rRows || `<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--text-muted)">Facțiunea nu are membri activi.</td></tr>`}</tbody>
          </table>
        </div>
      `;
    } else if (fTab === "applications") {
      const statusMap = {
        0: { txt: "În Așteptare", cls: "status-open" },
        1: { txt: "Acceptat pt. Teste", cls: "status-closed" },
        2: { txt: "Acceptat Final", cls: "status-closed" },
        3: { txt: "Respins", cls: "status-rejected" },
      };
      const appRows = (detail.applications || [])
        .map((a) => {
          const st = statusMap[a.status] || statusMap[0];
          const qaList = (a.qa || [])
            .map((item) => `<div style="margin-bottom:5px"><strong style="color:var(--text-heading)">${item.index}. ${esc(item.q)}</strong><br/><span style="color:var(--text-secondary)">${esc(item.a)}</span></div>`)
            .join("");
          return `
            <div class="ucp-card" style="margin-bottom:10px;background:var(--bg-inset)">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:8px">
                <div>
                  <strong>Aplicația #${a.id}</strong> &middot; ${playerBtn(a.name)}
                  <span style="color:var(--text-secondary);font-size:12px"> (Level ${a.Level} &middot; ${a.ConnectedTime}h &middot; ${a.Warnings}/3 Warns &middot; ${a.FPunish} FP)</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                  <span class="status-pill ${st.cls}">${st.txt}</span>
                  <span class="mono-text" style="color:var(--text-muted)">${esc(a.time)} &middot; ${esc(a.actionby)}</span>
                </div>
              </div>
              ${qaList ? `<div style="padding:10px;background:var(--bg-body);border:1px solid var(--border-subtle);border-radius:6px;font-size:12.5px;margin-bottom:8px">${qaList}</div>` : ""}
              ${detail.can_manage
              ? `<div style="display:flex;gap:6px;flex-wrap:wrap">
                       <button type="button" class="btn btn-emerald btn-xs" data-action="review-app" data-id="${a.id}" data-status="1">Acceptă pt. Teste</button>
                       <button type="button" class="btn btn-primary btn-xs" data-action="review-app" data-id="${a.id}" data-status="2">Acceptă Final</button>
                       <button type="button" class="btn btn-crimson btn-xs" data-action="review-app" data-id="${a.id}" data-status="3">Respinge</button>
                     </div>`
              : ""
            }
            </div>`;
        })
        .join("");

      bodyHTML = appRows || `<div style="color:var(--text-muted);padding:14px">Nicio aplicație înregistrată pentru această facțiune.</div>`;
    } else if (fTab === "logs") {
      bodyHTML = `
        <div class="ucp-grid-2">
          <div>
            <div style="font-weight:600;margin-bottom:8px;color:var(--text-heading)">Loguri Facțiune (factionlog)</div>
            <div class="fh-timeline" style="max-height:380px;overflow-y:auto">
              ${(detail.logs || []).map((l) => `<div class="fh-entry ${classifyFhEntry(l.action)}"><div>${esc(l.action)}</div><div class="mono-text" style="color:var(--text-muted)">${esc(l.time)}</div></div>`).join("") || `<div style="color:var(--text-muted)">Fără loguri.</div>`}
            </div>
          </div>
          <div>
            <div style="font-weight:600;margin-bottom:8px;color:var(--text-heading)">Loguri Seif &amp; Depozit (factions_deposit)</div>
            <div class="kv-list" style="max-height:380px;overflow-y:auto">
              ${(detail.deposit_logs || []).map((d) => `<div class="kv-row"><span><strong>${esc(d.name)}:</strong> ${esc(d.action)}</span><span class="mono-text" style="color:var(--text-muted)">${esc(d.time)}</span></div>`).join("") || `<div style="color:var(--text-muted)">Fără loguri depozit.</div>`}
            </div>
          </div>
        </div>
      `;
    } else if (fTab === "leader_apps") {
      const laData = STATE.cachedLeaderApps || { can_manage: false, factions: [], applications: [] };
      const laStatusMap = {
        0: { txt: "În Așteptare", cls: "status-open" },
        1: { txt: "Acceptat Interviu", cls: "status-closed" },
        2: { txt: "Aprobat (Numit Lider)", cls: "status-online" },
        3: { txt: "Respins", cls: "status-rejected" },
      };

      const factionRecruitCards = (laData.factions || [])
        .map(
          (lf) => `
          <div class="ucp-card" style="padding:12px 14px;background:var(--bg-inset)">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px">
              <span class="role-badge" style="background:${esc(lf.Color)}1f;color:${esc(lf.Color)};border-color:${esc(lf.Color)}4d">#${lf.ID} &middot; ${esc(lf.Tag)}</span>
              <span class="status-pill ${lf.Open ? "status-online" : "status-rejected"}">${lf.Open ? "Recrutare Lider ON" : "Închise"}</span>
            </div>
            <div style="font-weight:600;color:var(--text-heading);font-size:13.5px;margin-bottom:4px">${esc(lf.Name)}</div>
            <div style="font-size:11.8px;color:var(--text-secondary);margin-bottom:8px">
              Lider actual: <strong>${esc(lf.LeaderName)}</strong><br/>
              Cerințe: Level ${lf.MinLevel}+ &middot; ${lf.MinHours}h+
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${lf.Open
              ? `<button type="button" class="btn btn-primary btn-xs" data-action="modal-apply-leader" data-fid="${lf.ID}" data-fname="${esc(lf.Name)}">Aplică pt. Lider</button>`
              : ""
            }
              ${laData.can_manage
              ? `<button type="button" class="btn btn-outline btn-xs" data-action="toggle-leader-app" data-fid="${lf.ID}" data-open="${lf.Open ? 0 : 1}" data-minlvl="${lf.MinLevel}" data-minhrs="${lf.MinHours}">
                       ${lf.Open ? "Închide" : "Deschide"}
                     </button>`
              : ""
            }
            </div>
          </div>`
        )
        .join("");

      const leaderAppCards = (laData.applications || [])
        .map((a) => {
          const st = laStatusMap[a.status] || laStatusMap[0];
          return `
            <div class="ucp-card" style="margin-bottom:10px;background:var(--bg-inset)">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:8px">
                <div>
                  <strong>Aplicație Lider #${a.id}</strong> &middot;
                  <span class="role-badge" style="background:${esc(a.FactionColor)}1f;color:${esc(a.FactionColor)}">${esc(a.FactionTag)} — ${esc(a.FactionName)}</span>
                  &middot; ${playerBtn(a.playername)}
                  <span style="color:var(--text-secondary);font-size:12px"> (Lvl ${a.Level} &middot; ${a.ConnectedTime}h &middot; ${a.Warnings}/3 W &middot; ${a.FPunish} FP)</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                  <span class="status-pill ${st.cls}">${st.txt}</span>
                  <span class="mono-text" style="color:var(--text-muted)">${esc(a.created_at)}${a.reviewed_by ? ` &middot; ${esc(a.reviewed_by)}` : ""}</span>
                </div>
              </div>
              ${a.can_see_details
              ? `<div style="padding:10px;background:var(--bg-body);border:1px solid var(--border-subtle);border-radius:6px;font-size:12.5px;margin-bottom:8px;display:grid;gap:6px">
                       <div><strong>Nume &amp; Vârstă:</strong> ${esc(a.real_name)} (${a.age} ani) &middot; <strong>Activitate zilnică:</strong> ${esc(a.activity)}</div>
                       <div><strong>Experiență Lider / Co-Lider:</strong><br/><span style="color:var(--text-secondary);white-space:pre-line">${esc(a.experience)}</span></div>
                       <div><strong>Plan &amp; Viziune pentru Facțiune:</strong><br/><span style="color:var(--text-secondary);white-space:pre-line">${esc(a.plan)}</span></div>
                       ${a.review_note ? `<div style="color:#fbbf24"><strong>Notă Manager Lideri:</strong> ${esc(a.review_note)}</div>` : ""}
                     </div>`
              : `<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Detaliile aplicației sunt vizibile doar aplicantului și Managerilor de Lideri.</div>`
            }
              ${laData.can_manage && Number(a.status) <= 1
              ? `<div style="display:flex;gap:6px;flex-wrap:wrap">
                       <button type="button" class="btn btn-outline btn-xs" data-action="review-leader-app" data-id="${a.id}" data-status="1">Acceptă pt. Interviu</button>
                       <button type="button" class="btn btn-emerald btn-xs" data-action="review-leader-app" data-id="${a.id}" data-status="2">Aprobă &amp; Numește Lider</button>
                       <button type="button" class="btn btn-crimson btn-xs" data-action="review-leader-app" data-id="${a.id}" data-status="3">Respinge</button>
                     </div>`
              : ""
            }
            </div>`;
        })
        .join("");

      bodyHTML = `
        <div style="font-weight:600;margin-bottom:10px;color:var(--text-heading)">Status Recrutare Lideri pe Facțiuni (1–14)</div>
        <div class="ucp-grid-4" style="margin-bottom:16px">${factionRecruitCards}</div>
        <div style="font-weight:600;margin-bottom:10px;color:var(--text-heading)">Aplicații pentru Funcția de Lider (${(laData.applications || []).length})</div>
        ${leaderAppCards || `<div style="color:var(--text-muted);padding:14px">Nicio aplicație de Lider depusă încă.</div>`}
      `;
    } else if (fTab === "leader" && detail.can_manage) {
      const rankInputs = [1, 2, 3, 4, 5, 6, 7]
        .map(
          (i) => `
          <div class="form-group">
            <label class="form-label">Nume Rank ${i}</label>
            <input type="text" class="form-control leader-rank-input" data-rank="${i}" value="${esc(f.Ranks[String(i)] || `Rank ${i}`)}" />
          </div>`
        )
        .join("");
      const qInputs = (f.Questions || [])
        .map(
          (q, idx) => `
          <div class="form-group">
            <label class="form-label">Întrebarea #${idx + 1}</label>
            <input type="text" class="form-control leader-q-input" data-qindex="${idx + 1}" value="${esc(q || "")}" />
          </div>`
        )
        .join("");

      bodyHTML = `
        <form id="leaderSettingsForm" data-fid="${f.ID}">
          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label">Nivel Minim Aplicare (MinLevel)</label>
              <input type="number" class="form-control" name="MinLevel" min="1" max="50" value="${f.MinLevel}" required />
            </div>
            <div class="form-group">
              <label class="form-label">Status Aplicații Recrutare</label>
              <select class="form-control" name="Application">
                <option value="1" ${f.Application ? "selected" : ""}>Deschise</option>
                <option value="0" ${!f.Application ? "selected" : ""}>Închise</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Anunț Intern / MOTD Facțiune (Anunt)</label>
            <input type="text" class="form-control" name="Anunt" maxlength="125" value="${esc(f.Anunt)}" required />
          </div>
          <div style="font-weight:600;margin:14px 0 8px;color:var(--text-heading)">Denumiri Rank-uri (Rank 1 - 7)</div>
          <div class="ucp-grid-4">${rankInputs}</div>
          <div style="font-weight:600;margin:14px 0 8px;color:var(--text-heading)">Chestionar Recrutare (Întrebările 1 - 15)</div>
          <div class="ucp-grid-3">${qInputs}</div>
          <button type="submit" class="btn btn-primary" style="margin-top:8px">Salvează Setările Facțiunii</button>
        </form>
      `;
    }

    return `
      <div class="ucp-grid-4 anim-enter" style="margin-bottom:16px">${cards}</div>

      <div class="ucp-card anim-enter">
        <div class="card-header" style="flex-wrap:wrap">
          <div>
            <div class="card-title" style="font-size:16px">
              <span class="role-badge" style="background:${esc(f.Color)}1f;color:${esc(f.Color)};border-color:${esc(f.Color)}4d">${esc(f.Tag)}</span>
              ${esc(f.Name)} (${esc(f.City)})
            </div>
            <div class="card-subtitle" style="margin-top:4px">
              MOTD: <strong>${esc(f.Anunt)}</strong> &middot; Seif: <strong style="color:#34d399">${fmtMoney(f.Bank)}</strong> &middot; Materiale: <strong>${fmtNum(f.Mats)}</strong> &middot; Droguri: <strong>${fmtNum(f.Drugs)}g</strong>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            ${f.Application
        ? `<button type="button" class="btn btn-primary btn-sm" data-action="modal-apply-faction" data-fid="${f.ID}">
                     Aplică la ${esc(f.Tag)}
                   </button>`
        : `<span class="status-pill status-rejected">Aplicații Membri Închise</span>`
      }
            ${((STATE.bootstrap && STATE.bootstrap.factions) || []).find((x) => x.ID === f.ID)?.LeaderAppOpen
        ? `<button type="button" class="btn btn-accent btn-sm" data-action="modal-apply-leader" data-fid="${f.ID}" data-fname="${esc(f.Name)}">
                     Aplică pt. Lider ${esc(f.Tag)}
                   </button>`
        : ""
      }
          </div>
        </div>

        <div class="ucp-tabs">
          <button type="button" class="ucp-tab-btn ${fTab === "members" ? "active" : ""}" data-subtab="factions:members">Membri (${(detail.members || []).length}/${f.MaxMembers})</button>
          <button type="button" class="ucp-tab-btn ${fTab === "raport" ? "active" : ""}" data-subtab="factions:raport">Evidență Raport Săptămânal</button>
          <button type="button" class="ucp-tab-btn ${fTab === "applications" ? "active" : ""}" data-subtab="factions:applications">Aplicații Membri (${(detail.applications || []).length})</button>
          <button type="button" class="ucp-tab-btn ${fTab === "leader_apps" ? "active" : ""}" data-subtab="factions:leader_apps">Aplicații Lider (${((STATE.cachedLeaderApps && STATE.cachedLeaderApps.applications) || []).length})</button>
          <button type="button" class="ucp-tab-btn ${fTab === "logs" ? "active" : ""}" data-subtab="factions:logs">Loguri &amp; Depozit</button>
          ${detail.can_manage
        ? `<button type="button" class="ucp-tab-btn ${fTab === "leader" ? "active" : ""}" data-subtab="factions:leader">Panou Lider</button>`
        : ""
      }
        </div>

        ${bodyHTML}
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 11. VIEW 6: CLANS & CLAN OWNER PANEL
  // --------------------------------------------------------------------------
  async function loadAndRenderClans(cid) {
    if (cid !== undefined) STATE.activeClanId = Number(cid);
    const vp = document.getElementById("ucpViewport");
    const data = await api(`/api/clans?id=${STATE.activeClanId}`);
    STATE.cachedClans = data;
    if (vp && STATE.view === "clans") {
      vp.innerHTML = renderClansHTML(data);
    }
  }

  function renderClansHTML(data) {
    const clans = data.clans || [];
    const sel = data.selected;
    if (!clans.length) {
      return `<div class="ucp-card"><div class="card-title">Nu există clanuri înregistrate pe server.</div></div>`;
    }

    const clanCards = clans
      .map(
        (c) => `
        <div class="ucp-card" style="cursor:pointer;border-color:${sel && sel.clanID === c.clanID ? "#" + c.clanColor : "var(--border-color)"}" data-action="select-clan" data-id="${c.clanID}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span class="role-badge" style="background:#${esc(c.clanColor)}1f;color:#${esc(c.clanColor)};border-color:#${esc(c.clanColor)}4d">[${esc(c.clanTag)}]</span>
            <span class="mono-text" style="color:var(--text-secondary)">${c.MembersCount}/${c.clanMaxMembers} membri</span>
          </div>
          <div style="font-weight:600;font-size:14px;color:var(--text-heading)">${esc(c.clanName)}</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:3px">Lider: ${esc(c.OwnerName || "N/A")} &middot; ${c.clanDays} zile</div>
        </div>`
      )
      .join("");

    if (!sel) return `<div class="ucp-grid-3">${clanCards}</div>`;

    const canManageClan =
      STATE.user &&
      ((Number(STATE.user.Clan) === Number(sel.clanID) && Number(STATE.user.CRank) >= 6) || Number(STATE.user.Admin) >= 5);

    return `
      <div class="ucp-grid-4 anim-enter" style="margin-bottom:16px">${clanCards}</div>
      <div class="ucp-grid-2 anim-enter">
        <div class="ucp-card">
          <div class="card-header">
            <div>
              <div class="card-title" style="color:#${esc(sel.clanColor)}">[${esc(sel.clanTag)}] ${esc(sel.clanName)} — Membri (${(data.members || []).length})</div>
              <div class="card-subtitle">MOTD: ${esc(sel.clanMOTD)}</div>
            </div>
            ${canManageClan
        ? `<button type="button" class="btn btn-primary btn-xs" data-action="modal-edit-clan" data-id="${sel.clanID}" data-motd="${esc(sel.clanMOTD)}" data-color="${esc(sel.clanColor)}" data-desc="${esc(sel.clanDescription)}">Setări Clan</button>`
        : ""
      }
          </div>
          <div class="ucp-table-wrap">
            <table class="ucp-table">
              <thead><tr><th>Membru</th><th>Nivel</th><th>Rank</th><th>Vechime</th><th>Warns</th><th>Status</th></tr></thead>
              <tbody>
                ${(data.members || [])
        .map(
          (m) => `
                  <tr>
                    <td>${playerBtn(m.name)}</td>
                    <td>Level ${m.Level}</td>
                    <td>Rank ${m.CRank} (${esc(m.RankName)})</td>
                    <td>${m.ClanTime} zile</td>
                    <td>${m.ClanWarns}/3</td>
                    <td>${renderOnlineStatus(m.Status)}</td>
                  </tr>`
        )
        .join("")}
              </tbody>
            </table>
          </div>
        </div>

        <div class="ucp-card">
          <div class="card-header"><div class="card-title">Descriere &amp; Loguri Clan</div></div>
          <div style="padding:10px;background:var(--bg-inset);border:1px solid var(--border-subtle);border-radius:6px;margin-bottom:12px;font-size:12.8px;color:var(--text-secondary)">
            ${esc(sel.clanDescription)}
          </div>
          <div class="kv-list" style="max-height:320px;overflow-y:auto">
            ${(data.logs || []).map((l) => `<div class="kv-row"><span>${esc(l.action)}</span><span class="mono-text" style="color:var(--text-muted)">${esc(l.time)}</span></div>`).join("") || `<div style="color:var(--text-muted)">Fără loguri.</div>`}
          </div>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 12. VIEW 7: INTERACTIVE 48-TURF MAP & MAFIA WARS
  // --------------------------------------------------------------------------
  async function loadAndRenderWars() {
    const vp = document.getElementById("ucpViewport");
    const data = await api("/api/wars");
    STATE.cachedWars = data;
    if (vp && STATE.view === "wars") {
      vp.innerHTML = renderWarsHTML(data);
    }
  }

  function renderWarsHTML(data) {
    const turfs = data.turfs || [];
    const mafias = data.mafias || [];

    const minX = -2950, maxX = 2950, minY = -2950, maxY = 2950;
    const mapX = (x) => ((Number(x) - minX) / (maxX - minX)) * 960 + 20;
    const mapY = (y) => (1 - (Number(y) - minY) / (maxY - minY)) * 440 + 20;

    const svgRects = turfs
      .map((t) => {
        const x1 = mapX(Math.min(t.MinX, t.MaxX));
        const x2 = mapX(Math.max(t.MinX, t.MaxX));
        const y1 = mapY(Math.max(t.MinY, t.MaxY));
        const y2 = mapY(Math.min(t.MinY, t.MaxY));
        const w = Math.max(14, x2 - x1);
        const h = Math.max(12, y2 - y1);
        const cx = x1 + w / 2;
        const cy = y1 + h / 2;
        return `
          <g class="turf-group">
            <rect
              class="turf-rect"
              x="${x1.toFixed(1)}"
              y="${y1.toFixed(1)}"
              width="${w.toFixed(1)}"
              height="${h.toFixed(1)}"
              rx="2"
              fill="${esc(t.Color)}"
            >
              <title>Turf #${t.ID} (${esc(t.City)}) — Deținut de ${esc(t.OwnerName)} [${esc(t.OwnerTag)}]</title>
            </rect>
            <text class="turf-label" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}">${t.ID}</text>
          </g>`;
      })
      .join("");

    const mafiaCards = mafias
      .map(
        (m) => `
        <div class="ucp-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span class="role-badge" style="background:${esc(m.Color)}1f;color:${esc(m.Color)};border-color:${esc(m.Color)}4d">${esc(m.Tag)}</span>
            <strong class="mono-text" style="color:var(--text-heading)">${m.Turfs} / 48 Turf-uri (${m.TurfSharePct}%)</strong>
          </div>
          <div style="font-weight:600;font-size:14px;color:var(--text-heading);margin-bottom:8px">${esc(m.Name)}</div>
          <div class="progress-track" style="margin-bottom:8px">
            <div class="progress-fill" style="width:${m.TurfSharePct}%;background:${esc(m.Color)}"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary)">
            <span>Victorii: <strong style="color:#34d399">${m.Win}</strong> &middot; Înfrângeri: <strong style="color:#f87171">${m.Lost}</strong></span>
            <span>Mats: ${fmtNum(m.Mats)}</span>
          </div>
        </div>`
      )
      .join("");

    const warRows = (data.wars || [])
      .map(
        (w) => `
        <tr>
          <td class="mono-text">#${w.id || w.ID || "-"}</td>
          <td><span style="color:${esc(w.AttackerColor)};font-weight:600">${esc(w.AttackerName)}</span></td>
          <td><span style="color:${esc(w.DefenderColor)};font-weight:600">${esc(w.DefenderName)}</span></td>
          <td>Turf #${w.Turf || w.turf || "-"}</td>
          <td class="mono-text">${w.AttackerScore || 0} - ${w.DefenderScore || 0}</td>
        </tr>`
      )
      .join("");

    const topFighters = (data.war_top || [])
      .map(
        (wt, i) => `
        <tr>
          <td class="mono-text">#${i + 1}</td>
          <td>${playerBtn(wt.name || `SQL #${wt.PlayerID}`)}</td>
          <td><span class="role-badge" style="background:${esc(wt.FactionColor)}1f;color:${esc(wt.FactionColor)}">${esc(wt.FactionTag)}</span></td>
          <td style="color:#34d399;font-weight:600">${fmtNum(wt.TotalKills)} Kills</td>
          <td style="color:#f87171">${fmtNum(wt.TotalDeaths)} Deaths</td>
          <td>${wt.WarsPlayed} war-uri</td>
        </tr>`
      )
      .join("");

    return `
      <div class="ucp-grid-4 anim-enter" style="margin-bottom:16px">${mafiaCards}</div>

      <div class="ucp-card anim-enter" style="margin-bottom:16px">
        <div class="card-header">
          <div>
            <div class="card-title">Harta Teritoriilor (48 Turf-uri — Los Santos &amp; Las Venturas)</div>
            <div class="card-subtitle">Treci cu cursorul peste un teritoriu pentru a vedea ID-ul și mafia care îl deține</div>
          </div>
        </div>
        <div class="turf-map-container">
          <svg class="turf-svg-stage" viewBox="0 0 1000 480" preserveAspectRatio="xMidYMid meet">
            <text x="24" y="30" fill="#6b7280" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="700">LAS VENTURAS</text>
            <text x="24" y="460" fill="#6b7280" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="700">LOS SANTOS</text>
            ${svgRects}
          </svg>
        </div>
      </div>

      <div class="ucp-grid-2 anim-enter">
        <div class="ucp-card">
          <div class="card-header"><div class="card-title">Top Luptători Mafii (warlogs)</div></div>
          <div class="ucp-table-wrap">
            <table class="ucp-table">
              <thead><tr><th>#</th><th>Jucător</th><th>Mafie</th><th>Kills</th><th>Deaths</th><th>Participări</th></tr></thead>
              <tbody>${topFighters || `<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">Niciun warlog înregistrat.</td></tr>`}</tbody>
            </table>
          </div>
        </div>

        <div class="ucp-card">
          <div class="card-header"><div class="card-title">Istoric Războaie (wars)</div></div>
          <div class="ucp-table-wrap">
            <table class="ucp-table">
              <thead><tr><th>ID</th><th>Atacator</th><th>Apărător</th><th>Turf</th><th>Scor</th></tr></thead>
              <tbody>${warRows || `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Niciun război înregistrat.</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 13. VIEW 8: ECONOMY, HOUSES, BUSINESSES & DEALERSHIP
  // --------------------------------------------------------------------------
  async function loadAndRenderEconomy() {
    const vp = document.getElementById("ucpViewport");
    if (!STATE.cachedEconomy) {
      STATE.cachedEconomy = await api("/api/economy");
    }
    if (vp && STATE.view === "economy") {
      vp.innerHTML = renderEconomyHTML(STATE.cachedEconomy);
    }
  }

  function renderEconomyHTML(eco) {
    const tab = STATE.subTab.economy || "market";
    const isFounder = STATE.user && Number(STATE.user.Admin) >= 6;
    const isAdmin5 = STATE.user && Number(STATE.user.Admin) >= 5;
    const allMarket = eco.market_listings || [];
    const activeMarketCount = allMarket.filter((m) => Number(m.status) === 0).length;
    let content = "";

    if (tab === "market") {
      const mFilter = STATE.subTab.marketFilter || "active";
      const filteredListings = allMarket.filter((m) => {
        if (mFilter === "active") return Number(m.status) === 0;
        if (mFilter === "bids") return Number(m.status) === 0 && Number(m.current_bid || 0) > 0;
        if (mFilter === "mine") return STATE.user && m.seller_name === STATE.user.name;
        if (mFilter === "sold") return Number(m.status) === 1;
        return true;
      });

      const listingCards = filteredListings.length
        ? filteredListings
          .map((m) => {
            const isSeller = STATE.user && m.seller_name === STATE.user.name;
            const isActive = Number(m.status) === 0;
            const hpPct = Math.max(0, Math.min(100, Math.round((Number(m.HP || 1000) / 1000) * 100)));
            const gasPct = Math.max(0, Math.min(100, Number(m.Gas || 100)));
            const nextMinBid =
              Number(m.current_bid || 0) > 0
                ? Number(m.current_bid) + 50000
                : Number(m.min_bid || 50000);

            let statusBadge = "";
            if (Number(m.status) === 0) {
              statusBadge = `<span class="status-pill status-online">Activă &middot; ${m.remaining_hours}h rămase</span>`;
            } else if (Number(m.status) === 1) {
              statusBadge = `<span class="status-pill status-open">Vândut lui ${esc(m.high_bidder_name || "-")}</span>`;
            } else {
              statusBadge = `<span class="status-pill status-offline">Retrasă</span>`;
            }

            return `
                <div class="lms-card">
                  <div class="lms-card-top">
                    <div>
                      <div class="lms-car-title">${esc(m.model_name || m.Description || "Vehicul")}</div>
                      <div style="font-size:11.5px;color:var(--text-secondary)">
                        Vânzător: ${playerBtn(m.seller_name)} &middot; <span class="mono-text">Car #${m.car_id}</span>
                      </div>
                    </div>
                    ${statusBadge}
                  </div>

                  <div class="lms-stage">
                    <img src="${vehicleImgUrl(m.Model)}" alt="${esc(m.model_name)}" />
                    <span class="samp-plate" style="position:absolute;bottom:7px;left:8px">${esc(m.License || "LS-LUPMAX")}</span>
                    ${Number(m.Vip) > 0
                ? `<span class="role-badge" style="position:absolute;top:7px;left:8px;background:rgba(241,196,15,0.2);color:#f1c40f;border-color:#f1c40f66">
                             VIP ${m.Vipname ? "• " + esc(m.Vipname) : ""}
                           </span>`
                : ""
              }
                    <span class="mono-text" style="position:absolute;bottom:7px;right:8px;font-size:10.5px;background:rgba(9,11,15,0.85);padding:2px 6px;border-radius:2px;border:1px solid #232a3b">
                      Culori: ${m.ColorOne}/${m.ColorTwo}
                    </span>
                  </div>

                  <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary)">
                    <span>Rulaj: <strong style="color:var(--text-primary)">${fmtNum(Math.round(Number(m.KM || 0)))} KM</strong></span>
                    <span>Vechime: <strong style="color:var(--text-primary)">${fmtNum(m.days || 0)} Zile</strong></span>
                    <span>Asigurare: <strong style="color:${Number(m.Insurancecar) > 0 ? "#2ecc71" : "#9ca3af"}">${Number(m.Insurancecar) > 0 ? "Activă" : "Standard"}</strong></span>
                  </div>

                  <div style="display:flex;flex-direction:column;gap:5px">
                    <div class="gta-seg-row">
                      <span class="gta-seg-label">Stare Motor</span>
                      ${renderGtaSegBar(hpPct, "seg-green")}
                      <span class="mono-text" style="min-width:36px;text-align:right">${hpPct}%</span>
                    </div>
                    <div class="gta-seg-row">
                      <span class="gta-seg-label">Combustibil</span>
                      ${renderGtaSegBar(gasPct, "seg-gold")}
                      <span class="mono-text" style="min-width:36px;text-align:right">${gasPct}%</span>
                    </div>
                  </div>

                  <div class="lms-price-boxes">
                    <div class="lms-price-box buyout-box">
                      <div class="lms-price-label">Cumpără Instant (Buyout)</div>
                      <div class="lms-price-val" style="color:var(--gta-cash)">${fmtMoney(m.buyout_price)}</div>
                      <div style="font-size:10.5px;color:var(--text-muted)">Transfer instant din Maze Bank</div>
                    </div>
                    <div class="lms-price-box bid-box">
                      <div class="lms-price-label">${Number(m.current_bid || 0) > 0 ? "Ofertă Curentă Licitație" : "Preț Pornire Licitație"}</div>
                      <div class="lms-price-val" style="color:var(--gta-gold)">
                        ${Number(m.current_bid || 0) > 0 ? fmtMoney(m.current_bid) : fmtMoney(m.min_bid)}
                      </div>
                      <div style="font-size:10.5px;color:var(--text-muted)">
                        ${m.high_bidder_name ? `Ofertant: ${esc(m.high_bidder_name)}` : "Nicio ofertă plasată încă"}
                      </div>
                    </div>
                  </div>

                  ${m.seller_note
                ? `<div style="font-size:11.8px;color:var(--text-secondary);background:var(--bg-inset);border:1px solid var(--border-subtle);padding:6px 9px;border-radius:3px">
                           "${esc(m.seller_note)}"
                         </div>`
                : ""
              }

                  ${isActive
                ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:auto;padding-top:4px">
                           ${!isSeller
                  ? `<button type="button" class="btn btn-emerald btn-xs" style="flex:1" data-action="market-buy-car" data-id="${m.id}" data-car="${esc(m.model_name)}" data-price="${m.buyout_price}">
                                    Cumpără (${fmtMoney(m.buyout_price)})
                                  </button>
                                  <button type="button" class="btn btn-amber btn-xs" style="flex:1" data-action="modal-bid-car" data-id="${m.id}" data-car="${esc(m.model_name)}" data-min="${nextMinBid}" data-buyout="${m.buyout_price}">
                                    Licitează
                                  </button>`
                  : ""
                }
                           ${(isSeller || isAdmin5) && Number(m.current_bid || 0) > 0
                  ? `<button type="button" class="btn btn-primary btn-xs" style="flex:1" data-action="market-accept-bid" data-id="${m.id}">
                                    Acceptă Oferta (${fmtMoney(m.current_bid)})
                                  </button>`
                  : ""
                }
                           ${isSeller || isAdmin5
                  ? `<button type="button" class="btn btn-crimson btn-xs" data-action="market-cancel-listing" data-id="${m.id}">
                                    Retrage
                                  </button>`
                  : ""
                }
                         </div>`
                : ""
              }
                </div>`;
          })
          .join("")
        : `<div class="ucp-card" style="text-align:center;color:var(--text-muted);padding:28px">
             Niciun vehicul nu corespunde acestui filtru în Piața Auto Online.
           </div>`;

      content = `
        <div class="lms-hero-banner anim-enter">
          <div>
            <div class="lms-brand-tag">LEGENDARY MOTORSPORT &middot; PIAȚĂ AUTO JUCĂTORI</div>
            <div class="lms-hero-title">Piață Auto Online &amp; Licitații Vehicule Personale</div>
            <div class="lms-hero-sub">
              Cumpără instant (Buyout) sau licitează pentru mașinile scoase la vânzare de jucători. Plățile se procesează securizat prin contul bancar (Maze Bank).
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button type="button" class="btn btn-amber btn-sm" data-action="modal-list-car">
              + Listează Vehicul la Vânzare / Licitație
            </button>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px" class="anim-enter">
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" class="btn ${mFilter === "active" ? "btn-primary" : "btn-outline"} btn-xs" data-action="filter-car-market" data-filter="active">
              Anunțuri Active (${activeMarketCount})
            </button>
            <button type="button" class="btn ${mFilter === "bids" ? "btn-primary" : "btn-outline"} btn-xs" data-action="filter-car-market" data-filter="bids">
              Cu Oferte Licitație
            </button>
            ${STATE.user
          ? `<button type="button" class="btn ${mFilter === "mine" ? "btn-primary" : "btn-outline"} btn-xs" data-action="filter-car-market" data-filter="mine">
                     Vehiculele Mele Listate
                   </button>`
          : ""
        }
            <button type="button" class="btn ${mFilter === "sold" ? "btn-primary" : "btn-outline"} btn-xs" data-action="filter-car-market" data-filter="sold">
              Tranzacții Finalizate
            </button>
          </div>
          <div style="font-size:12px;color:var(--text-secondary)">
            ${STATE.user
          ? `Sold Maze Bank disponibil: <strong class="gta-money-hud">${fmtMoney(STATE.user.Bank)}</strong>`
          : `Autentifică-te pentru a cumpăra, licita sau vinde mașini personale`
        }
          </div>
        </div>

        <div class="lms-market-grid anim-enter">${listingCards}</div>
      `;
    } else if (tab === "dealership") {
      const cards = (eco.dealership || [])
        .map(
          (d) => {
            const speedPct = Math.min(100, Math.round((Number(d.speed || 140) / 220) * 100));
            return `
          <div class="vehicle-card">
            <div class="vehicle-thumb">
              <img src="${vehicleImgUrl(d.vid)}" alt="${esc(d.Car)}" />
              <span class="role-badge" style="position:absolute;top:8px;left:8px;background:rgba(46,134,222,0.2);color:#60a5fa">
                Model ${d.vid}
              </span>
              <span class="status-pill ${d.Stock > 0 ? "status-closed" : "status-rejected"}" style="position:absolute;top:8px;right:8px">
                Stoc: ${d.Stock}
              </span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <strong style="font-family:var(--font-gta);font-size:16.5px;letter-spacing:0.03em;text-transform:uppercase;color:var(--text-heading)">${esc(d.Car)}</strong>
              <strong class="gta-money-hud" style="font-size:16px">${fmtMoney(d.Price)}</strong>
            </div>
            <div class="gta-seg-row">
              <span class="gta-seg-label">Viteză Max</span>
              ${renderGtaSegBar(speedPct)}
              <span class="mono-text">${d.speed} km/h</span>
            </div>
            ${isFounder
                ? `<button type="button" class="btn btn-outline btn-xs" data-action="modal-edit-stock" data-id="${d.ID}" data-car="${esc(d.Car)}" data-price="${d.Price}" data-stock="${d.Stock}">
                     Editează Preț / Stoc
                   </button>`
                : ""
              }
          </div>`;
          }
        )
        .join("");
      content = `<div class="ucp-grid-4 anim-enter">${cards}</div>`;
    } else if (tab === "houses") {
      const hRows = (eco.houses || [])
        .map(
          (h) => `
          <tr>
            <td class="mono-text">#${h.ID}</td>
            <td><strong>${esc(h.Discription)}</strong></td>
            <td>${playerBtn(h.Owner)}</td>
            <td>Level ${h.Level}</td>
            <td style="color:#34d399;font-weight:600">${fmtMoney(h.Value)}</td>
            <td>${h.Rentabil ? fmtMoney(h.Rent) : "Nu"}</td>
            <td>${h.Lockk ? "Încuiată" : "Deschisă"}</td>
          </tr>`
        )
        .join("");
      content = `
        <div class="ucp-card anim-enter">
          <div class="card-header"><div class="card-title">Registrul Caselor (${(eco.houses || []).length} Case)</div></div>
          <div class="ucp-table-wrap">
            <table class="ucp-table">
              <thead><tr><th>ID</th><th>Descriere</th><th>Proprietar</th><th>Nivel</th><th>Valoare</th><th>Chirie</th><th>Status</th></tr></thead>
              <tbody>${hRows}</tbody>
            </table>
          </div>
        </div>
      `;
    } else if (tab === "businesses") {
      const bRows = (eco.businesses || [])
        .map(
          (b) => `
          <tr>
            <td class="mono-text">#${b.ID}</td>
            <td><strong>${esc(b.Message)}</strong></td>
            <td><span class="role-badge" style="background:${esc(b.TypeColor)}1f;color:${esc(b.TypeColor)}">${esc(b.TypeName)}</span></td>
            <td>${playerBtn(b.Owner)}</td>
            <td>Level ${b.LevelNeeded}</td>
            <td style="color:#34d399;font-weight:600">${fmtMoney(b.BuyPrice)}</td>
            <td>${fmtMoney(b.EntranceCost)}</td>
            <td>${fmtMoney(b.Till)}</td>
          </tr>`
        )
        .join("");
      content = `
        <div class="ucp-card anim-enter">
          <div class="card-header"><div class="card-title">Registrul Afacerilor (${(eco.businesses || []).length} Afaceri)</div></div>
          <div class="ucp-table-wrap">
            <table class="ucp-table">
              <thead><tr><th>ID</th><th>Nume Afacere</th><th>Tip</th><th>Proprietar</th><th>Nivel</th><th>Preț</th><th>Intrare</th><th>Seif (Till)</th></tr></thead>
              <tbody>${bRows}</tbody>
            </table>
          </div>
        </div>
      `;
    } else if (tab === "map") {
      const filterMode = STATE.subTab.ecoMapFilter || "all";
      const minX = -3000, maxX = 3000, minY = -3000, maxY = 3000;
      const toSvgX = (x) => Math.max(18, Math.min(982, ((Number(x || 0) - minX) / (maxX - minX)) * 960 + 20));
      const toSvgY = (y) => Math.max(18, Math.min(502, (1 - (Number(y || 0) - minY) / (maxY - minY)) * 480 + 20));

      const isStateOwner = (owner, ownedFlag) => {
        if (!Number(ownedFlag)) return true;
        const low = String(owner || "").trim().toLowerCase();
        return !low || low === "the state" || low === "admbot" || low === "lupmax house" || low === ".empty.";
      };

      const allPins = [];
      (eco.houses || []).forEach((h) => {
        const free = isStateOwner(h.Owner, h.Owned);
        allPins.push({
          kind: "house",
          id: h.ID,
          title: `Casa #${h.ID} — ${h.Discription || "Locuință"}`,
          owner: h.Owner || "The State",
          free,
          level: h.Level,
          price: h.Value,
          extraLabel: "Chirie",
          extraVal: h.Rentabil ? fmtMoney(h.Rent) : "Neînchiriabilă",
          safeVal: fmtMoney(h.Takings || 0),
          locked: Boolean(h.Lockk),
          x: Number(h.Entrancex || 0),
          y: Number(h.Entrancey || 0),
          color: free ? "#10b981" : "#3b82f6",
        });
      });

      (eco.businesses || []).forEach((b) => {
        const free = isStateOwner(b.Owner, b.Owned);
        allPins.push({
          kind: "bizz",
          id: b.ID,
          title: `Business #${b.ID} — ${b.Message || b.TypeName}`,
          subType: b.TypeName,
          owner: b.Owner || "The State",
          free,
          level: b.LevelNeeded,
          price: b.BuyPrice,
          extraLabel: "Taxă Intrare",
          extraVal: fmtMoney(b.EntranceCost || 0),
          safeVal: fmtMoney(b.Till || 0),
          locked: Boolean(b.Locked),
          x: Number(b.EntranceX || 0),
          y: Number(b.EntranceY || 0),
          color: free ? "#f59e0b" : "#a855f7",
        });
      });

      const visiblePins = allPins.filter((p) => {
        if (filterMode === "houses") return p.kind === "house";
        if (filterMode === "businesses") return p.kind === "bizz";
        if (filterMode === "free") return p.free;
        if (filterMode === "owned") return !p.free;
        return true;
      });

      const selKey = STATE.selectedEcoPin || (visiblePins[0] ? `${visiblePins[0].kind}:${visiblePins[0].id}` : "");
      const selPin = visiblePins.find((p) => `${p.kind}:${p.id}` === selKey) || visiblePins[0] || null;

      const svgPins = visiblePins
        .map((p) => {
          const cx = toSvgX(p.x).toFixed(1);
          const cy = toSvgY(p.y).toFixed(1);
          const isSel = selPin && selPin.kind === p.kind && selPin.id === p.id;
          const r = isSel ? 7.5 : p.kind === "bizz" ? 5.6 : 4.6;
          return `
            <g class="eco-map-pin" data-action="select-eco-pin" data-pin="${p.kind}:${p.id}" style="cursor:pointer">
              ${isSel ? `<circle cx="${cx}" cy="${cy}" r="13" fill="${p.color}33" stroke="${p.color}" stroke-width="1.5" />` : ""}
              <circle
                cx="${cx}"
                cy="${cy}"
                r="${r}"
                fill="${p.color}"
                stroke="#0f1117"
                stroke-width="1.4"
              >
                <title>${esc(p.title)} (${p.free ? "De Vânzare / Stat" : "Proprietar: " + esc(p.owner)}) — ${fmtMoney(p.price)}</title>
              </circle>
            </g>`;
        })
        .join("");

      const inspectorHTML = selPin
        ? `
          <div class="kv-list">
            <div class="kv-row">
              <span class="kv-key">Proprietate</span>
              <span class="kv-val"><strong>${esc(selPin.title)}</strong></span>
            </div>
            <div class="kv-row">
              <span class="kv-key">Categorie &amp; Statut</span>
              <span class="kv-val">
                <span class="role-badge" style="background:${selPin.color}22;color:${selPin.color};border-color:${selPin.color}55">
                  ${selPin.kind === "house" ? "Casă" : esc(selPin.subType || "Business")} &middot; ${selPin.free ? "La Stat / Liber" : "Deținut"}
                </span>
              </span>
            </div>
            <div class="kv-row">
              <span class="kv-key">Proprietar Actual</span>
              <span class="kv-val">${playerBtn(selPin.owner)}</span>
            </div>
            <div class="kv-row">
              <span class="kv-key">Nivel Necesar</span>
              <span class="kv-val">Level ${selPin.level}</span>
            </div>
            <div class="kv-row">
              <span class="kv-key">Preț / Valoare</span>
              <span class="kv-val" style="color:#34d399;font-weight:600">${fmtMoney(selPin.price)}</span>
            </div>
            <div class="kv-row">
              <span class="kv-key">${esc(selPin.extraLabel)}</span>
              <span class="kv-val">${selPin.extraVal}</span>
            </div>
            <div class="kv-row">
              <span class="kv-key">Bani în Seif</span>
              <span class="kv-val">${selPin.safeVal}</span>
            </div>
            <div class="kv-row">
              <span class="kv-key">Acces &amp; Coordonate GPS</span>
              <span class="kv-val mono-text">${selPin.locked ? "Încuiat" : "Deschis"} &middot; X:${selPin.x.toFixed(1)}, Y:${selPin.y.toFixed(1)}</span>
            </div>
          </div>`
        : `<div style="color:var(--text-muted);padding:16px">Nicio proprietate pe acest filtru.</div>`;

      content = `
        <div class="ucp-card anim-enter" style="margin-bottom:16px">
          <div class="card-header" style="flex-wrap:wrap">
            <div>
              <div class="card-title">Hartă Interactivă San Andreas — Case &amp; Afaceri (${visiblePins.length} puncte afișate)</div>
              <div class="card-subtitle">Apasă pe orice punct de pe hartă pentru a inspecta proprietarul, valoarea și coordonatele exacte</div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button type="button" class="btn ${filterMode === "all" ? "btn-primary" : "btn-outline"} btn-xs" data-action="filter-eco-map" data-filter="all">Toate (${allPins.length})</button>
              <button type="button" class="btn ${filterMode === "houses" ? "btn-primary" : "btn-outline"} btn-xs" data-action="filter-eco-map" data-filter="houses">Case (${(eco.houses || []).length})</button>
              <button type="button" class="btn ${filterMode === "businesses" ? "btn-primary" : "btn-outline"} btn-xs" data-action="filter-eco-map" data-filter="businesses">Afaceri (${(eco.businesses || []).length})</button>
              <button type="button" class="btn ${filterMode === "free" ? "btn-primary" : "btn-outline"} btn-xs" data-action="filter-eco-map" data-filter="free">La Stat / De Vânzare</button>
              <button type="button" class="btn ${filterMode === "owned" ? "btn-primary" : "btn-outline"} btn-xs" data-action="filter-eco-map" data-filter="owned">Deținute de Jucători</button>
            </div>
          </div>

          <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:10px;font-size:12px;color:var(--text-secondary)">
            <span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#10b981;margin-right:5px"></span>Casă la Stat (De Vânzare)</span>
            <span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#3b82f6;margin-right:5px"></span>Casă Deținută</span>
            <span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#f59e0b;margin-right:5px"></span>Business la Stat (De Vânzare)</span>
            <span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#a855f7;margin-right:5px"></span>Business Deținut</span>
          </div>

          <div class="ucp-grid-2" style="grid-template-columns: 1.65fr 1fr;align-items:start">
            <div class="turf-map-container" style="height:460px">
              <svg class="turf-svg-stage" viewBox="0 0 1000 520" preserveAspectRatio="xMidYMid meet">
                <rect x="10" y="10" width="980" height="500" rx="8" fill="#0d131d" stroke="#1f293b" stroke-width="1" />
                <line x1="500" y1="10" x2="500" y2="510" stroke="#1e293b" stroke-dasharray="4 4" />
                <line x1="10" y1="260" x2="990" y2="260" stroke="#1e293b" stroke-dasharray="4 4" />
                <text x="690" y="95" fill="#475569" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="700">LAS VENTURAS</text>
                <text x="115" y="230" fill="#475569" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="700">SAN FIERRO</text>
                <text x="675" y="425" fill="#475569" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="700">LOS SANTOS</text>
                <text x="515" y="285" fill="#334155" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="600">RED COUNTY</text>
                <text x="430" y="110" fill="#334155" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="600">BONE COUNTY</text>
                ${svgPins}
              </svg>
            </div>
            <div class="ucp-card" style="background:var(--bg-inset)">
              <div class="card-header">
                <div>
                  <div class="card-title">Inspector Proprietate Selectată</div>
                  <div class="card-subtitle">Detalii live din baza de date</div>
                </div>
              </div>
              ${inspectorHTML}
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="ucp-tabs anim-enter">
        <button type="button" class="ucp-tab-btn ${tab === "market" ? "active" : ""}" data-subtab="economy:market">Piață Auto Online (${activeMarketCount})</button>
        <button type="button" class="ucp-tab-btn ${tab === "dealership" ? "active" : ""}" data-subtab="economy:dealership">Catalog Dealership (${(eco.dealership || []).length})</button>
        <button type="button" class="ucp-tab-btn ${tab === "houses" ? "active" : ""}" data-subtab="economy:houses">Case (${(eco.houses || []).length})</button>
        <button type="button" class="ucp-tab-btn ${tab === "businesses" ? "active" : ""}" data-subtab="economy:businesses">Afaceri (${(eco.businesses || []).length})</button>
        <button type="button" class="ucp-tab-btn ${tab === "map" ? "active" : ""}" data-subtab="economy:map">Hartă Interactivă Case &amp; Bizz</button>
      </div>
      ${content}
    `;
  }

  // --------------------------------------------------------------------------
  // 14. VIEW 9: SHOP, VIP PACKAGES & DONATIONS
  // --------------------------------------------------------------------------
  async function loadAndRenderShop() {
    const vp = document.getElementById("ucpViewport");
    const data = await api("/api/shop");
    STATE.cachedShop = data;
    if (vp && STATE.view === "shop") {
      vp.innerHTML = renderShopHTML(data);
    }
  }

  function renderShopHTML(data) {
    const isFounder = STATE.user && Number(STATE.user.Admin) >= 6;
    const vipCards = (data.vip_packages || [])
      .map(
        (v) => `
        <div class="kpi-card">
          <div>
            <div class="kpi-label">${esc(v.tag)}</div>
            <div class="kpi-value">${esc(v.name)}</div>
            <div class="kpi-sub">Preț în /shop: <strong style="color:var(--brand-primary)">${v.pp} PP</strong></div>
          </div>
        </div>`
      )
      .join("");

    const shopRows = (data.shop_items || [])
      .map(
        (it) => `
        <tr>
          <td><strong>${esc(it.name)}</strong></td>
          <td><span class="role-badge" style="background:rgba(59,130,246,0.16);color:#60a5fa">${it.pp} PP</span></td>
          <td style="color:var(--text-secondary)">${esc(it.desc)}</td>
        </tr>`
      )
      .join("");

    const donRows = (data.donations || [])
      .map(
        (d) => `
        <tr>
          <td class="mono-text">#${d.donateID}</td>
          <td>${playerBtn(d.donateName)}</td>
          <td><strong style="color:#34d399">${esc(d.donateSUM)} EUR</strong></td>
          <td class="mono-text">${esc(d.donatePIN)}</td>
          <td>
            <span class="status-pill ${d.donateStatus === 1 ? "status-closed" : d.donateStatus === 2 ? "status-rejected" : "status-open"}">
              ${d.donateStatus === 1 ? "Aprobată" : d.donateStatus === 2 ? "Respinsă" : "În Așteptare"}
            </span>
          </td>
          <td>${esc(d.donateAdminAction)}</td>
          ${isFounder && d.donateStatus === 0
            ? `<td>
                   <button type="button" class="btn btn-emerald btn-xs" data-action="review-donation" data-id="${d.donateID}" data-status="1" data-sum="${esc(d.donateSUM)}">Aprobă</button>
                   <button type="button" class="btn btn-crimson btn-xs" data-action="review-donation" data-id="${d.donateID}" data-status="2" data-sum="0">Respinge</button>
                 </td>`
            : isFounder
              ? "<td>-</td>"
              : ""
          }
        </tr>`
      )
      .join("");

    return `
      <div class="ucp-grid-4 anim-enter" style="margin-bottom:16px">${vipCards}</div>

      <div class="ucp-grid-2 anim-enter">
        <div class="ucp-card">
          <div class="card-header"><div class="card-title">Catalog /shop &amp; Beneficii VIP</div></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
            ${(data.vip_benefits || []).map((b) => `<span class="status-pill status-online">${esc(b)}</span>`).join("")}
          </div>
          <div class="ucp-table-wrap">
            <table class="ucp-table">
              <thead><tr><th>Articol</th><th>Cost PP</th><th>Descriere</th></tr></thead>
              <tbody>${shopRows}</tbody>
            </table>
          </div>
        </div>

        <div class="ucp-card">
          <div class="card-header">
            <div>
              <div class="card-title">Donații &amp; Puncte Premium</div>
              <div class="card-subtitle">La aprobare, Punctele Premium sunt livrate automat în cont</div>
            </div>
            <button type="button" class="btn btn-primary btn-xs" data-action="modal-donation">Adaugă Donație</button>
          </div>
          <div class="ucp-table-wrap">
            <table class="ucp-table">
              <thead>
                <tr><th>ID</th><th>Jucător</th><th>Sumă</th><th>Cod PIN</th><th>Status</th><th>Notă</th>${isFounder ? "<th>Acțiune</th>" : ""}</tr>
              </thead>
              <tbody>${donRows || `<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">Autentifică-te pentru a vedea sau trimite o donație.</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 15. VIEW 10: COMPLAINTS (RECLAMAȚII)
  // --------------------------------------------------------------------------
  async function loadAndRenderComplaints() {
    const vp = document.getElementById("ucpViewport");
    const data = await api("/api/complaints");
    STATE.cachedComplaints = data;
    if (vp && STATE.view === "complaints") {
      vp.innerHTML = renderComplaintsHTML(data);
    }
  }

  function renderComplaintsHTML(data) {
    const rows = (data.complaints || [])
      .map(
        (c) => `
        <tr>
          <td class="mono-text">#${c.id}</td>
          <td>${playerBtn(c.playername)} <span class="role-badge" style="font-size:10px">${esc(c.FactionTag)}</span></td>
          <td>${playerBtn(c.createdby)}</td>
          <td><span class="role-badge" style="background:rgba(239,68,68,0.14);color:#f87171">${esc(c.CategoryName)}</span></td>
          <td><span class="status-pill ${Number(c.status) === 0 ? "status-open" : "status-closed"}">${Number(c.status) === 0 ? "Deschisă" : "Închisă"}</span></td>
          <td class="mono-text" style="color:var(--text-muted)">${esc(c.time)}</td>
          <td>
            <button type="button" class="btn btn-outline btn-xs" data-action="open-complaint-thread" data-id="${c.id}">
              Vizualizează
            </button>
          </td>
        </tr>`
      )
      .join("");

    return `
      <div class="ucp-card anim-enter">
        <div class="card-header">
          <div>
            <div class="card-title">Reclamații Jucători &amp; Staff (${(data.complaints || []).length})</div>
            <div class="card-subtitle">Reclamațiile deschise pot fi soluționate cu sancțiune directă în joc</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button type="button" class="btn btn-outline btn-sm" data-action="refresh-live-view">Actualizează Live</button>
            <button type="button" class="btn btn-primary btn-sm" data-action="modal-complaint">Reclamație Nouă</button>
          </div>
        </div>
        <div class="ucp-table-wrap">
          <table class="ucp-table">
            <thead>
              <tr><th>ID</th><th>Reclamat</th><th>Reclamant</th><th>Motiv</th><th>Status</th><th>Data</th><th>Detalii</th></tr>
            </thead>
            <tbody>${rows || `<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">Nicio reclamație înregistrată.</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 16. VIEW 11: SUPPORT TICKETS (TICHETE)
  // --------------------------------------------------------------------------
  async function loadAndRenderTickets() {
    const vp = document.getElementById("ucpViewport");
    if (!STATE.user) {
      vp.innerHTML = `
        <div class="ucp-card anim-enter">
          <div class="card-title">Autentificare Necesară</div>
          <p style="color:var(--text-secondary);margin:6px 0 12px">Autentifică-te pentru a vedea sau deschide un tichet de suport.</p>
          <button type="button" class="btn btn-primary btn-sm" data-action="open-login">Autentificare</button>
        </div>`;
      return;
    }
    const data = await api("/api/tickets");
    STATE.cachedTickets = data;
    if (vp && STATE.view === "tickets") {
      vp.innerHTML = renderTicketsHTML(data);
    }
  }

  function renderTicketsHTML(data) {
    const rows = (data.tickets || [])
      .map(
        (t) => `
        <tr>
          <td class="mono-text">#${t.id}</td>
          <td>${playerBtn(t.Name)}</td>
          <td><span class="role-badge" style="background:rgba(245,158,11,0.16);color:#fbbf24">${esc(t.CategoryName)}</span></td>
          <td style="max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.Ticket)}</td>
          <td><span class="status-pill ${Number(t.Status) === 0 ? "status-open" : "status-closed"}">${Number(t.Status) === 0 ? "Deschis" : "Închis"}</span></td>
          <td class="mono-text" style="color:var(--text-muted)">${esc(t.time)}</td>
          <td>
            <button type="button" class="btn btn-outline btn-xs" data-action="open-ticket-thread" data-id="${t.id}">
              Deschide
            </button>
          </td>
        </tr>`
      )
      .join("");

    return `
      <div class="ucp-card anim-enter">
        <div class="card-header">
          <div>
            <div class="card-title">Tichete Suport (${(data.tickets || []).length})</div>
            <div class="card-subtitle">Asistență tehnică și întrebări adresate echipei Staff</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button type="button" class="btn btn-outline btn-sm" data-action="refresh-live-view">Actualizează Live</button>
            <button type="button" class="btn btn-primary btn-sm" data-action="modal-ticket">Tichet Nou</button>
          </div>
        </div>
        <div class="ucp-table-wrap">
          <table class="ucp-table">
            <thead><tr><th>ID</th><th>Autor</th><th>Categorie</th><th>Subiect</th><th>Status</th><th>Data</th><th>Acțiune</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">Nu există tichete de suport.</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 17. VIEW 12: BANLIST & CERERI UNBAN
  // --------------------------------------------------------------------------
  async function loadAndRenderBans() {
    const vp = document.getElementById("ucpViewport");
    const data = await api("/api/bans");
    STATE.cachedBans = data;
    if (vp && STATE.view === "bans") {
      vp.innerHTML = renderBansHTML(data);
    }
  }

  function renderBansHTML(data) {
    const isAdmin3 = STATE.user && Number(STATE.user.Admin) >= 3;
    const banRows = (data.bans || [])
      .map(
        (b) => `
        <tr>
          <td class="mono-text">#${b.ID}</td>
          <td>${playerBtn(b.PlayerName)}</td>
          <td>${playerBtn(b.AdminName)}</td>
          <td>${esc(b.Reason)}</td>
          <td>
            <span class="status-pill status-rejected">
              ${Number(b.Permanent) === 1 ? "Permanent" : `${b.Days} Zile (${b.ExpiresInDays}z rămase)`}
            </span>
          </td>
          <td class="mono-text" style="color:var(--text-muted)">${esc(b.BanTimeDate)}</td>
          ${isAdmin3
            ? `<td><button type="button" class="btn btn-emerald btn-xs" data-action="quick-unban" data-player="${esc(b.PlayerName)}">Unban</button></td>`
            : ""
          }
        </tr>`
      )
      .join("");

    const unbanRows = (data.unban_requests || [])
      .map(
        (u) => `
        <tr>
          <td class="mono-text">#${u.id}</td>
          <td>${playerBtn(u.user)}</td>
          <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(u.text)}</td>
          <td>
            <span class="status-pill ${Number(u.status) === 0 ? "status-open" : Number(u.status) === 1 ? "status-closed" : "status-rejected"}">
              ${Number(u.status) === 0 ? "În Așteptare" : Number(u.status) === 1 ? "Acceptată" : "Respinsă"}
            </span>
          </td>
          <td class="mono-text" style="color:var(--text-muted)">${esc(u.data)}</td>
          <td>
            <button type="button" class="btn btn-outline btn-xs" data-action="open-unban-thread" data-id="${u.id}">
              Detalii
            </button>
          </td>
        </tr>`
      )
      .join("");

    return `
      <div class="ucp-grid-2 anim-enter">
        <div class="ucp-card">
          <div class="card-header">
            <div>
              <div class="card-title">Lista Banurilor Active (${(data.bans || []).length})</div>
              <div class="card-subtitle">Conturi suspendate temporar sau permanent</div>
            </div>
          </div>
          <div class="ucp-table-wrap">
            <table class="ucp-table">
              <thead><tr><th>ID</th><th>Jucător</th><th>Admin</th><th>Motiv</th><th>Durată</th><th>Data</th>${isAdmin3 ? "<th>Acțiune</th>" : ""}</tr></thead>
              <tbody>${banRows || `<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">Niciun ban activ.</td></tr>`}</tbody>
            </table>
          </div>
        </div>

        <div class="ucp-card">
          <div class="card-header">
            <div>
              <div class="card-title">Cereri de Unban (${(data.unban_requests || []).length})</div>
              <div class="card-subtitle">Aprobarea cererii debanează automat contul jucătorului</div>
            </div>
            <button type="button" class="btn btn-primary btn-xs" data-action="modal-unban">Cerere Unban</button>
          </div>
          <div class="ucp-table-wrap">
            <table class="ucp-table">
              <thead><tr><th>ID</th><th>Jucător</th><th>Motiv &amp; Dovezi</th><th>Status</th><th>Data</th><th>Detalii</th></tr></thead>
              <tbody>${unbanRows || `<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">Nicio cerere de unban.</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 18. VIEW 13: ACCOUNT SECURITY CENTER & IN-GAME /EMAILS
  // --------------------------------------------------------------------------
  async function loadAndRenderSecurity() {
    const vp = document.getElementById("ucpViewport");
    if (!STATE.user) {
      vp.innerHTML = `
        <div class="ucp-card anim-enter">
          <div class="card-title">Setări Cont &amp; Căsuța /Email</div>
          <p style="color:var(--text-secondary);margin:6px 0 12px">Autentifică-te pentru a-ți schimba parola, PIN-ul de securitate, sesiunile active și mesajele /email.</p>
          <button type="button" class="btn btn-primary btn-sm" data-action="open-login">Autentificare</button>
        </div>`;
      return;
    }
    const data = await api("/api/account/security");
    STATE.cachedSecurity = data;
    if (vp && STATE.view === "security") {
      vp.innerHTML = renderSecurityHTML(data);
    }
  }

  function renderSecurityHTML(sec) {
    const sessRows = (sec.sessions || [])
      .map(
        (s) => `
        <tr>
          <td><span class="status-pill ${s.current ? "status-online" : "status-open"}">${s.current ? "Sesiunea Curentă" : "Alt Dispozitiv"}</span></td>
          <td class="mono-text">${esc(s.ip)}</td>
          <td class="mono-text" style="color:var(--brand-primary)">${esc(s.fingerprint)}</td>
          <td style="font-size:11.5px;color:var(--text-secondary)">${esc(s.ua)}</td>
          <td class="mono-text" style="color:var(--text-muted)">${esc(s.last_seen)}</td>
        </tr>`
      )
      .join("");

    const emailRows = (sec.emails || [])
      .map(
        (em) => `
        <div class="kv-row" style="padding-left:10px;border-left:2px solid ${Number(em.EmailRead) === 1 ? "var(--color-amber)" : "var(--color-green)"}">
          <div>
            <div style="font-size:13px;color:var(--text-heading)">${esc(em.Message)}</div>
            <div class="mono-text" style="font-size:11px;color:var(--text-muted)">${esc(em.Time)}</div>
          </div>
          <span class="status-pill ${Number(em.EmailRead) === 1 ? "status-open" : "status-closed"}">
            ${Number(em.EmailRead) === 1 ? "Necitit" : "Citit"}
          </span>
        </div>`
      )
      .join("");

    return `
      <div class="ucp-grid-2 anim-enter" style="margin-bottom:16px">
        <!-- In-game /email inbox -->
        <div class="ucp-card">
          <div class="card-header">
            <div>
              <div class="card-title">Notificări /email (${(sec.emails || []).length})</div>
              <div class="card-subtitle">Mesajele primite în UCP și în joc prin comanda /email</div>
            </div>
            <button type="button" class="btn btn-outline btn-xs" data-action="mark-emails-read">Marchează Citite</button>
          </div>
          <div class="kv-list" style="max-height:360px;overflow-y:auto">${emailRows || `<div style="color:var(--text-muted)">Niciun email primit.</div>`}</div>
        </div>

        <!-- Active Anti-Hijack Sessions -->
        <div class="ucp-card">
          <div class="card-header">
            <div>
              <div class="card-title">Sesiuni Active &amp; Device Binding</div>
              <div class="card-subtitle">Sesiunile sunt legate criptografic de IP și amprenta browserului</div>
            </div>
            <button type="button" class="btn btn-crimson btn-xs" data-action="revoke-other-sessions">Închide Alte Sesiuni</button>
          </div>
          <div class="ucp-table-wrap">
            <table class="ucp-table">
              <thead><tr><th>Stare</th><th>IP</th><th>Amprentă</th><th>Browser</th><th>Activitate</th></tr></thead>
              <tbody>${sessRows}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="ucp-grid-2 anim-enter">
        <!-- Change Password -->
        <div class="ucp-card">
          <div class="card-header"><div class="card-title">Schimbare Parolă Cont (bcrypt)</div></div>
          <form id="changePasswordForm">
            <div class="form-group">
              <label class="form-label">Parola Actuală</label>
              <input type="password" class="form-control" name="current_password" required />
            </div>
            <div class="form-group">
              <label class="form-label">Noua Parolă (5 - 20 caractere)</label>
              <input type="password" class="form-control" name="new_password" minlength="5" maxlength="20" required />
            </div>
            <button type="submit" class="btn btn-primary btn-sm">Salvează Parola</button>
          </form>
        </div>

        <!-- Change Security PIN & Email -->
        <div class="ucp-card">
          <div class="card-header"><div class="card-title">Actualizare PIN &amp; Email</div></div>
          <form id="changePinForm">
            <div class="form-group">
              <label class="form-label">Adresă Email</label>
              <input type="email" class="form-control" name="email" value="${esc(sec.email || "")}" required />
            </div>
            <div class="form-group">
              <label class="form-label">Cod PIN din Joc (4 - 8 cifre)</label>
              <input type="text" class="form-control" name="pin" pattern="[0-9]{4,8}" placeholder="Ex: 1234" required />
            </div>
            <div class="form-group">
              <label class="form-label">Confirmare Parolă Cont</label>
              <input type="password" class="form-control" name="password" required />
            </div>
            <button type="submit" class="btn btn-primary btn-sm">Salvează PIN &amp; Email</button>
          </form>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 18B. VIEW 13B: SERVER UPDATES & CHANGELOG (B-HOOD LIQUID GLASS FORMAT)
  // --------------------------------------------------------------------------
  function formatUpdateInline(escapedLine) {
    return escapedLine.replace(
      /(^|[\s(])(\/[a-zA-Z][a-zA-Z0-9_-]{1,24})(?=$|[\s).,!?:;])|([+-]?\$[0-9][0-9.,]*[kKmMbB]?|[+-]?[0-9]+(?:[.,][0-9]+)?%|\b[0-9]+\s+PP\b)/g,
      (m, pfx, cmd, hi) => {
        if (cmd) return `${pfx}<code class="up-cmd">${cmd}</code>`;
        if (hi) return `<strong class="up-hi">${hi}</strong>`;
        return m;
      }
    );
  }

  function formatUpdateBodyHTML(rawText) {
    const lines = String(rawText || "").replace(/\r\n/g, "\n").split("\n");
    const out = [];
    for (const rawLine of lines) {
      const t = rawLine.trim();
      if (!t) {
        if (out.length && out[out.length - 1] !== `<div style="height:4px"></div>`) {
          out.push(`<div style="height:4px"></div>`);
        }
        continue;
      }
      if (/^#{1,3}\s+/.test(t)) {
        const cleanHead = t.replace(/^#{1,3}\s+/, "");
        out.push(`<div class="up-line-head">${formatUpdateInline(esc(cleanHead))}</div>`);
      } else if (/^[-*\u2022]\s+/.test(t)) {
        const cleanBullet = t.replace(/^[-*\u2022]\s+/, "");
        out.push(`<div class="up-bullet">${formatUpdateInline(esc(cleanBullet))}</div>`);
      } else if (t.endsWith(":") && t.length <= 58 && !t.includes("http")) {
        out.push(`<div class="up-line-head">${formatUpdateInline(esc(t))}</div>`);
      } else {
        out.push(`<div class="up-line-text">${formatUpdateInline(esc(t))}</div>`);
      }
    }
    return out.join("");
  }

  function renderUpdatesView() {
    const b = STATE.bootstrap || {};
    const allUpdates = Array.isArray(b.updates) ? b.updates : [];
    const filter = STATE.subTab.updates || "all";
    const isFounder = STATE.user && Number(STATE.user.Admin) >= 6;

    const catMeta = (forVal) => {
      const code = Number(forVal || 0);
      if (code === 1) return { label: "Panel UCP", cls: "up-cat-panel", pillCls: "cat-panel" };
      if (code === 2) return { label: "Securitate", cls: "up-cat-sec", pillCls: "cat-sec" };
      return { label: "Server SA-MP", cls: "", pillCls: "cat-server" };
    };

    const filtered = allUpdates.filter((u) => {
      if (filter === "all") return true;
      return String(Number(u.For || 0)) === String(filter);
    });

    const starSVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.4l2.92 6.08 6.68.93-4.86 4.68 1.18 6.63L12 17.56l-5.92 3.16 1.18-6.63L2.4 9.41l6.68-.93L12 2.4z"/></svg>`;

    const listHTML = filtered.length
      ? filtered
        .map((up) => {
          const meta = catMeta(up.For);
          const dateLabel = up.date || up.time || "-";
          const ratingEnabled = up.rating_enabled !== false && Number(up.rating_enabled ?? 1) !== 0;
          const rAvg = Number(up.rating_avg || 0);
          const rCount = Number(up.rating_count || 0);
          const uRating = Number(up.user_rating || 0);
          const avgRound = Math.round(rAvg);

          const headRatingHTML =
            ratingEnabled && rCount > 0
              ? `<span class="update-rating-score" style="font-size:13px;padding:2px 9px">&#9733; ${rAvg.toFixed(1)}</span>`
              : "";

          let ratingHTML = "";
          if (ratingEnabled) {
            const starsHTML = [5, 4, 3, 2, 1]
              .map((s) => {
                const activeCls = uRating > 0 ? (s <= uRating ? "star-user" : "") : avgRound > 0 && s <= avgRound ? "star-avg" : "";
                const tip = !STATE.user
                  ? `Autentifică-te pentru a acorda ${s} ${s === 1 ? "stea" : "stele"}`
                  : uRating === s
                    ? `Click din nou pentru a retrage votul (${s}★)`
                    : `Acordă ${s} ${s === 1 ? "stea" : "stele"}`;
                return `<button type="button" class="update-star-btn ${activeCls}" data-action="rate-update" data-id="${up.id}" data-stars="${s}" data-user-rating="${uRating}" title="${esc(tip)}" aria-label="${esc(tip)}">${starSVG}</button>`;
              })
              .join("");

            const summaryHTML =
              rCount > 0
                ? `<span class="update-rating-score">${rAvg.toFixed(1)} &#9733;</span><span>${fmtNum(rCount)} ${rCount === 1 ? "evaluare" : "evaluări"}</span>`
                : `<span style="color:var(--text-muted)">Fără evaluări încă &middot; Opțional, votează cu stele</span>`;

            const mineHTML =
              uRating > 0
                ? `<span class="update-rating-mine">Nota ta: ${uRating}&#9733;</span>`
                : !STATE.user
                  ? `<span style="color:var(--text-muted);font-size:11.5px">(Autentifică-te pentru vot)</span>`
                  : "";

            ratingHTML = `
                <div class="update-rating-bar">
                  <div class="update-rating-meta">
                    ${summaryHTML}
                    ${mineHTML}
                  </div>
                  <div class="update-star-picker" role="group" aria-label="Evaluare update #${up.id}">
                    ${starsHTML}
                  </div>
                </div>
              `;
          }

          return `
              <article class="update-card ${meta.cls}">
                <div class="update-card-head">
                  <div class="update-card-meta">
                    <span class="update-id-tag">#${up.id}</span>
                    <span class="up-type-pill ${meta.pillCls}">
                      <span class="up-type-dot"></span>
                      ${esc(meta.label)}
                    </span>
                    <span style="font-size:12.5px;color:var(--text-secondary)">
                      Publicat de ${playerBtn(up.byAdmin || "Admin")}
                    </span>
                  </div>
                  <div class="update-card-head-right">
                    ${headRatingHTML}
                    <span class="mono-text" style="font-size:12px;color:var(--text-muted)">${esc(dateLabel)}</span>
                  </div>
                </div>
                <div class="update-body">${formatUpdateBodyHTML(up.text)}</div>
                ${ratingHTML}
              </article>
            `;
        })
        .join("")
      : `
        <div class="ucp-card" style="text-align:center;padding:34px 20px;color:var(--text-muted)">
          Nu există update-uri publicate în această categorie momentan.
        </div>
      `;

    const postBoxHTML = isFounder
      ? `
        <div class="ucp-card anim-enter" style="margin-bottom:16px">
          <div class="card-header">
            <div>
              <div class="card-title">Publică Update Nou (Founder)</div>
              <div class="card-subtitle">Anunțul apare instant în lista de Updates din panou</div>
            </div>
          </div>
          <form id="updatesPagePostForm">
            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Categorie Update</label>
                <select class="form-control" name="for_type">
                  <option value="0">Server SA-MP (Gamemode / Sisteme)</option>
                  <option value="1">Panel UCP (Website / Funcții)</option>
                  <option value="2">Securitate &amp; Anti-Cheat</option>
                </select>
              </div>
              <div class="form-group" style="display:flex;align-items:flex-end;justify-content:flex-end">
                <span style="font-size:12px;color:var(--text-muted)">Publicat ca: <strong>${esc(STATE.user.name)}</strong></span>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Descrierea Update-ului</label>
              <textarea class="form-control" name="text" style="min-height:76px" placeholder="Scrie noutățile și modificările..." minlength="5" maxlength="1500" required></textarea>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
              <label class="ucp-check-row" style="margin:0">
                <input type="checkbox" name="allow_rating" checked />
                <span>Permite rating cu stele (1–5&#9733;, opțional)</span>
              </label>
              <button type="submit" class="btn btn-accent btn-sm">Publică în Changelog <span class="btn-arrow">&rarr;</span></button>
            </div>
          </form>
        </div>
      `
      : "";

    return `
      <div class="ucp-card anim-enter" style="margin-bottom:16px">
        <div class="card-header" style="margin-bottom:10px">
          <div>
            <div class="card-title">Server Updates &amp; Changelog (${fmtNum(allUpdates.length)})</div>
            <div class="card-subtitle">Ultimele actualizări ale serverului LupMax RPG, Panel UCP și securitate</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="btn btn-outline btn-xs" data-action="refresh-updates">Actualizează Lista</button>
          </div>
        </div>
        <div class="ucp-tabs" style="margin-bottom:0">
          <button type="button" class="ucp-tab-btn ${filter === "all" ? "active" : ""}" data-action="filter-updates" data-filter="all">Toate (${allUpdates.length})</button>
          <button type="button" class="ucp-tab-btn ${filter === "0" ? "active" : ""}" data-action="filter-updates" data-filter="0">Server SA-MP</button>
          <button type="button" class="ucp-tab-btn ${filter === "1" ? "active" : ""}" data-action="filter-updates" data-filter="1">Panel UCP</button>
          <button type="button" class="ucp-tab-btn ${filter === "2" ? "active" : ""}" data-action="filter-updates" data-filter="2">Securitate</button>
        </div>
      </div>
      ${postBoxHTML}
      <div class="updates-timeline anim-enter">${listHTML}</div>
    `;
  }

  // --------------------------------------------------------------------------
  // 19. VIEW 14: ADMIN, FOUNDER & LIVE SERVER QUEUE PANEL
  // --------------------------------------------------------------------------
  async function loadAndRenderAdmin(logType = "panellogs", q = "") {
    const vp = document.getElementById("ucpViewport");
    const qs = new URLSearchParams({ log_type: logType, q }).toString();
    const data = await api(`/api/admin/dashboard?${qs}`);
    STATE.cachedAdmin = data;
    if (vp && STATE.view === "admin") {
      vp.innerHTML = renderAdminHTML(data, q);
    }
  }

  function renderAdminHTML(data, q = "") {
    const isAdmin3 = STATE.user && Number(STATE.user.Admin) >= 3;
    const isAdmin4OrMgr =
      STATE.user &&
      (Number(STATE.user.Admin) >= 4 || Number(STATE.user.ManagerLideri) >= 1 || Number(STATE.user.ManagerLideriSupport) >= 1);
    const isAdmin5 = STATE.user && Number(STATE.user.Admin) >= 5;
    const isFounder = STATE.user && Number(STATE.user.Admin) >= 6;
    const logTypes = [
      "panellogs",
      "staff_logs",
      "log_admin",
      "punishlogs",
      "kicklogs",
      "kill_logs",
      "chat_logs",
      "playerlogs",
      "iplogs",
      "helperlogs",
      "shop_logs",
      "giftbox_logs",
      "su_logs",
    ];

    const factionsOptions = ((STATE.bootstrap && STATE.bootstrap.factions) || [])
      .map((f) => `<option value="${f.ID}">#${f.ID} — ${esc(f.Name)}</option>`)
      .join("");

    const managerOptions = ((STATE.bootstrap && STATE.bootstrap.constants && STATE.bootstrap.constants.manager_roles) || [])
      .map((m) => `<option value="${esc(m.col)}">${esc(m.label)} (${esc(m.col)})</option>`)
      .join("");

    return `
      <div class="ucp-grid-2 anim-enter" style="margin-bottom:16px">
        <!-- Live In-Game Action Executor (panelactions 1..10) -->
        <div class="ucp-card">
          <div class="card-header">
            <div>
              <div class="card-title">Sancțiuni &amp; Comenzi Live (panelactions)</div>
              <div class="card-subtitle">Se aplică în baza de date și se execută în joc prin FiveSecondsTimer</div>
            </div>
          </div>
          <form id="adminSanctionForm">
            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Nume Jucător</label>
                <input type="text" class="form-control" name="player" placeholder="Nickname..." required />
              </div>
              <div class="form-group">
                <label class="form-label">Acțiune (1..10)</label>
                <select class="form-control" name="action">
                  <option value="1">[1] Ban Temporar (1-365 Zile)</option>
                  <option value="2">[2] Ban Permanent</option>
                  <option value="3">[3] Admin Jail (1-1440 Minute)</option>
                  <option value="4">[4] Warn (+1 Avertisment)</option>
                  <option value="5">[5] Mute (1-1440 Minute)</option>
                  <option value="10">[10] Kick Live din Joc</option>
                  <option value="6">[6] Acordă Bani ($)</option>
                  <option value="7">[7] Acordă Puncte Premium (PP)</option>
                  <option value="8">[8] Setează Admin Level (0-6)</option>
                  <option value="9">[9] Setează Helper Level (0-3)</option>
                </select>
              </div>
            </div>
            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Durată / Valoare / Nivel</label>
                <input type="number" class="form-control" name="duration" value="0" min="0" />
              </div>
              <div class="form-group">
                <label class="form-label">Suspendare Licență Arme la Jail (Ore)</label>
                <input type="number" class="form-control" name="dm" value="0" min="0" max="100" />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Motiv</label>
              <input type="text" class="form-control" name="reason" placeholder="Motivul acțiunii..." required />
            </div>
            <button type="submit" class="btn btn-crimson btn-sm">Execută Acțiunea</button>
          </form>
        </div>

        <!-- Role, Leader, Unban, VIP & Server Management -->
        <div class="ucp-card">
          <div class="card-header"><div class="card-title">Management Lideri, Unban, VIP &amp; Updates</div></div>
          ${isAdmin4OrMgr
        ? `<form id="adminRolesForm" style="margin-bottom:14px">
                   <div class="form-row-2">
                     <div class="form-group">
                       <label class="form-label">Nume Jucător</label>
                       <input type="text" class="form-control" name="player" placeholder="Nickname..." required />
                     </div>
                     <div class="form-group">
                       <label class="form-label">Operațiune</label>
                       <select class="form-control" name="op" id="adminRoleOpSelect">
                         <option value="set_leader">Setare / Scoatere Lider Facțiune (Live)</option>
                         ${isAdmin5 ? `<option value="set_vip">Setare Cont VIP (0=Off, 999=Perm, Zile)</option>` : ""}
                         ${isFounder ? `<option value="toggle_badge">Comută Funcție Manager / Legend</option>` : ""}
                       </select>
                     </div>
                   </div>
                   <div class="form-row-2">
                     <div class="form-group">
                       <label class="form-label">Facțiune (pt. Lider)</label>
                       <select class="form-control" name="factionid">
                         <option value="0">0 — Fără Facțiune / Scoate Lider</option>
                         ${factionsOptions}
                       </select>
                     </div>
                     <div class="form-group">
                       <label class="form-label">Zile VIP / Funcție Manager</label>
                       <div style="display:flex;gap:6px">
                         <input type="number" class="form-control" name="days" value="30" min="0" max="3650" title="Zile VIP" />
                         <select class="form-control" name="column">
                           <option value="Legend">Legend</option>
                           ${managerOptions}
                         </select>
                       </div>
                     </div>
                   </div>
                   <button type="submit" class="btn btn-primary btn-xs">Aplică Modificarea</button>
                 </form>`
        : `<p style="color:var(--text-muted);margin-bottom:12px">Managementul de Lideri necesită Admin Level 4+ sau Manager Lideri.</p>`
      }
          ${isAdmin3
        ? `<form id="adminQuickUnbanForm" style="border-top:1px solid var(--border-subtle);padding-top:12px;margin-bottom:14px">
                   <div style="font-weight:600;margin-bottom:8px;color:var(--text-heading)">Debanare Rapidă Cont (Unban)</div>
                   <div class="form-row-2">
                     <div class="form-group">
                       <label class="form-label">Nume Jucător Banat</label>
                       <input type="text" class="form-control" name="player" placeholder="Nickname..." required />
                     </div>
                     <div class="form-group">
                       <label class="form-label">Motiv Unban</label>
                       <input type="text" class="form-control" name="reason" value="Unban din Admin Panel UCP" required />
                     </div>
                   </div>
                   <button type="submit" class="btn btn-emerald btn-xs">Debanează Jucătorul</button>
                 </form>`
        : ""
      }
          ${isFounder
        ? `<form id="adminPostUpdateForm" style="border-top:1px solid var(--border-subtle);padding-top:12px">
                   <div class="form-group">
                     <label class="form-label">Publică Server Update în Changelog</label>
                     <select class="form-control" name="for_type" style="margin-bottom:8px">
                       <option value="0">Server SA-MP (Gamemode / Sisteme)</option>
                       <option value="1">Panel UCP (Website / Funcții)</option>
                       <option value="2">Securitate &amp; Anti-Cheat</option>
                     </select>
                     <textarea class="form-control" name="text" style="min-height:60px" placeholder="Descrie modificările..." required></textarea>
                   </div>
                   <label class="ucp-check-row">
                     <input type="checkbox" name="allow_rating" checked />
                     <span>Permite rating cu stele (1–5&#9733;, opțional)</span>
                   </label>
                   <div style="display:flex;gap:8px;flex-wrap:wrap">
                     <button type="submit" class="btn btn-accent btn-xs">Publică Update</button>
                     <button type="button" class="btn btn-outline btn-xs" data-nav="updates">Vezi Lista Updates</button>
                   </div>
                 </form>`
        : ""
      }
        </div>
      </div>

      <!-- Security Events & Pending PanelActions Queue -->
      <div class="ucp-grid-2 anim-enter" style="margin-bottom:16px">
        <div class="ucp-card">
          <div class="card-header">
            <div class="card-title">Coada Live panelactions (${(data.pending_actions || []).length})</div>
            <button type="button" class="btn btn-outline btn-xs" data-action="refresh-live-view">Actualizează</button>
          </div>
          <div class="ucp-table-wrap">
            <table class="ucp-table">
              <thead><tr><th>ID</th><th>Acțiune</th><th>Jucător</th><th>Admin</th><th>Valoare</th><th>Motiv</th>${isFounder ? "<th>Control</th>" : ""}</tr></thead>
              <tbody>
                ${(data.pending_actions || [])
        .map(
          (pa) => `
                  <tr>
                    <td class="mono-text">#${pa.id}</td>
                    <td><span class="role-badge">[${pa.actionid}] ${esc(pa.action_name || `Action #${pa.actionid}`)}</span></td>
                    <td>${playerBtn(pa.playername)}</td>
                    <td>${esc(pa.givername)}</td>
                    <td class="mono-text">${pa.actiontime}</td>
                    <td>${esc(pa.reason)}</td>
                    ${isFounder
              ? `<td>
                             <div style="display:flex;gap:4px">
                               <button type="button" class="btn btn-emerald btn-xs" data-action="manage-panelaction" data-op="apply_now" data-id="${pa.id}" title="Aplică direct în baza de date (dacă serverul SA-MP este oprit)">Aplică DB</button>
                               <button type="button" class="btn btn-crimson btn-xs" data-action="manage-panelaction" data-op="delete" data-id="${pa.id}" title="Șterge din coadă">✕</button>
                             </div>
                           </td>`
              : ""
            }
                  </tr>`
        )
        .join("") || `<tr><td colspan="${isFounder ? 7 : 6}" style="text-align:center;color:var(--text-muted)">Nicio acțiune în coadă.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <div class="ucp-card">
          <div class="card-header"><div class="card-title">Evenimente Securitate UCP (${(data.security_events || []).length})</div></div>
          <div class="kv-list" style="max-height:220px;overflow-y:auto">
            ${(data.security_events || [])
        .map(
          (ev) => `
              <div class="kv-row">
                <span><strong style="color:#f87171">[${esc(ev.ip)}]</strong> ${esc(ev.actor)}: ${esc(ev.event)}</span>
                <span class="mono-text" style="color:var(--text-muted)">${esc(ev.time)}</span>
              </div>`
        )
        .join("") || `<div style="color:var(--text-muted)">Nicio alertă de securitate înregistrată.</div>`}
          </div>
        </div>
      </div>

      <!-- Unified 13-Table Log Explorer -->
      <div class="ucp-card anim-enter">
        <div class="card-header" style="flex-wrap:wrap">
          <div>
            <div class="card-title">Registru Loguri Server (${esc(data.log_type)})</div>
            <div class="card-subtitle">Vizualizare directă pentru cele 13 tabele de loguri din baza de date</div>
          </div>
          <div style="display:flex;gap:8px">
            <input type="text" id="adminLogFilterInput" class="form-control" style="width:220px" placeholder="Filtrează loguri..." value="${esc(q)}" />
            <button type="button" class="btn btn-primary btn-xs" data-action="filter-admin-logs" data-logtype="${esc(data.log_type)}">Filtrează</button>
          </div>
        </div>
        <div class="ucp-tabs">
          ${logTypes
        .map(
          (lt) => `
            <button type="button" class="ucp-tab-btn ${data.log_type === lt ? "active" : ""}" data-action="switch-admin-log" data-logtype="${lt}">
              ${lt}
            </button>`
        )
        .join("")}
        </div>
        <div class="ucp-table-wrap" style="max-height:460px;overflow-y:auto">
          <table class="ucp-table">
            <thead><tr><th>ID</th><th>Detalii Log</th><th>Data</th></tr></thead>
            <tbody>
              ${(data.logs || [])
        .map(
          (l) => `
                <tr>
                  <td class="mono-text">#${l.id}</td>
                  <td style="font-size:12.5px">${esc(l.text)}</td>
                  <td class="mono-text" style="color:var(--text-muted)">${esc(l.time || "-")}</td>
                </tr>`
        )
        .join("") || `<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">Nicio înregistrare în acest tabel.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 19B. VIEW 15: LUPMAX SIGNATURE — ROATA LUPMAX (DAILY SPIN WHEEL ARENA)
  // --------------------------------------------------------------------------
  function clearWheelTimer() {
    if (STATE.wheelTimerId) {
      clearInterval(STATE.wheelTimerId);
      STATE.wheelTimerId = null;
    }
  }

  function formatCountdown(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    return [h, m, r].map((v) => String(v).padStart(2, "0")).join(":");
  }

  function formatUnixDate(ts) {
    const n = Number(ts || 0);
    if (!n) return "-";
    try {
      return new Date(n * 1000).toLocaleString("ro-RO", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_) {
      return String(n);
    }
  }

  function drawLupMaxWheel(canvas, prizes, rotationRad) {
    if (!canvas || !Array.isArray(prizes) || !prizes.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = 352;
    if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const outerR = size / 2 - 4;
    const wheelR = outerR - 12;
    const n = prizes.length;
    const slice = (Math.PI * 2) / n;

    // Machined obsidian & brushed brass outer bezel
    const rimGrad = ctx.createRadialGradient(cx, cy, wheelR - 1, cx, cy, outerR);
    rimGrad.addColorStop(0, "#14161b");
    rimGrad.addColorStop(0.5, "#3a3020");
    rimGrad.addColorStop(0.84, "#d4a853");
    rimGrad.addColorStop(1, "#5c4520");
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.fillStyle = rimGrad;
    ctx.fill();

    // Draw luxury matte wedges
    for (let i = 0; i < n; i++) {
      const prize = prizes[i];
      const a0 = rotationRad + i * slice;
      const a1 = a0 + slice;
      const mid = (a0 + a1) / 2;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, wheelR, a0, a1);
      ctx.closePath();

      const baseCol = prize.color || "#1c222d";
      const wedgeGrad = ctx.createRadialGradient(cx, cy, 24, cx, cy, wheelR);
      wedgeGrad.addColorStop(0, "#0b0c0f");
      wedgeGrad.addColorStop(0.32, baseCol);
      wedgeGrad.addColorStop(1, baseCol);
      ctx.fillStyle = wedgeGrad;
      ctx.fill();

      ctx.lineWidth = 1.25;
      ctx.strokeStyle = "rgba(212, 168, 83, 0.34)";
      ctx.stroke();

      // Wedge Label
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(mid);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.font = prize.rarity === "legendary" ? "700 13px 'JetBrains Mono', monospace" : "600 12.5px 'JetBrains Mono', monospace";
      ctx.fillStyle = prize.rarity === "legendary" ? "#fff7df" : "#e6e9ef";
      ctx.fillText(prize.short || prize.label || "", wheelR - 16, 0);
      if (prize.rarity === "legendary") {
        ctx.font = "600 9.5px 'JetBrains Mono', monospace";
        ctx.fillStyle = "#ebd08f";
        ctx.fillText("50PP + VIP", wheelR - 16, 13);
      }
      ctx.restore();
    }

    // 16 subtle brass rim studs / warm micro-lights
    const bulbs = 16;
    for (let b = 0; b < bulbs; b++) {
      const ang = (b / bulbs) * Math.PI * 2 + rotationRad;
      const bx = cx + Math.cos(ang) * (wheelR + 6);
      const by = cy + Math.sin(ang) * (wheelR + 6);
      ctx.beginPath();
      ctx.arc(bx, by, 2.3, 0, Math.PI * 2);
      ctx.fillStyle = b % 2 === 0 ? "#ebd08f" : "#6c5830";
      ctx.fill();
    }

    // Center brushed hub collar
    ctx.beginPath();
    ctx.arc(cx, cy, 41, 0, Math.PI * 2);
    ctx.fillStyle = "#0b0c0f";
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = "rgba(212, 168, 83, 0.65)";
    ctx.stroke();
  }

  function renderWheelHTML(data) {
    const prizes = data.prizes || [];
    const totalWeight = Math.max(1, prizes.reduce((acc, p) => acc + Number(p.weight || 0), 0));
    const isFounder = STATE.user && Number(STATE.user.Admin) >= 6;
    const rarityLabels = {
      common: "Comun",
      rare: "Rar",
      epic: "Epic",
      legendary: "Legendar",
    };

    const oddsRows = prizes
      .map((p) => {
        const pct = ((Number(p.weight || 0) / totalWeight) * 100).toFixed(1);
        const rar = p.rarity || "common";
        return `
          <tr>
            <td>
              <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${esc(p.color)};margin-right:8px;vertical-align:middle"></span>
              <strong style="color:#fff">${esc(p.label)}</strong>
            </td>
            <td><span class="lm-rarity-pill lm-rarity-${esc(rar)}">${esc(rarityLabels[rar] || rar)}</span></td>
            <td class="mono-text" style="text-align:right;color:var(--accent-light)">${pct}%</td>
          </tr>`;
      })
      .join("");

    const recentRows = (data.recent_winners || []).length
      ? data.recent_winners
        .map(
          (w) => `
          <tr>
            <td>${playerBtn(w.playername)}</td>
            <td><strong>${esc(w.prize_label)}</strong></td>
            <td><span class="lm-rarity-pill lm-rarity-${esc(w.rarity || "common")}">${esc(rarityLabels[w.rarity] || w.rarity)}</span></td>
            <td><span class="status-pill ${w.delivered_mode === "live_queue" ? "status-online" : "status-open"}">${w.delivered_mode === "live_queue" ? "Live Joc" : "Cont DB"}</span></td>
            <td class="mono-text" style="color:var(--text-muted)">${esc(formatUnixDate(w.spun_at))}</td>
          </tr>`
        )
        .join("")
      : `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:18px">Fii primul jucător care învârte Roata LupMax!</td></tr>`;

    const myRows = (data.my_spins || []).length
      ? data.my_spins
        .map(
          (s) => `
          <div class="kv-row">
            <span><strong style="color:#fff">${esc(s.prize_label)}</strong> <span class="lm-rarity-pill lm-rarity-${esc(s.rarity || "common")}" style="margin-left:6px">${esc(rarityLabels[s.rarity] || s.rarity)}</span></span>
            <span class="mono-text" style="color:var(--text-muted)">${esc(formatUnixDate(s.spun_at))}</span>
          </div>`
        )
        .join("")
      : `<div style="color:var(--text-muted);font-size:12.5px">Nu ai rotit încă Roata LupMax. Încearcă-ți norocul gratuit acum!</div>`;

    let statusActionHTML = "";
    if (!STATE.user) {
      statusActionHTML = `
        <button type="button" class="btn btn-primary btn-block" data-action="open-login">
          Autentifică-te pentru a Învârti Roata
        </button>`;
    } else if (data.can_spin) {
      statusActionHTML = `
        <button type="button" class="btn btn-amber btn-block" id="wheelActionBtn" data-action="spin-wheel">
          Învârte Roata LupMax (Gratuit 1x / 24h)
        </button>`;
    } else {
      statusActionHTML = `
        <div style="width:100%;padding:10px 14px;border-radius:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);font-size:12.5px;color:var(--text-secondary)">
          Următoarea rotire disponibilă în:
          <strong class="mono-text" id="wheelCountdownText" style="color:#fde68a;font-size:15px;margin-left:6px">${formatCountdown(data.seconds_remaining)}</strong>
        </div>`;
    }

    return `
      <div class="lm-wheel-arena anim-enter">
        <!-- Left: Interactive Canvas Wheel Stage -->
        <div class="lm-wheel-card">
          <span class="role-badge" style="background:rgba(245,158,11,0.18);color:#fde68a;border-color:rgba(251,191,36,0.45);margin-bottom:8px">
            EXCLUSIV LUPMAX RPG &middot; ${fmtNum(data.total_server_spins || 0)} ROTIRI PE SERVER
          </span>
          <h2 style="font-family:var(--font-gta);font-size:28px;letter-spacing:0.06em;color:#ffffff;margin:0">
            ROATA NOROCULUI LUPMAX
          </h2>
          <p style="font-size:12.5px;color:var(--text-secondary);margin:6px 0 4px;max-width:380px">
            Premiile câștigate se livrează instant în contul tău SA-MP (sau prin coada live <code class="mono-text">panelactions</code> dacă ești online în joc).
          </p>

          <div class="lm-wheel-stage">
            <div class="lm-wheel-pointer" aria-hidden="true"></div>
            <canvas id="lupmaxWheelCanvas" class="lm-wheel-canvas" width="352" height="352"></canvas>
            <button type="button" class="lm-wheel-hub-btn" id="wheelSpinBtn" data-action="spin-wheel" ${!STATE.user || !data.can_spin || STATE.wheelSpinning ? "disabled" : ""}>
              SPIN
            </button>
          </div>

          <div style="width:100%;display:flex;flex-direction:column;gap:8px">
            ${statusActionHTML}
            ${isFounder && !data.can_spin
        ? `<button type="button" class="btn btn-outline btn-xs btn-block" data-action="reset-wheel-cooldown">
                     Reset Cooldown (Test Founder Admin 6)
                   </button>`
        : ""
      }
          </div>

          <div id="wheelResultSlot" style="width:100%">
            ${STATE.wheelLastResultMsg
        ? `<div class="lm-wheel-result-banner">${esc(STATE.wheelLastResultMsg)}</div>`
        : ""
      }
          </div>
        </div>

        <!-- Right: Odds Table, Live Recent Winners & Personal Spin History -->
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="ucp-card">
            <div class="card-header">
              <div>
                <div class="card-title">Premii &amp; Probabilități Oficiale</div>
                <div class="card-subtitle">Selecție criptografic corectă pe server (CSPRNG) — 100% transparent</div>
              </div>
              <span class="lm-rarity-pill lm-rarity-legendary">JACKPOT +50 PP &amp; 3z VIP</span>
            </div>
            <div class="ucp-table-wrap">
              <table class="ucp-table">
                <thead><tr><th>Premiu</th><th>Raritate</th><th style="text-align:right">Șansă</th></tr></thead>
                <tbody>${oddsRows}</tbody>
              </table>
            </div>
          </div>

          <div class="ucp-card">
            <div class="card-header">
              <div>
                <div class="card-title">Ultimii Câștigători Live (${(data.recent_winners || []).length})</div>
                <div class="card-subtitle">Premii acordate jucătorilor LupMax direct din UCP</div>
              </div>
            </div>
            <div class="ucp-table-wrap" style="max-height:290px;overflow-y:auto">
              <table class="ucp-table">
                <thead><tr><th>Jucător</th><th>Premiu</th><th>Raritate</th><th>Livrare</th><th>Data</th></tr></thead>
                <tbody>${recentRows}</tbody>
              </table>
            </div>
          </div>

          ${STATE.user
        ? `<div class="ucp-card">
                   <div class="card-header">
                     <div class="card-title">Istoricul Tău de Rotiri (${(data.my_spins || []).length})</div>
                   </div>
                   <div class="kv-list" style="max-height:210px;overflow-y:auto">${myRows}</div>
                 </div>`
        : ""
      }
        </div>
      </div>
    `;
  }

  async function loadAndRenderWheel(keepResultBanner = false) {
    clearWheelTimer();
    if (!keepResultBanner) STATE.wheelLastResultMsg = "";
    const vp = document.getElementById("ucpViewport");
    const data = await api("/api/wheel");
    STATE.cachedWheel = data;
    if (vp && STATE.view === "wheel") {
      vp.innerHTML = renderWheelHTML(data);
      const canvas = document.getElementById("lupmaxWheelCanvas");
      if (canvas) drawLupMaxWheel(canvas, data.prizes || [], STATE.wheelRotation || 0);

      if (STATE.user && !data.can_spin && Number(data.seconds_remaining || 0) > 0) {
        let rem = Number(data.seconds_remaining);
        STATE.wheelTimerId = setInterval(() => {
          rem -= 1;
          const el = document.getElementById("wheelCountdownText");
          if (el) el.textContent = formatCountdown(rem);
          if (rem <= 0) {
            clearWheelTimer();
            if (STATE.view === "wheel") loadAndRenderWheel(false);
          }
        }, 1000);
      }
    }
  }

  async function spinLupMaxWheel() {
    if (!STATE.user) {
      showLoginModal();
      return;
    }
    if (STATE.wheelSpinning) return;
    STATE.wheelSpinning = true;
    const hubBtn = document.getElementById("wheelSpinBtn");
    const actBtn = document.getElementById("wheelActionBtn");
    if (hubBtn) hubBtn.disabled = true;
    if (actBtn) {
      actBtn.disabled = true;
      actBtn.textContent = "Se învârte Roata LupMax...";
    }

    try {
      const res = await api("/api/wheel/spin", { body: {} });
      const prizes = (STATE.cachedWheel && STATE.cachedWheel.prizes) || (STATE.bootstrap?.constants?.wheel_prizes) || [];
      const n = Math.max(1, prizes.length);
      const slice = (Math.PI * 2) / n;
      const TWO_PI = Math.PI * 2;
      const pIdx = Number(res.prize_index || 0);
      const jitter = (Math.random() - 0.5) * slice * 0.48;
      const desiredMod = (((-Math.PI / 2 - (pIdx + 0.5) * slice + jitter) % TWO_PI) + TWO_PI) % TWO_PI;

      const startRot = STATE.wheelRotation || 0;
      const curMod = ((startRot % TWO_PI) + TWO_PI) % TWO_PI;
      let delta = desiredMod - curMod;
      if (delta <= 0) delta += TWO_PI;
      const totalDelta = 6 * TWO_PI + delta;

      const durationMs = 4600;
      const startTs = performance.now();
      let lastSeg = -1;

      await new Promise((resolve) => {
        const step = (nowTs) => {
          const t = Math.min(1, (nowTs - startTs) / durationMs);
          const eased = 1 - Math.pow(1 - t, 4);
          const curRot = startRot + totalDelta * eased;
          STATE.wheelRotation = curRot;

          const canvas = document.getElementById("lupmaxWheelCanvas");
          if (canvas) drawLupMaxWheel(canvas, prizes, curRot);

          const rel = (((-Math.PI / 2 - curRot) % TWO_PI) + TWO_PI) % TWO_PI;
          const seg = Math.floor(rel / slice) % n;
          if (seg !== lastSeg) {
            lastSeg = seg;
            SFX.play("tab");
            const ptr = document.querySelector(".lm-wheel-pointer");
            if (ptr) {
              ptr.style.transform = "translateX(-50%) rotate(-14deg)";
              setTimeout(() => {
                if (ptr) ptr.style.transform = "translateX(-50%) rotate(0deg)";
              }, 55);
            }
          }

          if (t < 1 && STATE.view === "wheel") {
            requestAnimationFrame(step);
          } else {
            STATE.wheelRotation = startRot + totalDelta;
            resolve();
          }
        };
        requestAnimationFrame(step);
      });

      STATE.wheelSpinning = false;
      STATE.wheelLastResultMsg = res.message || "Felicitări! Premiul a fost acordat!";
      toast(STATE.wheelLastResultMsg, "success");

      STATE.bootstrap = await api("/api/bootstrap");
      syncShellHeader();
      if (STATE.view === "wheel") {
        await loadAndRenderWheel(true);
      }
    } catch (err) {
      STATE.wheelSpinning = false;
      if (hubBtn) hubBtn.disabled = false;
      if (actBtn) {
        actBtn.disabled = false;
        actBtn.textContent = "Învârte Roata LupMax (Gratuit 1x / 24h)";
      }
      toast(err.message, "error");
    }
  }

  // --------------------------------------------------------------------------
  // 20. ROUTER & VIEW CONTROLLER
  // --------------------------------------------------------------------------
  const VIEW_TITLES = {
    dashboard: ["LupMax Hub", "Dashboard"],
    profile: ["Identitate San Andreas", "Profil & Citizen ID"],
    wheel: ["LupMax Exclusive", "Roata LupMax — Premii Zilnice"],
    players: ["Comunitate", "Jucători & Staff"],
    leaderboards: ["Statistici", "Topuri Jucători"],
    updates: ["Server & Changelog", "Updates & Noutăți"],
    factions: ["Organizații", "Facțiuni & Aplicații"],
    clans: ["Comunitate", "Clanuri"],
    wars: ["Mafii", "Turf Map & Wars"],
    economy: ["Economie", "Dealership, Case & Afaceri"],
    shop: ["Premium", "Shop, VIP & Donații"],
    complaints: ["Moderare", "Reclamații"],
    tickets: ["Suport", "Tichete Suport"],
    bans: ["Moderare", "Banlist & Cereri Unban"],
    security: ["Contul Meu", "Setări Cont & Email"],
    admin: ["Administrare", "Admin Panel & Loguri"],
  };

  function closeAllNavDropdowns() {
    document.querySelectorAll(".nav-dropdown.open").forEach((dd) => dd.classList.remove("open"));
  }

  async function navigateTo(view, opts = {}) {
    if (!VIEW_TITLES[view]) view = "dashboard";
    if (STATE.view === "wheel" && view !== "wheel") {
      clearWheelTimer();
    }
    STATE.view = view;
    closeAllNavDropdowns();

    document.querySelectorAll(".sidebar-nav .nav-item, .lupmax-mobile-drawer .nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-nav") === view);
    });
    document.querySelectorAll(".lupmax-nav .nav-dropdown").forEach((dd) => {
      const hasMatch = Boolean(dd.querySelector(`.nav-dropdown-menu [data-nav="${view}"]`));
      dd.classList.toggle("has-active", hasMatch);
    });

    const sidebar = document.getElementById("ucpSidebar");
    if (sidebar) sidebar.classList.remove("sidebar-open");

    const [catTag, heading] = VIEW_TITLES[view] || VIEW_TITLES.dashboard;
    const tagEl = document.getElementById("viewCategoryTag");
    const headEl = document.getElementById("viewHeadingTitle");
    if (tagEl) tagEl.textContent = catTag;
    if (headEl) headEl.textContent = heading;

    const vp = document.getElementById("ucpViewport");
    if (!vp) return;

    try {
      if (view === "dashboard") {
        vp.innerHTML = renderDashboardView();
      } else if (view === "profile") {
        await loadAndRenderProfile(opts.player);
      } else if (view === "wheel") {
        await loadAndRenderWheel();
      } else if (view === "players") {
        await loadAndRenderPlayers(opts);
      } else if (view === "leaderboards") {
        await loadAndRenderLeaderboards();
      } else if (view === "updates") {
        vp.innerHTML = renderUpdatesView();
      } else if (view === "factions") {
        await loadAndRenderFactions(opts.factionId);
      } else if (view === "clans") {
        await loadAndRenderClans(opts.clanId);
      } else if (view === "wars") {
        await loadAndRenderWars();
      } else if (view === "economy") {
        await loadAndRenderEconomy();
      } else if (view === "shop") {
        await loadAndRenderShop();
      } else if (view === "complaints") {
        await loadAndRenderComplaints();
      } else if (view === "tickets") {
        await loadAndRenderTickets();
      } else if (view === "bans") {
        await loadAndRenderBans();
      } else if (view === "security") {
        await loadAndRenderSecurity();
      } else if (view === "admin") {
        await loadAndRenderAdmin();
      }
    } catch (err) {
      toast(err.message, "error");
    }
  }

  // --------------------------------------------------------------------------
  // 21. MODALS FOR ALL UCP INTERACTIVE FLOWS
  // --------------------------------------------------------------------------
  function showLoginModal() {
    openModal(
      "Autentificare în LupMax Panel",
      `
      <form id="ucpLoginForm">
        <div class="form-group">
          <label class="form-label">Nume Cont (Nickname SA-MP)</label>
          <input type="text" class="form-control" name="name" placeholder="Ex: AlleqsZ" required autofocus />
        </div>
        <div class="form-group">
          <label class="form-label">Parola Contului</label>
          <input type="password" class="form-control" name="password" placeholder="••••••••" required />
        </div>
        <div style="padding:9px 11px;background:var(--bg-inset);border:1px solid var(--border-subtle);border-radius:6px;font-size:11.5px;color:var(--text-secondary);margin-bottom:14px">
          Sesiunea este protejată împotriva furtului de cookie și este legată de acest dispozitiv (<span class="mono-text">${esc(STATE.fingerprint.slice(0, 14))}</span>).
        </div>
        <button type="submit" class="btn btn-primary btn-block">Autentificare</button>
      </form>
      `
    );
  }

  function showApplyFactionModal(fid) {
    if (!STATE.user) return showLoginModal();
    const f = (STATE.cachedFaction && STATE.cachedFaction.faction) || ((STATE.bootstrap?.factions || []).find((x) => x.ID === Number(fid)));
    if (!f) return;
    const questions = (f.Questions || [])
      .map((q, idx) =>
        q && q.trim()
          ? `<div class="form-group">
               <label class="form-label">${idx + 1}. ${esc(q)}</label>
               <input type="text" class="form-control faction-app-answer" data-qindex="${idx}" maxlength="240" required />
             </div>`
          : `<input type="hidden" class="faction-app-answer" data-qindex="${idx}" value="-" />`
      )
      .join("");

    openModal(
      `Aplică la ${f.Name}`,
      `
      <form id="factionApplyForm" data-fid="${f.ID}">
        <p style="color:var(--text-secondary);font-size:12.5px;margin-bottom:12px">
          Aplici cu contul <strong>${esc(STATE.user.name)}</strong> (Level ${STATE.user.Level}, ${STATE.user.ConnectedTime}h). Completează chestionarul de mai jos:
        </p>
        ${questions}
        <button type="submit" class="btn btn-primary btn-block">Trimite Aplicația</button>
      </form>
      `
    );
  }

  function showApplyLeaderModal(fid, fname = "") {
    if (!STATE.user) return showLoginModal();
    const f = ((STATE.cachedLeaderApps && STATE.cachedLeaderApps.factions) || []).find((x) => Number(x.ID) === Number(fid));
    const label = fname || (f ? f.Name : `Facțiunea #${fid}`);
    openModal(
      `Aplică pentru Lider — ${label}`,
      `
      <form id="leaderApplyForm" data-fid="${Number(fid)}">
        <p style="color:var(--text-secondary);font-size:12.5px;margin-bottom:12px">
          Aplici cu contul <strong>${esc(STATE.user.name)}</strong> (Level ${STATE.user.Level}, ${STATE.user.ConnectedTime}h).
          ${f ? `Cerințe: Level ${f.MinLevel}+ și ${f.MinHours}h+.` : ""}
        </p>
        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label">Nume real</label>
            <input type="text" class="form-control" name="real_name" minlength="2" maxlength="60" placeholder="Prenume / Nume..." required />
          </div>
          <div class="form-group">
            <label class="form-label">Vârstă (ani)</label>
            <input type="number" class="form-control" name="age" min="12" max="80" value="18" required />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Activitate zilnică estimată (fără AFK)</label>
          <input type="text" class="form-control" name="activity" maxlength="120" placeholder="Ex: 3–5 ore zilnic, interval 18:00–23:00" required />
        </div>
        <div class="form-group">
          <label class="form-label">Experiență anterioară ca Lider / Co-Lider sau membru</label>
          <textarea class="form-control" name="experience" minlength="10" maxlength="1500" style="min-height:72px" placeholder="Descrie istoricul tău în facțiuni..." required></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Planul tău pentru facțiune &amp; de ce meriți funcția de Lider</label>
          <textarea class="form-control" name="plan" minlength="15" maxlength="2000" style="min-height:84px" placeholder="Cum vei organiza recrutările, ședințele, raportul și disciplina..." required></textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Trimite Aplicația de Lider</button>
      </form>
      `
    );
  }

  function showComplaintModal(prefillTarget = "") {
    if (!STATE.user) return showLoginModal();
    openModal(
      "Deschide o Reclamație",
      `
      <form id="createComplaintForm">
        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label">Jucător Reclamat</label>
            <input type="text" class="form-control" name="player" value="${esc(prefillTarget)}" placeholder="Nickname exact..." required />
          </div>
          <div class="form-group">
            <label class="form-label">Motivul Reclamației</label>
            <select class="form-control" name="category">
              <option value="0">Deathmatch (DM / DB)</option>
              <option value="1">Limbaj / Insulte / Comportament</option>
              <option value="2">Înșelătorie / Scam / Economie</option>
              <option value="3">Abuz Facțiune / Membru Facțiune</option>
              <option value="4">Reclamație Lider Facțiune</option>
              <option value="5">Reclamație Staff (Admin / Helper)</option>
              <option value="6">Cheats / Hack / Bug Abuse</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Dovezi Foto / Video (Link Imgur, YouTube)</label>
          <input type="text" class="form-control" name="evidence" placeholder="https://..." required />
        </div>
        <div class="form-group">
          <label class="form-label">Detalii</label>
          <textarea class="form-control" name="details" placeholder="Descrie situația..." required></textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Trimite Reclamația</button>
      </form>
      `
    );
  }

  async function showComplaintThreadModal(cid) {
    const data = await api(`/api/complaint/${cid}`);
    const c = data.complaint;
    const isAdmin1 = STATE.user && Number(STATE.user.Admin) >= 1;
    const repliesHTML = (data.replies || [])
      .map(
        (r) => `
        <div class="thread-msg">
          <div class="thread-msg-head"><strong>${esc(r.user)}</strong><span class="mono-text">${esc(r.time)}</span></div>
          <div style="white-space:pre-line">${esc(r.text)}</div>
        </div>`
      )
      .join("");

    openModal(
      `Reclamația #${c.id} — ${c.createdby} vs. ${c.playername}`,
      `
      <div class="kv-list" style="margin-bottom:10px">
        <div class="kv-row"><span class="kv-key">Categorie / Status</span><span class="kv-val">${esc(c.CategoryName)} &middot; ${Number(c.status) === 0 ? "Deschisă" : "Închisă"}</span></div>
        <div class="kv-row"><span class="kv-key">Dovezi</span><span class="kv-val" style="word-break:break-all">${esc(c.evidence)}</span></div>
        <div class="kv-row"><span class="kv-key">Descriere</span><span class="kv-val">${esc(c.details)}</span></div>
      </div>
      <div class="thread-box">${repliesHTML || `<div style="color:var(--text-muted)">Niciun comentariu adăugat.</div>`}</div>
      ${STATE.user && (Number(c.status) === 0 || isAdmin1)
        ? `<form id="replyComplaintForm" data-id="${c.id}" style="margin-bottom:12px">
               <div class="form-group">
                 <label class="form-label">Adaugă Comentariu</label>
                 <textarea class="form-control" name="text" style="min-height:64px" required></textarea>
               </div>
               <button type="submit" class="btn btn-primary btn-xs">Postează Răspunsul</button>
             </form>`
        : STATE.user && Number(c.status) !== 0
          ? `<div style="color:var(--text-muted);font-size:12px;margin-bottom:10px">Această reclamație este închisă.</div>`
          : ""
      }
      ${isAdmin1
        ? `<form id="resolveComplaintForm" data-id="${c.id}" style="border-top:1px solid var(--border-subtle);padding-top:12px">
               <div style="font-weight:600;margin-bottom:8px;color:var(--text-heading)">Soluționare Reclamație (Admin)</div>
               <div class="form-row-2">
                 <div class="form-group">
                   <label class="form-label">Sancțiune</label>
                   <select class="form-control" name="sanction_action">
                     <option value="0">Fără Sancțiune (Doar Închide)</option>
                     <option value="4">Warn (+1 Avertisment)</option>
                     <option value="3">Admin Jail (Minute)</option>
                     <option value="5">Mute (Minute)</option>
                     <option value="1">Ban Temporar (Zile)</option>
                     <option value="2">Ban Permanent</option>
                   </select>
                 </div>
                 <div class="form-group">
                   <label class="form-label">Durată (Minute / Zile)</label>
                   <input type="number" class="form-control" name="sanction_duration" value="30" min="0" />
                 </div>
               </div>
               <div class="form-group">
                 <label class="form-label">Verdict</label>
                 <input type="text" class="form-control" name="verdict" placeholder="Motivul deciziei..." required />
               </div>
               <button type="submit" class="btn btn-emerald btn-sm">Închide &amp; Aplică Verdictul</button>
             </form>`
        : ""
      }
      `
    );
  }

  function showTicketModal() {
    if (!STATE.user) return showLoginModal();
    openModal(
      "Deschide Tichet de Suport",
      `
      <form id="createTicketForm">
        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label">Categorie</label>
            <select class="form-control" name="type">
              <option value="0">Suport General</option>
              <option value="1">Conturi &amp; Securitate</option>
              <option value="2">Donații &amp; Buguri</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Subiect</label>
            <input type="text" class="form-control" name="title" placeholder="Subiectul tichetului..." required />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Mesaj</label>
          <textarea class="form-control" name="body" required></textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Trimite Tichetul</button>
      </form>
      `
    );
  }

  async function showTicketThreadModal(tid) {
    const data = await api(`/api/ticket/${tid}`);
    const t = data.ticket;
    const isStaffUser = STATE.user && (Number(STATE.user.Admin) > 0 || Number(STATE.user.Helper) > 0);
    const repliesHTML = (data.replies || [])
      .map(
        (r) => `
        <div class="thread-msg">
          <div class="thread-msg-head"><strong>${esc(r.user)}</strong><span class="mono-text">${esc(r.time)}</span></div>
          <div style="white-space:pre-line">${esc(r.text)}</div>
        </div>`
      )
      .join("");

    openModal(
      `Tichet #${t.id} (${t.Name})`,
      `
      <div style="padding:10px;background:var(--bg-inset);border:1px solid var(--border-subtle);border-radius:6px;white-space:pre-line;margin-bottom:10px">${esc(t.Ticket)}</div>
      <div class="thread-box">${repliesHTML || `<div style="color:var(--text-muted)">Niciun răspuns până acum.</div>`}</div>
      ${Number(t.Status) === 0 || isStaffUser
        ? `<form id="replyTicketForm" data-id="${t.id}">
               <div class="form-group">
                 <label class="form-label">Răspuns</label>
                 <textarea class="form-control" name="text" style="min-height:64px" required></textarea>
               </div>
               <div style="display:flex;justify-content:space-between;gap:8px">
                 <button type="submit" class="btn btn-primary btn-xs">Trimite Răspuns</button>
                 ${isStaffUser
          ? `<button type="button" class="btn btn-outline btn-xs" data-action="toggle-ticket-status" data-id="${t.id}" data-status="${Number(t.Status) === 0 ? 1 : 0}">
                          ${Number(t.Status) === 0 ? "Închide Tichetul" : "Redeschide Tichetul"}
                        </button>`
          : ""
        }
               </div>
             </form>`
        : `<div style="color:var(--text-muted);font-size:12.5px">Acest tichet a fost închis de echipa Staff.</div>`
      }
      `
    );
  }

  function showUnbanModal() {
    if (!STATE.user) return showLoginModal();
    openModal(
      "Cerere de Debanare (Unban)",
      `
      <form id="createUnbanForm">
        <div class="form-group">
          <label class="form-label">Motivul pentru care soliciți debanarea</label>
          <textarea class="form-control" name="details" required></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Dovezi Foto / Video</label>
          <input type="text" class="form-control" name="evidence" placeholder="https://..." required />
        </div>
        <button type="submit" class="btn btn-primary btn-block">Trimite Cererea</button>
      </form>
      `
    );
  }

  async function showUnbanThreadModal(rid) {
    const data = await api(`/api/unban/${rid}`);
    const req = data.request;
    const isAdmin3 = STATE.user && Number(STATE.user.Admin) >= 3;
    const repliesHTML = (data.replies || [])
      .map(
        (r) => `
        <div class="thread-msg">
          <div class="thread-msg-head"><strong>${esc(r.user)}</strong><span class="mono-text">${esc(r.data)}</span></div>
          <div style="white-space:pre-line">${esc(r.text)}</div>
        </div>`
      )
      .join("");

    openModal(
      `Cerere Unban #${req.id} — ${req.user}`,
      `
      <div style="padding:10px;background:var(--bg-inset);border:1px solid var(--border-subtle);border-radius:6px;white-space:pre-line;margin-bottom:10px">${esc(req.text)}</div>
      ${data.ban
        ? `<div style="padding:8px 10px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);border-radius:6px;margin-bottom:10px;font-size:12px">
               <strong>Detalii Ban:</strong> Banat de <strong>${esc(data.ban.AdminName)}</strong> &middot; Motiv: <strong>${esc(data.ban.Reason)}</strong> (${data.ban.Permanent ? "Permanent" : data.ban.Days + " zile"})
             </div>`
        : ""
      }
      <div class="thread-box">${repliesHTML || `<div style="color:var(--text-muted)">Fără răspunsuri.</div>`}</div>
      ${STATE.user
        ? `<form id="replyUnbanForm" data-id="${req.id}" style="margin-bottom:12px">
               <div class="form-group">
                 <textarea class="form-control" name="text" style="min-height:60px" placeholder="Adaugă un comentariu..." required></textarea>
               </div>
               <button type="submit" class="btn btn-primary btn-xs">Răspunde</button>
             </form>`
        : ""
      }
      ${isAdmin3 && Number(req.status) === 0
        ? `<div style="display:flex;gap:8px;border-top:1px solid var(--border-subtle);padding-top:10px">
               <button type="button" class="btn btn-emerald btn-xs" data-action="resolve-unban" data-id="${req.id}" data-status="1">Aprobă &amp; Debanează</button>
               <button type="button" class="btn btn-crimson btn-xs" data-action="resolve-unban" data-id="${req.id}" data-status="2">Respinge Cererea</button>
             </div>`
        : ""
      }
      `
    );
  }

  async function showCustomizeProfileModal() {
    if (!STATE.user) return showLoginModal();
    let profData = STATE.cachedProfile;
    if (!profData || !profData.summary || Number(profData.summary.id) !== Number(STATE.user.id)) {
      profData = await api(`/api/player/${encodeURIComponent(STATE.user.name)}`);
    }
    const pc = profData.profile_custom || {};
    const presets = (STATE.bootstrap && STATE.bootstrap.constants && STATE.bootstrap.constants.profile_banners) || {
      midnight_wolf: { name: "LupMax Midnight", css: "linear-gradient(135deg, #0b132b 0%, #1d4ed8 48%, #020617 100%)" },
      vinewood_gold: { name: "Vinewood Sunset Gold", css: "linear-gradient(135deg, #1c1008 0%, #b45309 45%, #f59e0b 100%)" },
      crimson_cartel: { name: "Crimson Cartel", css: "linear-gradient(135deg, #1a060d 0%, #be123c 50%, #4c0519 100%)" },
      emerald_grove: { name: "Grove Street Pulse", css: "linear-gradient(135deg, #041b11 0%, #059669 52%, #064e3b 100%)" },
      cyber_lv: { name: "Las Venturas Neon", css: "linear-gradient(135deg, #0f0726 0%, #7c3aed 48%, #06b6d4 100%)" },
      arctic_stealth: { name: "Arctic Tactical", css: "linear-gradient(135deg, #090d16 0%, #334155 50%, #0f172a 100%)" },
    };
    const badges = (STATE.bootstrap && STATE.bootstrap.constants && STATE.bootstrap.constants.profile_badges) || {
      wolf_pack: { label: "Alpha Wolf", color: "#38bdf8" },
      street_king: { label: "Street Racer", color: "#f59e0b" },
      mafia_boss: { label: "Cartel Boss", color: "#f43f5e" },
      law_enforcer: { label: "San Andreas Law", color: "#3b82f6" },
      tycoon: { label: "Maze Tycoon", color: "#10b981" },
      og_veteran: { label: "OG Veteran", color: "#a855f7" },
      sharpshooter: { label: "Turf Sniper", color: "#ec4899" },
    };

    const curPreset = pc.banner_preset || "midnight_wolf";
    const curBadge = pc.showcase_badge || "wolf_pack";
    const curAccent = /^#[0-9a-fA-F]{6}$/.test(pc.accent_color || "") ? pc.accent_color : "";

    const presetSwatchesHTML = Object.entries(presets)
      .map(
        ([key, item]) => `
        <button type="button" class="lm-banner-opt ${key === curPreset ? "selected" : ""}" data-action="pick-banner-preset" data-preset="${esc(key)}" style="background:${esc(item.css)}">
          ${esc(item.name)}
        </button>`
      )
      .join("");

    const badgeOptsHTML = Object.entries(badges)
      .map(
        ([key, item]) =>
          `<option value="${esc(key)}" ${key === curBadge ? "selected" : ""}>★ ${esc(item.label)}</option>`
      )
      .join("");

    openModal(
      `Studio Profil LupMax — ${STATE.user.name}`,
      `
      <form id="customizeProfileForm">
        <input type="hidden" name="banner_preset" id="studioBannerPresetInput" value="${esc(curPreset)}" />
        <div class="form-group">
          <label class="form-label">Alege Cover Banner Preset</label>
          <div class="lm-banner-picker">${presetSwatchesHTML}</div>
        </div>

        <div class="form-group">
          <label class="form-label">Sau Banner Imagine Custom (URL https:// — opțional)</label>
          <input type="url" class="form-control" name="banner_url" maxlength="250" value="${esc(pc.banner_url || "")}" placeholder="https://i.imgur.com/... (lasă gol pentru preset)" />
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label">Titlu Custom (max 48 car.)</label>
            <input type="text" class="form-control" name="custom_title" maxlength="48" value="${esc(pc.custom_title || "")}" placeholder="Ex: King of Los Santos" />
          </div>
          <div class="form-group">
            <label class="form-label">Insignă Vitrină</label>
            <select class="form-control" name="showcase_badge">${badgeOptsHTML}</select>
          </div>
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label">Discord Tag (opțional)</label>
            <input type="text" class="form-control" name="discord_tag" maxlength="48" value="${esc(pc.discord_tag || "")}" placeholder="Ex: @alleqsz" />
          </div>
          <div class="form-group">
            <label class="form-label">Culoare Accent Cover (HEX)</label>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="color" id="studioAccentPicker" value="${esc(curAccent || "#3b82f6")}" style="width:42px;height:36px;padding:2px;border-radius:8px;border:1px solid var(--border-subtle);background:#0f172a;cursor:pointer" />
              <input type="text" class="form-control mono-text" id="studioAccentHexInput" name="accent_color" maxlength="7" value="${esc(curAccent)}" placeholder="#3b82f6 (gol = tema)" />
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Descriere / Bio Profil (max 280 car.)</label>
          <textarea class="form-control" name="bio" maxlength="280" style="min-height:70px" placeholder="Scrie un motto, istoricul tău pe LupMax sau echipa ta...">${esc(pc.bio || "")}</textarea>
        </div>

        <button type="submit" class="btn btn-accent btn-block">Salvează Personalizarea Profilului</button>
      </form>
      `
    );
  }

  // --------------------------------------------------------------------------
  // 22. GLOBAL EVENT DELEGATION (100% CSP-SAFE, ZERO INLINE HANDLERS)
  // --------------------------------------------------------------------------
  document.addEventListener("click", async (e) => {
    const navBtn = e.target.closest("[data-nav]");
    if (navBtn) {
      e.preventDefault();
      SFX.play("nav");
      if (navBtn.hasAttribute("data-subtab")) {
        const [v, t] = navBtn.getAttribute("data-subtab").split(":");
        if (v && t) STATE.subTab[v] = t;
      }
      navigateTo(navBtn.getAttribute("data-nav"));
      return;
    }

    const subTabBtn = e.target.closest("[data-subtab]");
    if (subTabBtn) {
      e.preventDefault();
      SFX.play("tab");
      const [v, t] = subTabBtn.getAttribute("data-subtab").split(":");
      STATE.subTab[v] = t;
      const vp = document.getElementById("ucpViewport");
      if (!vp) return;
      if (v === "profile" && STATE.cachedProfile) vp.innerHTML = renderProfileHTML(STATE.cachedProfile);
      if (v === "leaderboards" && STATE.cachedLeaderboards) vp.innerHTML = renderLeaderboardsHTML(STATE.cachedLeaderboards);
      if (v === "factions" && STATE.cachedFaction) vp.innerHTML = renderFactionsHTML(STATE.cachedFaction);
      if (v === "economy" && STATE.cachedEconomy) vp.innerHTML = renderEconomyHTML(STATE.cachedEconomy);
      return;
    }

    const actBtn = e.target.closest("[data-action]");
    if (!actBtn) return;
    const action = actBtn.getAttribute("data-action");
    if (
      action === "filter-car-market" ||
      action === "filter-eco-map" ||
      action === "filter-players" ||
      action === "filter-updates" ||
      action === "select-faction" ||
      action === "select-clan" ||
      action === "select-eco-pin" ||
      action === "switch-admin-log"
    ) {
      SFX.play("tab");
    } else if (action === "view-player") {
      SFX.play("select");
    }

    try {
      if (action === "open-login") {
        showLoginModal();
      } else if (action === "close-modal") {
        closeModal();
      } else if (action === "toggle-nav-dd") {
        const ddWrap = actBtn.closest(".nav-dropdown");
        if (ddWrap) {
          const wasOpen = ddWrap.classList.contains("open");
          closeAllNavDropdowns();
          if (!wasOpen) ddWrap.classList.add("open");
        }
        SFX.play("tab");
      } else if (action === "modal-customize-profile") {
        closeAllNavDropdowns();
        await showCustomizeProfileModal();
      } else if (action === "pick-banner-preset") {
        const preset = actBtn.getAttribute("data-preset") || "midnight_wolf";
        const hid = document.getElementById("studioBannerPresetInput");
        if (hid) hid.value = preset;
        document.querySelectorAll(".lm-banner-opt").forEach((el) => {
          el.classList.toggle("selected", el.getAttribute("data-preset") === preset);
        });
        SFX.play("tab");
      } else if (action === "copy-profile-link") {
        const pName = actBtn.getAttribute("data-player") || STATE.activeProfileName || "";
        const shareUrl = `${window.location.origin}/?player=${encodeURIComponent(pName)}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(shareUrl);
        }
        toast(`Link-ul profilului (${pName}) a fost copiat!`, "success");
      } else if (action === "spin-wheel") {
        await spinLupMaxWheel();
      } else if (action === "reset-wheel-cooldown") {
        const res = await api("/api/wheel/reset-cooldown", { body: {} });
        toast(res.message, "success");
        STATE.bootstrap = await api("/api/bootstrap");
        syncShellHeader();
        await loadAndRenderWheel(false);
      } else if (action === "set-theme") {
        applyTheme(actBtn.getAttribute("data-theme"), true);
        SFX.play("tab");
      } else if (action === "toggle-theme-mixer") {
        setThemeMixerOpen();
        SFX.play("tab");
      } else if (action === "close-theme-mixer") {
        setThemeMixerOpen(false);
        SFX.play("back");
      } else if (action === "set-mixer-mode") {
        updateCustomMix({ mode: actBtn.getAttribute("data-mode") === "single" ? "single" : "dual" }, true);
        SFX.play("tab");
      } else if (action === "pick-mix-chip") {
        const slot = actBtn.getAttribute("data-slot");
        const color = actBtn.getAttribute("data-color");
        updateCustomMix(slot === "2" ? { c2: color } : { c1: color }, true);
        SFX.play("tab");
      } else if (action === "swap-mix-colors") {
        const cur = STATE.customMix || DEFAULT_CUSTOM_MIX;
        updateCustomMix({ c1: cur.c2, c2: cur.c1 }, true);
        SFX.play("tab");
      } else if (action === "reset-theme-mixer") {
        STATE.customMix = { ...DEFAULT_CUSTOM_MIX };
        saveCustomMix(STATE.customMix);
        applyTheme("obsidian", true);
        SFX.play("tab");
      } else if (action === "filter-updates") {
        STATE.subTab.updates = actBtn.getAttribute("data-filter") || "all";
        const vp = document.getElementById("ucpViewport");
        if (vp && STATE.view === "updates") vp.innerHTML = renderUpdatesView();
      } else if (action === "refresh-updates") {
        STATE.bootstrap = await api("/api/bootstrap");
        syncShellHeader();
        const vp = document.getElementById("ucpViewport");
        if (vp && STATE.view === "updates") vp.innerHTML = renderUpdatesView();
        toast("Lista de update-uri a fost actualizată.", "success");
      } else if (action === "rate-update") {
        if (!STATE.user) {
          toast("Autentifică-te pentru a evalua acest update.", "info");
          showLoginModal();
          return;
        }
        if (actBtn.disabled) return;
        const updateId = Number(actBtn.getAttribute("data-id"));
        const clickedStars = Number(actBtn.getAttribute("data-stars"));
        const prevRating = Number(actBtn.getAttribute("data-user-rating") || 0);
        const nextRating = clickedStars === prevRating ? 0 : clickedStars;
        const picker = actBtn.closest(".update-star-picker");
        const pickerBtns = picker ? Array.from(picker.querySelectorAll(".update-star-btn")) : [actBtn];
        pickerBtns.forEach((b) => (b.disabled = true));
        try {
          const res = await api("/api/updates/rate", {
            body: { update_id: updateId, rating: nextRating },
          });
          if (STATE.bootstrap && Array.isArray(STATE.bootstrap.updates)) {
            const targetUp = STATE.bootstrap.updates.find((u) => Number(u.id) === updateId);
            if (targetUp) {
              targetUp.rating_avg = res.rating_avg;
              targetUp.rating_count = res.rating_count;
              targetUp.user_rating = res.user_rating;
            }
          }
          const vp = document.getElementById("ucpViewport");
          if (vp && STATE.view === "updates") vp.innerHTML = renderUpdatesView();
          if (nextRating === 0) {
            SFX.play("back");
            toast(res.message, "info");
          } else {
            toast(res.message, "success");
          }
        } finally {
          pickerBtns.forEach((b) => (b.disabled = false));
        }
      } else if (action === "logout") {
        const res = await api("/api/logout", { method: "POST", body: {} });
        STATE.csrf = "";
        localStorage.removeItem("lupmax_ucp_csrf");
        STATE.bootstrap = await api("/api/bootstrap");
        syncShellHeader();
        toast(res.message, "success");
        navigateTo("dashboard");
      } else if (action === "view-player") {
        const pName = actBtn.getAttribute("data-player");
        STATE.activeProfileName = pName;
        STATE.subTab.profile = "overview";
        navigateTo("profile", { player: pName });
      } else if (action === "filter-players") {
        await loadAndRenderPlayers({ role: actBtn.getAttribute("data-role") });
      } else if (action === "run-directory-search") {
        const inp = document.getElementById("directorySearchInput");
        await loadAndRenderPlayers({ q: inp ? inp.value : "" });
      } else if (action === "select-faction") {
        await loadAndRenderFactions(actBtn.getAttribute("data-id"));
      } else if (action === "modal-apply-faction") {
        showApplyFactionModal(actBtn.getAttribute("data-fid"));
      } else if (action === "modal-apply-leader") {
        showApplyLeaderModal(actBtn.getAttribute("data-fid"), actBtn.getAttribute("data-fname") || "");
      } else if (action === "toggle-leader-app") {
        const res = await api("/api/leader-applications/toggle", {
          body: {
            factionid: Number(actBtn.getAttribute("data-fid")),
            open: Number(actBtn.getAttribute("data-open")) === 1,
            min_level: Number(actBtn.getAttribute("data-minlvl") || 10),
            min_hours: Number(actBtn.getAttribute("data-minhrs") || 20),
          },
        });
        toast(res.message, "success");
        STATE.bootstrap = await api("/api/bootstrap");
        syncShellHeader();
        await loadAndRenderFactions(STATE.activeFactionId);
      } else if (action === "review-leader-app") {
        const st = Number(actBtn.getAttribute("data-status"));
        const res = await api("/api/leader-applications/review", {
          body: {
            id: Number(actBtn.getAttribute("data-id")),
            status: st,
            note: st === 2 ? "Aprobat & numit Lider din UCP" : st === 1 ? "Invitat la interviu pe Discord/Joc" : "Respins de Manager Lideri",
          },
        });
        toast(res.message, "success");
        STATE.bootstrap = await api("/api/bootstrap");
        syncShellHeader();
        await loadAndRenderFactions(STATE.activeFactionId);
      } else if (action === "manage-panelaction") {
        const res = await api("/api/admin/panelactions/manage", {
          body: {
            id: Number(actBtn.getAttribute("data-id")),
            op: actBtn.getAttribute("data-op"),
          },
        });
        toast(res.message, "success");
        STATE.bootstrap = await api("/api/bootstrap");
        syncShellHeader();
        if (STATE.view === "admin") await loadAndRenderAdmin();
      } else if (action === "refresh-live-view") {
        STATE.bootstrap = await api("/api/bootstrap");
        syncShellHeader();
        if (STATE.view === "complaints") await loadAndRenderComplaints();
        else if (STATE.view === "tickets") await loadAndRenderTickets();
        else if (STATE.view === "admin") await loadAndRenderAdmin();
        else if (STATE.view === "factions") await loadAndRenderFactions(STATE.activeFactionId);
        toast("Datele au fost actualizate live din MySQL.", "success");
      } else if (action === "review-app") {
        const res = await api("/api/applications/review", {
          body: { id: Number(actBtn.getAttribute("data-id")), status: Number(actBtn.getAttribute("data-status")), reason: "UCP" },
        });
        toast(res.message, "success");
        await loadAndRenderFactions(STATE.activeFactionId);
      } else if (action === "modal-leader-member") {
        const fid = Number(actBtn.getAttribute("data-fid"));
        const uid = Number(actBtn.getAttribute("data-uid"));
        const name = actBtn.getAttribute("data-name");
        const rank = Number(actBtn.getAttribute("data-rank"));
        openModal(
          `Acțiuni Lider — ${name}`,
          `
          <form id="leaderMemberForm" data-fid="${fid}" data-uid="${uid}">
            <div class="form-group">
              <label class="form-label">Operațiune</label>
              <select class="form-control" name="operation">
                <option value="rank">Modifică Rank (1 - 6)</option>
                <option value="fwarn_add">Acordă +1 Faction Warn (FW)</option>
                <option value="fwarn_clear">Șterge -1 Faction Warn (FW)</option>
                <option value="reset_raport">Resetează Raport Activitate</option>
                <option value="uninvite">Demite din Facțiune (Uninvite)</option>
              </select>
            </div>
            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Rank (1-6)</label>
                <input type="number" class="form-control" name="rank" min="1" max="6" value="${Math.min(6, rank)}" />
              </div>
              <div class="form-group">
                <label class="form-label">Faction Punish la Demitere (0-60 FP)</label>
                <input type="number" class="form-control" name="fpunish" min="0" max="60" value="0" />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Motiv</label>
              <input type="text" class="form-control" name="reason" value="Regulament intern" required />
            </div>
            <button type="submit" class="btn btn-primary btn-block">Aplică</button>
          </form>
          `
        );
      } else if (action === "quick-reset-raport") {
        const fid = Number(actBtn.getAttribute("data-fid"));
        const uid = Number(actBtn.getAttribute("data-uid"));
        const res = await api("/api/leader/member", {
          body: { factionid: fid, playerid: uid, operation: "reset_raport", reason: "Reset raport saptamanal" },
        });
        toast(res.message, "success");
        await loadAndRenderFactions(fid);
      } else if (action === "reset-all-raport") {
        const fid = Number(actBtn.getAttribute("data-fid"));
        const res = await api("/api/leader/reset-all-raport", {
          body: { factionid: fid },
        });
        toast(res.message, "success");
        await loadAndRenderFactions(fid);
      } else if (action === "select-eco-pin") {
        STATE.selectedEcoPin = actBtn.getAttribute("data-pin");
        const vp = document.getElementById("ucpViewport");
        if (vp && STATE.cachedEconomy) vp.innerHTML = renderEconomyHTML(STATE.cachedEconomy);
      } else if (action === "filter-eco-map") {
        STATE.subTab.ecoMapFilter = actBtn.getAttribute("data-filter") || "all";
        const vp = document.getElementById("ucpViewport");
        if (vp && STATE.cachedEconomy) vp.innerHTML = renderEconomyHTML(STATE.cachedEconomy);
      } else if (action === "select-clan") {
        await loadAndRenderClans(actBtn.getAttribute("data-id"));
      } else if (action === "modal-edit-clan") {
        openModal(
          `Setări Clan #${actBtn.getAttribute("data-id")}`,
          `
          <form id="editClanForm" data-id="${actBtn.getAttribute("data-id")}">
            <div class="form-group">
              <label class="form-label">MOTD Clan</label>
              <input type="text" class="form-control" name="clanMOTD" value="${esc(actBtn.getAttribute("data-motd"))}" required />
            </div>
            <div class="form-group">
              <label class="form-label">Culoare HEX (6 caractere fără #, ex: FFCC99)</label>
              <input type="text" class="form-control" name="clanColor" maxlength="6" value="${esc(actBtn.getAttribute("data-color"))}" required />
            </div>
            <div class="form-group">
              <label class="form-label">Descriere Clan</label>
              <textarea class="form-control" name="clanDescription" required>${esc(actBtn.getAttribute("data-desc"))}</textarea>
            </div>
            <button type="submit" class="btn btn-primary btn-block">Salvează</button>
          </form>
          `
        );
      } else if (action === "unstuck-car") {
        const res = await api("/api/property/manage", {
          body: { kind: "car_unstuck", id: Number(actBtn.getAttribute("data-id")) },
        });
        toast(res.message, "success");
      } else if (action === "modal-edit-house") {
        openModal(
          `Configurare Casa #${actBtn.getAttribute("data-id")}`,
          `
          <form id="editHouseForm" data-id="${actBtn.getAttribute("data-id")}">
            <div class="form-group">
              <label class="form-label">Descriere Casă</label>
              <input type="text" class="form-control" name="description" value="${esc(actBtn.getAttribute("data-desc"))}" required />
            </div>
            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Preț Chirie ($1 - $100,000)</label>
                <input type="number" class="form-control" name="rent" value="${actBtn.getAttribute("data-rent")}" min="1" max="100000" required />
              </div>
              <div class="form-group">
                <label class="form-label">Acces Casă</label>
                <select class="form-control" name="locked">
                  <option value="1" ${Number(actBtn.getAttribute("data-lock")) === 1 ? "selected" : ""}>Încuiată</option>
                  <option value="0" ${Number(actBtn.getAttribute("data-lock")) === 0 ? "selected" : ""}>Descuiată</option>
                </select>
              </div>
            </div>
            <button type="submit" class="btn btn-primary btn-block">Salvează</button>
          </form>
          `
        );
      } else if (action === "modal-edit-bizz") {
        openModal(
          `Configurare Business #${actBtn.getAttribute("data-id")}`,
          `
          <form id="editBizzForm" data-id="${actBtn.getAttribute("data-id")}">
            <div class="form-group">
              <label class="form-label">Nume Afacere</label>
              <input type="text" class="form-control" name="message" value="${esc(actBtn.getAttribute("data-msg"))}" required />
            </div>
            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Taxă Intrare ($1 - $50,000)</label>
                <input type="number" class="form-control" name="fee" value="${actBtn.getAttribute("data-fee")}" min="1" max="50000" required />
              </div>
              <div class="form-group">
                <label class="form-label">Acces</label>
                <select class="form-control" name="locked">
                  <option value="0" ${Number(actBtn.getAttribute("data-lock")) === 0 ? "selected" : ""}>Deschis</option>
                  <option value="1" ${Number(actBtn.getAttribute("data-lock")) === 1 ? "selected" : ""}>Încuiat</option>
                </select>
              </div>
            </div>
            <button type="submit" class="btn btn-primary btn-block">Salvează</button>
          </form>
          `
        );
      } else if (action === "modal-edit-stock") {
        openModal(
          `Editare Dealership — ${actBtn.getAttribute("data-car")}`,
          `
          <form id="editStockForm" data-id="${actBtn.getAttribute("data-id")}">
            <div class="form-group">
              <label class="form-label">Preț Dealership ($)</label>
              <input type="number" class="form-control" name="price" value="${actBtn.getAttribute("data-price")}" min="1000" required />
            </div>
            <div class="form-group">
              <label class="form-label">Stoc Disponibil</label>
              <input type="number" class="form-control" name="stock" value="${actBtn.getAttribute("data-stock")}" min="0" max="1000" required />
            </div>
            <button type="submit" class="btn btn-primary btn-block">Salvează</button>
          </form>
          `
        );
      } else if (action === "modal-donation") {
        if (!STATE.user) return showLoginModal();
        openModal(
          "Înregistrare Donație",
          `
          <form id="createDonationForm">
            <div class="form-group">
              <label class="form-label">Suma (EUR)</label>
              <input type="number" class="form-control" name="sum" min="1" max="500" value="10" required />
            </div>
            <div class="form-group">
              <label class="form-label">Cod PIN / Referință (4 - 19 caractere)</label>
              <input type="text" class="form-control" name="pin" minlength="4" maxlength="19" placeholder="XXXX-XXXX-XXXX-XXXX" required />
            </div>
            <button type="submit" class="btn btn-primary btn-block">Trimite spre Verificare</button>
          </form>
          `
        );
      } else if (action === "review-donation") {
        const st = Number(actBtn.getAttribute("data-status"));
        const eur = Number(actBtn.getAttribute("data-sum") || 0);
        const res = await api("/api/donations/review", {
          body: { id: Number(actBtn.getAttribute("data-id")), status: st, pp: st === 1 ? Math.max(50, eur * 40) : 0 },
        });
        toast(res.message, "success");
        await loadAndRenderShop();
      } else if (action === "modal-complaint") {
        showComplaintModal(actBtn.getAttribute("data-target") || "");
      } else if (action === "open-complaint-thread") {
        await showComplaintThreadModal(actBtn.getAttribute("data-id"));
      } else if (action === "modal-ticket") {
        showTicketModal();
      } else if (action === "open-ticket-thread") {
        await showTicketThreadModal(actBtn.getAttribute("data-id"));
      } else if (action === "toggle-ticket-status") {
        const res = await api("/api/tickets/status", {
          body: { id: Number(actBtn.getAttribute("data-id")), status: Number(actBtn.getAttribute("data-status")) },
        });
        toast(res.message, "success");
        closeModal();
        await loadAndRenderTickets();
      } else if (action === "modal-unban") {
        showUnbanModal();
      } else if (action === "open-unban-thread") {
        await showUnbanThreadModal(actBtn.getAttribute("data-id"));
      } else if (action === "resolve-unban") {
        const res = await api("/api/unban/resolve", {
          body: {
            id: Number(actBtn.getAttribute("data-id")),
            status: Number(actBtn.getAttribute("data-status")),
            note: "Soluționat de Staff din UCP.",
          },
        });
        toast(res.message, "success");
        closeModal();
        await loadAndRenderBans();
      } else if (action === "quick-unban") {
        const pName = actBtn.getAttribute("data-player");
        const res = await api("/api/admin/unban", { body: { player: pName, reason: "Unban din UCP Banlist" } });
        toast(res.message, "success");
        await loadAndRenderBans();
      } else if (action === "mark-emails-read") {
        const res = await api("/api/account/emails/read", { body: {} });
        toast(res.message, "success");
        STATE.bootstrap = await api("/api/bootstrap");
        syncShellHeader();
        await loadAndRenderSecurity();
      } else if (action === "revoke-other-sessions") {
        const res = await api("/api/account/sessions/revoke", { body: {} });
        toast(res.message, "success");
        await loadAndRenderSecurity();
      } else if (action === "modal-sanction") {
        const tName = actBtn.getAttribute("data-target") || "";
        openModal(
          `Acțiune Admin — ${tName}`,
          `
          <form id="modalQuickSanctionForm">
            <input type="hidden" name="player" value="${esc(tName)}" />
            <div class="form-group">
              <label class="form-label">Tip Acțiune (panelactions 1..10)</label>
              <select class="form-control" name="action">
                <option value="4">[4] Warn (+1 Avertisment)</option>
                <option value="3">[3] Admin Jail (Minute)</option>
                <option value="5">[5] Mute (Minute)</option>
                <option value="1">[1] Ban Temporar (Zile)</option>
                <option value="2">[2] Ban Permanent</option>
                <option value="10">[10] Kick Live din Joc</option>
                <option value="6">[6] Acordă Bani ($)</option>
                <option value="7">[7] Acordă Puncte Premium (PP)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Durată / Valoare (0 pt. Warn/PermBan/Kick)</label>
              <input type="number" class="form-control" name="duration" value="30" min="0" />
            </div>
            <div class="form-group">
              <label class="form-label">Motiv</label>
              <input type="text" class="form-control" name="reason" value="Regulament Server" required />
            </div>
            <button type="submit" class="btn btn-crimson btn-block">Execută</button>
          </form>
          `
        );
      } else if (action === "switch-admin-log") {
        await loadAndRenderAdmin(actBtn.getAttribute("data-logtype"));
      } else if (action === "filter-admin-logs") {
        const inp = document.getElementById("adminLogFilterInput");
        await loadAndRenderAdmin(actBtn.getAttribute("data-logtype"), inp ? inp.value : "");
      } else if (action === "filter-car-market") {
        STATE.subTab.marketFilter = actBtn.getAttribute("data-filter") || "active";
        const vp = document.getElementById("ucpViewport");
        if (vp && STATE.cachedEconomy) {
          vp.innerHTML = renderEconomyHTML(STATE.cachedEconomy);
        }
      } else if (action === "modal-list-car") {
        if (!STATE.user) return showLoginModal();
        if (!STATE.cachedEconomy) {
          STATE.cachedEconomy = await api("/api/economy");
        }
        const myCars = (STATE.cachedEconomy.my_cars || []).filter((c) => !c.AlreadyListed);
        if (!myCars.length) {
          toast("Nu ai niciun vehicul personal disponibil (sau toate sunt deja listate pe Piața Auto).", "warn");
          return;
        }
        const carOpts = myCars
          .map(
            (c) =>
              `<option value="${c.ID}">#${c.ID} — ${esc(c.ModelName)} (${esc(c.License || "LS")} • ${fmtNum(Math.round(Number(c.KM || 0)))} KM • Valoare: ${fmtMoney(c.Value)})</option>`
          )
          .join("");
        openModal(
          "Listează Vehicul Personal pe Piața Auto Online",
          `
          <form id="listCarMarketForm">
            <div class="form-group">
              <label class="form-label">Selectează Vehiculul Personal</label>
              <select class="form-control" name="car_id" required>
                ${carOpts}
              </select>
            </div>
            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Preț Buyout / Cumpărare Instant ($)</label>
                <input type="number" class="form-control" name="buyout_price" value="15000000" min="50000" max="2000000000" required />
              </div>
              <div class="form-group">
                <label class="form-label">Preț Pornire Licitație ($)</label>
                <input type="number" class="form-control" name="min_bid" value="9000000" min="25000" max="2000000000" required />
              </div>
            </div>
            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Durată Licitație</label>
                <select class="form-control" name="hours">
                  <option value="12">12 Ore</option>
                  <option value="24" selected>24 Ore</option>
                  <option value="48">48 Ore</option>
                  <option value="72">72 Ore (3 Zile)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Notă / Descriere Scurtă</label>
                <input type="text" class="form-control" name="note" maxlength="140" placeholder="Ex: VIP, culori rare, rulaj mic..." />
              </div>
            </div>
            <button type="submit" class="btn btn-amber btn-block">Publică Anunțul în Piața Auto</button>
          </form>
          `
        );
      } else if (action === "market-buy-car") {
        if (!STATE.user) return showLoginModal();
        const lid = Number(actBtn.getAttribute("data-id"));
        const res = await api("/api/market/buy", { body: { listing_id: lid } });
        toast(res.message, "success");
        STATE.bootstrap = await api("/api/bootstrap");
        syncShellHeader();
        STATE.cachedEconomy = await api("/api/economy");
        const vp = document.getElementById("ucpViewport");
        if (vp && STATE.view === "economy") vp.innerHTML = renderEconomyHTML(STATE.cachedEconomy);
      } else if (action === "modal-bid-car") {
        if (!STATE.user) return showLoginModal();
        const lid = Number(actBtn.getAttribute("data-id"));
        const carName = actBtn.getAttribute("data-car") || "Vehicul";
        const minBid = Number(actBtn.getAttribute("data-min") || 50000);
        const buyout = Number(actBtn.getAttribute("data-buyout") || 1000000);
        openModal(
          `Plasează Ofertă Licitație — ${carName}`,
          `
          <form id="bidCarMarketForm" data-id="${lid}">
            <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:12px">
              Soldul tău Maze Bank: <strong class="gta-money-hud">${fmtMoney(STATE.user.Bank)}</strong> &middot;
              Preț Buyout: <strong style="color:var(--gta-cash)">${fmtMoney(buyout)}</strong>
            </div>
            <div class="form-group">
              <label class="form-label">Suma Licitației ($ — minim ${fmtMoney(minBid)})</label>
              <input type="number" class="form-control" name="bid_amount" value="${minBid}" min="${minBid}" max="${buyout}" required />
            </div>
            <div style="font-size:11.5px;color:var(--text-muted);margin-bottom:12px">
              Suma licitată este blocată în siguranță (escrow) din contul tău bancar și îți este returnată automat dacă alt jucător plasează o ofertă mai mare.
            </div>
            <button type="submit" class="btn btn-amber btn-block">Confirmă Oferta în Licitație</button>
          </form>
          `
        );
      } else if (action === "market-accept-bid") {
        const lid = Number(actBtn.getAttribute("data-id"));
        const res = await api("/api/market/accept-bid", { body: { listing_id: lid } });
        toast(res.message, "success");
        STATE.bootstrap = await api("/api/bootstrap");
        syncShellHeader();
        STATE.cachedEconomy = await api("/api/economy");
        const vp = document.getElementById("ucpViewport");
        if (vp && STATE.view === "economy") vp.innerHTML = renderEconomyHTML(STATE.cachedEconomy);
      } else if (action === "market-cancel-listing") {
        const lid = Number(actBtn.getAttribute("data-id"));
        const res = await api("/api/market/cancel", { body: { listing_id: lid } });
        toast(res.message, "success");
        STATE.cachedEconomy = await api("/api/economy");
        const vp = document.getElementById("ucpViewport");
        if (vp && STATE.view === "economy") vp.innerHTML = renderEconomyHTML(STATE.cachedEconomy);
      }
    } catch (err) {
      toast(err.message, "error");
    }
  });

  // --------------------------------------------------------------------------
  // 23. GLOBAL FORM SUBMISSION HANDLER
  // --------------------------------------------------------------------------
  document.addEventListener("submit", async (e) => {
    const form = e.target;
    if (!form || !form.id) return;
    e.preventDefault();
    const fd = new FormData(form);

    try {
      if (form.id === "ucpLoginForm") {
        const res = await api("/api/login", {
          body: {
            name: fd.get("name"),
            password: fd.get("password"),
            fingerprint: STATE.fingerprint,
          },
        });
        STATE.csrf = res.csrf || "";
        localStorage.setItem("lupmax_ucp_csrf", STATE.csrf);
        STATE.bootstrap = res.bootstrap;
        syncShellHeader();
        closeModal();
        toast(`Autentificat ca ${STATE.bootstrap.user.name}.`, "success");
        navigateTo(STATE.view);
      } else if (form.id === "factionApplyForm") {
        const fid = Number(form.getAttribute("data-fid"));
        const answers = Array.from(form.querySelectorAll(".faction-app-answer")).map((el) => el.value || "");
        const res = await api("/api/applications/create", { body: { factionid: fid, answers } });
        toast(res.message, "success");
        closeModal();
        STATE.bootstrap = await api("/api/bootstrap");
        syncShellHeader();
        await loadAndRenderFactions(fid);
      } else if (form.id === "leaderApplyForm") {
        const fid = Number(form.getAttribute("data-fid"));
        const res = await api("/api/leader-applications/create", {
          body: {
            factionid: fid,
            real_name: fd.get("real_name"),
            age: Number(fd.get("age")),
            activity: fd.get("activity"),
            experience: fd.get("experience"),
            plan: fd.get("plan"),
          },
        });
        toast(res.message, "success");
        closeModal();
        STATE.subTab.factions = "leader_apps";
        STATE.bootstrap = await api("/api/bootstrap");
        syncShellHeader();
        await loadAndRenderFactions(fid);
      } else if (form.id === "leaderSettingsForm") {
        const fid = Number(form.getAttribute("data-fid"));
        const Ranks = {};
        form.querySelectorAll(".leader-rank-input").forEach((el) => {
          Ranks[el.getAttribute("data-rank")] = el.value;
        });
        const Questions = Array.from(form.querySelectorAll(".leader-q-input")).map((el) => el.value);
        const res = await api("/api/leader/settings", {
          body: {
            factionid: fid,
            MinLevel: Number(fd.get("MinLevel")),
            Application: Number(fd.get("Application")) === 1,
            Anunt: fd.get("Anunt"),
            Ranks,
            Questions,
          },
        });
        toast(res.message, "success");
        STATE.bootstrap = await api("/api/bootstrap");
        await loadAndRenderFactions(fid);
      } else if (form.id === "leaderMemberForm") {
        const fid = Number(form.getAttribute("data-fid"));
        const uid = Number(form.getAttribute("data-uid"));
        const res = await api("/api/leader/member", {
          body: {
            factionid: fid,
            playerid: uid,
            operation: fd.get("operation"),
            rank: Number(fd.get("rank")),
            fpunish: Number(fd.get("fpunish")),
            reason: fd.get("reason"),
          },
        });
        toast(res.message, "success");
        closeModal();
        await loadAndRenderFactions(fid);
      } else if (form.id === "editClanForm") {
        const cid = Number(form.getAttribute("data-id"));
        const res = await api("/api/clan/manage", {
          body: {
            clanID: cid,
            clanMOTD: fd.get("clanMOTD"),
            clanColor: fd.get("clanColor"),
            clanDescription: fd.get("clanDescription"),
          },
        });
        toast(res.message, "success");
        closeModal();
        await loadAndRenderClans(cid);
      } else if (form.id === "editHouseForm") {
        const hid = Number(form.getAttribute("data-id"));
        const res = await api("/api/property/manage", {
          body: {
            kind: "house",
            id: hid,
            description: fd.get("description"),
            rent: Number(fd.get("rent")),
            rentabil: true,
            locked: Number(fd.get("locked")) === 1,
          },
        });
        toast(res.message, "success");
        closeModal();
        await loadAndRenderProfile(STATE.activeProfileName);
      } else if (form.id === "editBizzForm") {
        const bid = Number(form.getAttribute("data-id"));
        const res = await api("/api/property/manage", {
          body: {
            kind: "bizz",
            id: bid,
            message: fd.get("message"),
            fee: Number(fd.get("fee")),
            locked: Number(fd.get("locked")) === 1,
          },
        });
        toast(res.message, "success");
        closeModal();
        await loadAndRenderProfile(STATE.activeProfileName);
      } else if (form.id === "editStockForm") {
        const sid = Number(form.getAttribute("data-id"));
        const res = await api("/api/admin/server-manage", {
          body: {
            op: "edit_stock",
            id: sid,
            price: Number(fd.get("price")),
            stock: Number(fd.get("stock")),
          },
        });
        toast(res.message, "success");
        closeModal();
        STATE.cachedEconomy = null;
        await loadAndRenderEconomy();
      } else if (form.id === "createDonationForm") {
        const res = await api("/api/donations/create", {
          body: { sum: Number(fd.get("sum")), pin: fd.get("pin") },
        });
        toast(res.message, "success");
        closeModal();
        await loadAndRenderShop();
      } else if (form.id === "createComplaintForm") {
        const res = await api("/api/complaints/create", {
          body: {
            player: fd.get("player"),
            category: Number(fd.get("category")),
            evidence: fd.get("evidence"),
            details: fd.get("details"),
          },
        });
        toast(res.message, "success");
        closeModal();
        STATE.bootstrap = await api("/api/bootstrap");
        syncShellHeader();
        navigateTo("complaints");
      } else if (form.id === "replyComplaintForm") {
        const cid = Number(form.getAttribute("data-id"));
        const res = await api("/api/complaints/reply", {
          body: { id: cid, text: fd.get("text") },
        });
        toast(res.message, "success");
        await showComplaintThreadModal(cid);
      } else if (form.id === "resolveComplaintForm") {
        const cid = Number(form.getAttribute("data-id"));
        const sAct = Number(fd.get("sanction_action"));
        const res = await api("/api/complaints/resolve", {
          body: {
            id: cid,
            status: 1,
            verdict: fd.get("verdict"),
            apply_sanction: sAct > 0,
            sanction_action: sAct,
            sanction_duration: Number(fd.get("sanction_duration")),
            sanction_reason: `Reclamatie #${cid}`,
          },
        });
        toast(res.message, "success");
        closeModal();
        STATE.bootstrap = await api("/api/bootstrap");
        syncShellHeader();
        await loadAndRenderComplaints();
      } else if (form.id === "createTicketForm") {
        const res = await api("/api/tickets/create", {
          body: {
            type: Number(fd.get("type")),
            title: fd.get("title"),
            body: fd.get("body"),
          },
        });
        toast(res.message, "success");
        closeModal();
        STATE.bootstrap = await api("/api/bootstrap");
        syncShellHeader();
        navigateTo("tickets");
      } else if (form.id === "replyTicketForm") {
        const tid = Number(form.getAttribute("data-id"));
        const res = await api("/api/tickets/reply", {
          body: { id: tid, text: fd.get("text") },
        });
        toast(res.message, "success");
        await showTicketThreadModal(tid);
      } else if (form.id === "createUnbanForm") {
        const res = await api("/api/unban/create", {
          body: { details: fd.get("details"), evidence: fd.get("evidence") },
        });
        toast(res.message, "success");
        closeModal();
        await loadAndRenderBans();
      } else if (form.id === "replyUnbanForm") {
        const rid = Number(form.getAttribute("data-id"));
        const res = await api("/api/unban/reply", {
          body: { id: rid, text: fd.get("text") },
        });
        toast(res.message, "success");
        await showUnbanThreadModal(rid);
      } else if (form.id === "changePasswordForm") {
        const res = await api("/api/account/password", {
          body: {
            current_password: fd.get("current_password"),
            new_password: fd.get("new_password"),
          },
        });
        toast(res.message, "success");
        form.reset();
      } else if (form.id === "changePinForm") {
        const res = await api("/api/account/pin", {
          body: {
            email: fd.get("email"),
            pin: fd.get("pin"),
            password: fd.get("password"),
          },
        });
        toast(res.message, "success");
      } else if (form.id === "adminSanctionForm" || form.id === "modalQuickSanctionForm") {
        const res = await api("/api/admin/sanction", {
          body: {
            player: fd.get("player"),
            action: Number(fd.get("action")),
            duration: Number(fd.get("duration") || 0),
            dm: Number(fd.get("dm") || 0),
            reason: fd.get("reason"),
          },
        });
        toast(res.message, "success");
        if (form.id === "modalQuickSanctionForm") closeModal();
        if (STATE.view === "admin") await loadAndRenderAdmin();
        if (STATE.view === "profile") await loadAndRenderProfile(STATE.activeProfileName);
      } else if (form.id === "adminRolesForm") {
        const res = await api("/api/admin/player-roles", {
          body: {
            player: fd.get("player"),
            op: fd.get("op"),
            factionid: Number(fd.get("factionid") || 0),
            days: Number(fd.get("days") || 0),
            column: fd.get("column"),
          },
        });
        toast(res.message, "success");
        STATE.bootstrap = await api("/api/bootstrap");
        syncShellHeader();
        if (STATE.view === "admin") await loadAndRenderAdmin();
      } else if (form.id === "adminQuickUnbanForm") {
        const res = await api("/api/admin/unban", {
          body: {
            player: fd.get("player"),
            reason: fd.get("reason") || "Unban din Admin Panel UCP",
          },
        });
        toast(res.message, "success");
        form.reset();
        STATE.bootstrap = await api("/api/bootstrap");
        syncShellHeader();
        if (STATE.view === "admin") await loadAndRenderAdmin();
      } else if (form.id === "adminPostUpdateForm" || form.id === "updatesPagePostForm") {
        const allowCheckbox = form.querySelector('input[name="allow_rating"]');
        const allowRating = allowCheckbox ? Boolean(allowCheckbox.checked) : true;
        const res = await api("/api/admin/server-manage", {
          body: {
            op: "post_update",
            text: fd.get("text"),
            for_type: Number(fd.get("for_type") || 0),
            allow_rating: allowRating,
          },
        });
        toast(res.message, "success");
        form.reset();
        STATE.bootstrap = await api("/api/bootstrap");
        syncShellHeader();
        if (STATE.view === "updates") {
          const vp = document.getElementById("ucpViewport");
          if (vp) vp.innerHTML = renderUpdatesView();
        }
      } else if (form.id === "listCarMarketForm") {
        const res = await api("/api/market/list", {
          body: {
            car_id: Number(fd.get("car_id")),
            buyout_price: Number(fd.get("buyout_price")),
            min_bid: Number(fd.get("min_bid")),
            hours: Number(fd.get("hours") || 24),
            note: fd.get("note") || "",
          },
        });
        toast(res.message, "success");
        closeModal();
        STATE.cachedEconomy = await api("/api/economy");
        const vp = document.getElementById("ucpViewport");
        if (vp && STATE.view === "economy") vp.innerHTML = renderEconomyHTML(STATE.cachedEconomy);
      } else if (form.id === "customizeProfileForm") {
        const res = await api("/api/profile/customize", {
          body: {
            banner_preset: fd.get("banner_preset") || "midnight_wolf",
            banner_url: (fd.get("banner_url") || "").trim(),
            accent_color: (fd.get("accent_color") || "").trim(),
            custom_title: (fd.get("custom_title") || "").trim(),
            bio: (fd.get("bio") || "").trim(),
            discord_tag: (fd.get("discord_tag") || "").trim(),
            showcase_badge: fd.get("showcase_badge") || "wolf_pack",
          },
        });
        toast(res.message, "success");
        closeModal();
        if (STATE.user) {
          STATE.activeProfileName = STATE.user.name;
          await navigateTo("profile", { player: STATE.user.name });
        }
      } else if (form.id === "bidCarMarketForm") {
        const lid = Number(form.getAttribute("data-id"));
        const res = await api("/api/market/bid", {
          body: {
            listing_id: lid,
            bid_amount: Number(fd.get("bid_amount")),
          },
        });
        toast(res.message, "success");
        closeModal();
        STATE.bootstrap = await api("/api/bootstrap");
        syncShellHeader();
        STATE.cachedEconomy = await api("/api/economy");
        const vp = document.getElementById("ucpViewport");
        if (vp && STATE.view === "economy") vp.innerHTML = renderEconomyHTML(STATE.cachedEconomy);
      }
    } catch (err) {
      toast(err.message, "error");
    }
  });

  // --------------------------------------------------------------------------
  // 24. TOPBAR LIVE SEARCH (5-10 DESCENDING RESULTS) & INITIAL BOOTSTRAP
  // --------------------------------------------------------------------------
  async function initUCP() {
    const mobileBtn = document.getElementById("mobileMenuBtn");
    const sidebar = document.getElementById("ucpSidebar");
    if (mobileBtn && sidebar) {
      mobileBtn.addEventListener("click", () => sidebar.classList.toggle("sidebar-open"));
    }

    const searchWrap = document.getElementById("globalSearchWrap");
    const searchInput = document.getElementById("globalPlayerSearch");
    const searchBtn = document.getElementById("globalSearchBtn");
    const searchDropdown = document.getElementById("globalSearchDropdown");
    let globalSearchTimer = null;
    let dashSearchTimer = null;
    let dirSearchTimer = null;
    let lastGlobalResults = [];

    const closeGlobalDropdown = () => {
      if (searchDropdown) searchDropdown.classList.add("hidden");
    };

    const renderGlobalDropdown = (results, queryText) => {
      if (!searchDropdown) return;
      lastGlobalResults = results || [];
      const headerLabel = queryText
        ? `Rezultate pentru "${esc(queryText)}" (${lastGlobalResults.length} descrescător)`
        : `Top ${lastGlobalResults.length} Jucători (Nivel & Ore descrescător)`;
      searchDropdown.innerHTML = `
        <div class="search-dropdown-header">
          <span>${headerLabel}</span>
          <span>5-10 max</span>
        </div>
        ${renderPlayerSearchItemsHTML(lastGlobalResults, 8)}
      `;
      searchDropdown.classList.remove("hidden");
    };

    const fetchGlobalSuggestions = async (qText) => {
      try {
        const qs = new URLSearchParams({ q: qText, limit: "8" }).toString();
        const res = await api(`/api/players/search?${qs}`);
        renderGlobalDropdown(res.results || [], qText);
      } catch (_) {
        // Ignore transient search errors
      }
    };

    const runGlobalSearch = () => {
      if (!searchInput) return;
      const val = searchInput.value.trim();
      if (!val) {
        if (lastGlobalResults.length > 0) {
          const topName = lastGlobalResults[0].name;
          closeGlobalDropdown();
          STATE.activeProfileName = topName;
          STATE.subTab.profile = "overview";
          navigateTo("profile", { player: topName });
        }
        return;
      }
      const targetName = lastGlobalResults.length > 0 ? lastGlobalResults[0].name : val;
      closeGlobalDropdown();
      STATE.activeProfileName = targetName;
      STATE.subTab.profile = "overview";
      navigateTo("profile", { player: targetName });
    };

    if (searchBtn) searchBtn.addEventListener("click", runGlobalSearch);
    if (searchInput) {
      searchInput.addEventListener("focus", () => {
        const qVal = searchInput.value.trim();
        if (!qVal && STATE.bootstrap && (STATE.bootstrap.top_players || STATE.bootstrap.online_players)) {
          renderGlobalDropdown((STATE.bootstrap.top_players || STATE.bootstrap.online_players).slice(0, 8), "");
        } else {
          fetchGlobalSuggestions(qVal);
        }
      });

      searchInput.addEventListener("input", () => {
        clearTimeout(globalSearchTimer);
        const qVal = searchInput.value.trim();
        globalSearchTimer = setTimeout(() => {
          fetchGlobalSuggestions(qVal);
        }, 120);
      });

      searchInput.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") {
          closeGlobalDropdown();
        } else if (ev.key === "Enter") {
          ev.preventDefault();
          runGlobalSearch();
        }
      });
    }

    document.addEventListener("click", (ev) => {
      if (searchWrap && !searchWrap.contains(ev.target)) {
        closeGlobalDropdown();
      }
      if (ev.target.closest("[data-action='view-player']")) {
        closeGlobalDropdown();
        closeAllNavDropdowns();
      }
      if (!ev.target.closest(".nav-dropdown")) {
        closeAllNavDropdowns();
      }
      const themeAnchor = document.getElementById("themeSwitcherAnchor");
      if (themeAnchor && !themeAnchor.contains(ev.target)) {
        setThemeMixerOpen(false);
      }
    });

    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        setThemeMixerOpen(false);
        closeAllNavDropdowns();
      }
    });

    // Delegated live search & live Theme Color Mixer inputs
    document.addEventListener("input", (ev) => {
      const target = ev.target;
      if (!target) return;

      if (target.id === "studioAccentPicker") {
        const hexEl = document.getElementById("studioAccentHexInput");
        if (hexEl) hexEl.value = target.value;
      } else if (target.id === "studioAccentHexInput") {
        const pickEl = document.getElementById("studioAccentPicker");
        if (pickEl && /^#[0-9a-fA-F]{6}$/.test(target.value.trim())) {
          pickEl.value = target.value.trim();
        }
      } else if (target.id === "mixColor1Input") {
        updateCustomMix({ c1: target.value }, true);
      } else if (target.id === "mixColor2Input") {
        updateCustomMix({ c2: target.value }, true);
      } else if (target.id === "mixRatioRange") {
        updateCustomMix({ ratio: Number(target.value) }, true);
      } else if (target.id === "dashboardPlayerSearch") {
        clearTimeout(dashSearchTimer);
        const qVal = target.value.trim();
        dashSearchTimer = setTimeout(async () => {
          try {
            const qs = new URLSearchParams({ q: qVal, limit: "8" }).toString();
            const res = await api(`/api/players/search?${qs}`);
            const box = document.getElementById("dashboardSearchResults");
            const lbl = document.getElementById("dashSearchStatusLabel");
            const list = res.results || [];
            if (box) box.innerHTML = renderPlayerSearchItemsHTML(list, 8);
            if (lbl) {
              lbl.textContent = qVal
                ? `${list.length} rezultate găsite pentru "${qVal}" (ordonate descrescător)`
                : `Top ${list.length} jucători (ordonat descrescător după nivel și ore)`;
            }
          } catch (_) { }
        }, 120);
      } else if (target.id === "directorySearchInput") {
        clearTimeout(dirSearchTimer);
        const qVal = target.value.trim();
        dirSearchTimer = setTimeout(() => {
          loadAndRenderPlayers({ q: qVal, onlyTable: true });
        }, 140);
      }
    });

    applyTheme(STATE.theme, false);
    SFX.syncButton();
    const audioBtn = document.getElementById("topbarAudioBtn");
    if (audioBtn) {
      audioBtn.addEventListener("click", () => {
        SFX.toggle();
      });
    }

    const refreshBtn = document.getElementById("topbarRefreshBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", async () => {
        try {
          STATE.cachedLeaderboards = null;
          STATE.cachedEconomy = null;
          STATE.bootstrap = await api("/api/bootstrap");
          syncShellHeader();
          await navigateTo(STATE.view);
          toast("Datele au fost reîncărcate.", "success");
        } catch (err) {
          toast(err.message, "error");
        }
      });
    }

    try {
      if (window.location.hash && window.history && window.history.replaceState) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      STATE.bootstrap = await api("/api/bootstrap");
      syncShellHeader();
      const urlPlayer = new URLSearchParams(window.location.search).get("player");
      if (urlPlayer && urlPlayer.trim()) {
        STATE.activeProfileName = urlPlayer.trim();
        await navigateTo("profile", { player: urlPlayer.trim() });
      } else {
        await navigateTo("dashboard");
      }

      // Gentle 15-second live sync for Complaints, Tickets, and Admin Queue (skipped when typing or modal open)
      setInterval(async () => {
        try {
          if (document.hidden) return;
          const modalEl = document.getElementById("ucpModalBackdrop");
          if (modalEl && !modalEl.classList.contains("hidden")) return;
          const activeTag = document.activeElement ? document.activeElement.tagName : "";
          if (activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT") return;
          if (STATE.view === "complaints") {
            STATE.bootstrap = await api("/api/bootstrap");
            syncShellHeader();
            await loadAndRenderComplaints();
          } else if (STATE.view === "tickets" && STATE.user) {
            STATE.bootstrap = await api("/api/bootstrap");
            syncShellHeader();
            await loadAndRenderTickets();
          } else if (STATE.view === "admin" && STATE.user) {
            await loadAndRenderAdmin();
          }
        } catch (_) {
          // Ignore transient polling errors
        }
      }, 15000);
    } catch (err) {
      const vp = document.getElementById("ucpViewport");
      if (vp) {
        vp.innerHTML = `
          <div class="ucp-card">
            <div class="card-title">Eroare la conectarea cu Baza de Date MySQL</div>
            <p style="color:var(--text-secondary);margin-top:6px">${esc(err.message)}</p>
          </div>`;
      }
    }
  }

  document.addEventListener("DOMContentLoaded", initUCP);
})();
