(() => {
  'use strict';

  /* ---------------------------------------------------------------
   * Math helpers
   * ------------------------------------------------------------- */
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const wrap = (a) => ((a % TAU) + TAU) % TAU;
  const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; };
  const smooth = (t) => t * t * (3 - 2 * t);
  const fmt = (n) => { try { return Math.floor(n).toLocaleString(); } catch (e) { return String(Math.floor(n)); } };

  /* ---------------------------------------------------------------
   * Tuning (world units: outer orbit radius = 1)
   * ------------------------------------------------------------- */
  const RING = [0.62, 1.0];
  const PLAYER_R = 0.05, HAZ_R = 0.068, ORB_R = 0.045;
  const HIT_D = (PLAYER_R + HAZ_R) * 0.8;   // forgiving hitbox
  const NEAR_D = 0.2;                         // close-call radius
  const PICK_D = (PLAYER_R + ORB_R) * 1.25;  // generous pickup
  const SWITCH_T = 0.12;                      // seconds to hop orbits
  const WARN_T = 0.75;                        // telegraph before a hazard turns lethal
  const COMBO_WIN = 3.0;
  const MAX_LEVEL = 14;
  const SIM_STEP = 1 / 120;
  const DEATH_T = 0.7;                        // death animation before results appear on their own
  const DEATH_SKIP = 0.35;                    // after this, a tap during the death animation jumps to results
  const RESTART_GUARD = 0.3;                  // seconds before a tap can dismiss the results

  const SKINS = [
    { id: 'ion',   name: 'Ion',   hue: 188, req: 'Starter trail',          prog: () => 1 },
    { id: 'ember', name: 'Ember', hue: 22,  req: 'Score 250 in one run',   prog: (s) => s.best / 250 },
    { id: 'venom', name: 'Venom', hue: 105, req: 'Collect 200 orbs total', prog: (s) => s.orbs / 200 },
    { id: 'nova',  name: 'Nova',  hue: 318, req: 'Chain 16 orbs',          prog: (s) => s.bestCombo / 16 },
    { id: 'aurum', name: 'Aurum', hue: 46,  req: 'Finish 30 runs',         prog: (s) => s.games / 30 },
    { id: 'prism', name: 'Prism', hue: -1,  req: 'Score 1,500 in one run', prog: (s) => s.best / 1500 },
  ];
  const SKIN_IDS = new Set(SKINS.map((s) => s.id));

  /* ---------------------------------------------------------------
   * Save system: validated, versioned, multi-tab safe, works without storage
   * ------------------------------------------------------------- */
  const SAVE_KEY = 'orbita:save:v1';
  const store = (() => {
    let ls = null;
    try {
      ls = window.localStorage;
      const probe = '__orbita_probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
    } catch (e) { ls = null; }
    return {
      available: !!ls,
      read(key) { if (!ls) return null; try { return ls.getItem(key); } catch (e) { return null; } },
      write(key, v) { if (!ls) return false; try { ls.setItem(key, v); return true; } catch (e) { return false; } },
    };
  })();

  const defaults = () => ({ v: 1, best: 0, bestCombo: 0, games: 0, orbs: 0, totalScore: 0, skin: 'ion', unlocked: ['ion'], muted: false, tutorial: false });
  const num = (v) => { v = Number(v); return Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 1e12) : 0; };

  function sanitize(raw) {
    const d = defaults();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
    d.best = num(raw.best); d.bestCombo = num(raw.bestCombo); d.games = num(raw.games);
    d.orbs = num(raw.orbs); d.totalScore = num(raw.totalScore);
    d.muted = raw.muted === true; d.tutorial = raw.tutorial === true;
    if (Array.isArray(raw.unlocked)) d.unlocked = [...new Set(raw.unlocked.filter((x) => typeof x === 'string' && SKIN_IDS.has(x)))];
    if (!d.unlocked.includes('ion')) d.unlocked.unshift('ion');
    d.skin = typeof raw.skin === 'string' && d.unlocked.includes(raw.skin) ? raw.skin : 'ion';
    return d;
  }

  function readDisk() {
    const txt = store.read(SAVE_KEY);
    if (!txt) return null;
    try { return sanitize(JSON.parse(txt)); }
    catch (e) {
      // Keep a copy of unreadable data instead of silently destroying it.
      if (!store.read(SAVE_KEY + ':corrupt')) store.write(SAVE_KEY + ':corrupt', txt.slice(0, 20000));
      return null;
    }
  }

  // Two kinds of field need two merge rules when another tab has written in the meantime:
  //  - records (best, bestCombo) are peaks: merge by max;
  //  - totals (games, orbs, totalScore) are sums: merge as "disk + what this tab has not saved yet",
  //    so two tabs that each finish a run both count (max would silently drop one of them).
  // Unlocks merge by union. `pending` holds this tab's unsaved deltas and clears only after a successful write.
  const TOTALS = ['games', 'orbs', 'totalScore'];
  const pending = { games: 0, orbs: 0, totalScore: 0 };
  function mergeInto(a, b) {
    if (!b) return a;
    a.best = Math.max(a.best, b.best); a.bestCombo = Math.max(a.bestCombo, b.bestCombo);
    // max() with the local value only guards against a disk that was cleared or edited downwards.
    for (const k of TOTALS) a[k] = Math.max(a[k], b[k] + pending[k]);
    a.tutorial = a.tutorial || b.tutorial;
    for (const id of b.unlocked) if (!a.unlocked.includes(id)) a.unlocked.push(id);
    return a;
  }
  function addTotals(games, orbs, score) {
    save.games += games; save.orbs += orbs; save.totalScore += score;
    pending.games += games; pending.orbs += orbs; pending.totalScore += score;
  }

  function evaluateUnlocks(s) {
    const fresh = [];
    for (const sk of SKINS) if (!s.unlocked.includes(sk.id) && sk.prog(s) >= 1) { s.unlocked.push(sk.id); fresh.push(sk); }
    return fresh;
  }

  const save = readDisk() || defaults();
  evaluateUnlocks(save); // older or edited saves get what their stats already earned

  function persist() {
    mergeInto(save, readDisk());
    if (store.write(SAVE_KEY, JSON.stringify(save))) { pending.games = 0; pending.orbs = 0; pending.totalScore = 0; }
  }

  /* ---------------------------------------------------------------
   * Audio: procedural SFX + adaptive beat, all Web Audio, fails silent
   * ------------------------------------------------------------- */
  const audio = (() => {
    let ctx = null, master = null, sfx = null, music = null, noiseBuf = null, sfxVoices = 0, musicVoices = 0;
    let muted = save.muted;
    let playing = false, nextStep = 0, stepIdx = 0;
    const beats = [];
    // Separate budgets so a dense SFX moment can never silence the beat (and vice versa).
    const MAX_SFX_VOICES = 24, MAX_MUSIC_VOICES = 16;
    const full = (bus) => (bus === music ? musicVoices >= MAX_MUSIC_VOICES : sfxVoices >= MAX_SFX_VOICES);

    function ensure() {
      if (ctx) return ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new AC(); } catch (e2) { return null; } }
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.18;
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.85;
      master.connect(comp); comp.connect(ctx.destination);
      sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(master);
      music = ctx.createGain(); music.gain.value = 0.34; music.connect(master);
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.0), ctx.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      return ctx;
    }
    function unlock() {
      const c = ensure();
      if (c && c.state !== 'running' && !document.hidden) { try { c.resume().catch(() => {}); } catch (e) { /* ignore */ } }
    }
    const live = () => ctx && ctx.state === 'running' && !muted;

    function track(node, gain, bus) {
      const isMusic = bus === music;
      if (isMusic) musicVoices++; else sfxVoices++;
      node.onended = () => { if (isMusic) musicVoices--; else sfxVoices--; try { node.disconnect(); gain.disconnect(); } catch (e) { /* ignore */ } };
    }
    function tone(f, f2, dur, type, vol, when, bus) {
      if (!live() || full(bus)) return;
      const t = when !== undefined ? when : ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (f2 && f2 !== f) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.012, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(bus || sfx);
      o.start(t); o.stop(t + dur + 0.03);
      track(o, g, bus);
    }
    function noise(dur, vol, ftype, f1, f2, q, when, bus) {
      if (!live() || full(bus)) return;
      const t = when !== undefined ? when : ctx.currentTime;
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf;
      f.type = ftype; f.Q.value = q || 1;
      f.frequency.setValueAtTime(f1, t);
      if (f2 && f2 !== f1) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(bus || sfx);
      s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
      track(s, g, bus);
      s.addEventListener('ended', () => { try { f.disconnect(); } catch (e) { /* ignore */ } });
    }

    const PENTA = [0, 2, 4, 7, 9];
    const ROOTS = [0, -4, -2, -5];

    function scheduleStep(i, t, intensity) {
      const step = i % 16, bar = Math.floor(i / 16) % 4;
      const root = 55 * Math.pow(2, ROOTS[bar] / 12);
      if (step % 4 === 0) {
        tone(150, 42, 0.32, 'sine', 0.7, t, music);
        beats.push(t); if (beats.length > 8) beats.shift();
      }
      if (step % 4 === 2) noise(0.06, 0.16, 'highpass', 7000, 9000, 0.7, t, music);
      if (intensity > 1 && step % 2 === 1) noise(0.03, 0.06, 'highpass', 9000, 9000, 0.7, t, music);
      if (step % 8 === 0 || (intensity > 2 && step % 8 === 6)) tone(root, root, 0.34, 'triangle', 0.42, t, music);
      if (intensity > 0 && (step === 3 || step === 11 || (intensity > 2 && step === 14))) {
        const n = PENTA[(bar + step) % 5] + 24;
        tone(root * Math.pow(2, n / 12), 0, 0.22, 'sine', 0.07, t, music);
      }
    }

    return {
      unlock,
      get ready() { return !!ctx && ctx.state === 'running'; },
      get muted() { return muted; },
      setMuted(m) {
        muted = m;
        if (master && ctx) { try { master.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.03); } catch (e) { master.gain.value = m ? 0 : 0.85; } }
      },
      suspend() { if (ctx && ctx.state === 'running') { try { ctx.suspend().catch(() => {}); } catch (e) { /* ignore */ } } },
      musicStart() { playing = true; stepIdx = 0; nextStep = ctx ? ctx.currentTime + 0.08 : 0; beats.length = 0; },
      musicStop() { playing = false; },
      musicTick(bpm, intensity) {
        if (!playing || !live()) return;
        const spStep = 60 / bpm / 4;
        // After a stall (tab switch, slow frame) never fire a burst of overdue notes.
        if (nextStep < ctx.currentTime) nextStep = ctx.currentTime + 0.02;
        while (nextStep < ctx.currentTime + 0.12) { scheduleStep(stepIdx, nextStep, intensity); nextStep += spStep; stepIdx++; }
      },
      // 0..1 kick envelope for visuals; null if audio is not driving the beat.
      pulse() {
        if (!live() || !playing) return null;
        const now = ctx.currentTime; let lastT = -1;
        for (const b of beats) if (b <= now) lastT = b;
        return lastT < 0 ? 0 : Math.exp(-(now - lastT) * 7);
      },
      hop(lane) { tone(lane ? 620 : 420, lane ? 880 : 300, 0.09, 'triangle', 0.22); noise(0.04, 0.05, 'highpass', 4000, 4000, 1); },
      collect(chain) {
        const idx = Math.min(chain - 1, 14);
        const semis = PENTA[idx % 5] + 12 * Math.floor(idx / 5);
        const f = 523.25 * Math.pow(2, semis / 12);
        tone(f, f * 1.01, 0.22, 'sine', 0.3); tone(f * 2, f * 2, 0.12, 'triangle', 0.07);
      },
      multUp(m) { const f = 440 * Math.pow(2, (m * 2) / 12); tone(f, f * 2, 0.25, 'square', 0.07); tone(f * 1.5, f * 3, 0.25, 'sine', 0.12); },
      near() { noise(0.24, 0.28, 'bandpass', 700, 3800, 2.5); tone(1250, 1900, 0.09, 'square', 0.04); },
      armed() { tone(190, 120, 0.09, 'square', 0.035); },
      lap() { tone(1320, 1320, 0.06, 'sine', 0.06); },
      levelUp() { const t = ctx ? ctx.currentTime : 0; [0, 4, 7, 12].forEach((s, i) => tone(392 * Math.pow(2, s / 12), 0, 0.16, 'triangle', 0.12, t + i * 0.06)); },
      death() {
        noise(1.0, 0.7, 'lowpass', 3000, 80, 1);
        tone(240, 38, 0.85, 'sawtooth', 0.28); tone(110, 28, 1.1, 'sine', 0.55);
      },
      unlockFx() { const t = ctx ? ctx.currentTime : 0; [0, 4, 7, 11, 14].forEach((s, i) => tone(523.25 * Math.pow(2, s / 12), 0, 0.3, 'sine', 0.16, t + i * 0.07)); },
      ui() { tone(680, 920, 0.06, 'sine', 0.12); },
      deny() { tone(200, 150, 0.12, 'square', 0.06); },
    };
  })();

  /* ---------------------------------------------------------------
   * Canvas, sizing, accessibility preferences
   * ------------------------------------------------------------- */
  const canvas = document.getElementById('game');
  const g = canvas.getContext('2d', { alpha: false }) || canvas.getContext('2d');
  let W = 1, H = 1, DPR = 1, U = 1, CX = 0, CY = 0, vignette = null;

  function resize() {
    DPR = clamp(window.devicePixelRatio || 1, 1, 2);
    W = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    H = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    canvas.width = Math.max(1, Math.round(W * DPR));
    canvas.height = Math.max(1, Math.round(H * DPR));
    U = Math.max(40, Math.min(W, H * 0.92) * 0.36);
    CX = W / 2; CY = H * 0.53;
    vignette = g.createRadialGradient(CX, CY, Math.min(W, H) * 0.25, CX, CY, Math.hypot(W, H) * 0.62);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.72)');
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  resize();

  let reducedMotion = false;
  try {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = mq.matches;
    const onChange = (e) => { reducedMotion = e.matches; };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  } catch (e) { /* ignore */ }

  /* ---------------------------------------------------------------
   * Effects: pooled particles, floating text, shockwaves, shake, flash
   * ------------------------------------------------------------- */
  const MAX_P = 720;
  const parts = Array.from({ length: MAX_P }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 0, color: '#fff', drag: 0 }));
  let pCount = 0;
  function emit(x, y, n, o) {
    for (let k = 0; k < n && pCount < MAX_P; k++) {
      const p = parts[pCount++];
      const a = o.angle !== undefined ? o.angle + rand(-o.spread, o.spread) : rand(0, TAU);
      const sp = rand(o.speed * 0.35, o.speed);
      p.x = x; p.y = y; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.max = p.life = rand(o.life * 0.5, o.life);
      p.size = rand(o.size * 0.5, o.size);
      p.color = typeof o.color === 'function' ? o.color() : o.color;
      p.drag = o.drag !== undefined ? o.drag : 2.5;
    }
  }
  function updateParticles(dt) {
    for (let i = 0; i < pCount; i++) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { const last = parts[--pCount]; parts[pCount] = p; parts[i] = last; i--; continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k; p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  const texts = [];
  function floatText(x, y, text, color, size, life) {
    if (texts.length > 24) texts.shift();
    texts.push({ x, y, text, color, size: size || 18, life: life || 0.9, max: life || 0.9 });
  }
  const waves = [];
  function wave(x, y, maxR, color, life, width) {
    if (waves.length > 18) waves.shift();
    waves.push({ x, y, maxR, color, life: life || 0.5, max: life || 0.5, width: width || 0.02 });
  }

  let trauma = 0, flash = 0, flashColor = '255,255,255';
  const addTrauma = (t) => { trauma = Math.min(1, trauma + t); };
  const doFlash = (a, rgb) => { flash = Math.max(flash, reducedMotion ? a * 0.3 : a); flashColor = rgb || '255,255,255'; };

  const stars = Array.from({ length: 150 }, () => ({ a: rand(0, TAU), d: Math.sqrt(Math.random()), z: rand(0.2, 1), tw: rand(0, TAU) }));

  /* ---------------------------------------------------------------
   * Game state
   * ------------------------------------------------------------- */
  let state = 'menu';         // menu | play | paused | dying | over
  let run = null;
  let realTime = 0, timeScale = 1, dyingT = 0, overAt = 0, lastResult = null;
  const trail = [];
  const demo = { a: -Math.PI / 2, lanePos: 1, lane: 1, t: 0 };

  const skinOf = () => SKINS.find((s) => s.id === save.skin) || SKINS[0];
  const hueNow = () => { const s = skinOf(); return s.hue < 0 ? (realTime * 70) % 360 : s.hue; };
  const multOf = (chain) => Math.min(6, 1 + Math.floor(chain / 4));
  const radiusOf = (lanePos) => lerp(RING[0], RING[1], smooth(clamp(lanePos, 0, 1)));

  function newRun() {
    return {
      score: 0, a: -Math.PI / 2, dir: 1, lane: 1, lanePos: 1, w: 1.55, level: 0,
      orbs: 0, chain: 0, maxChain: 0, chainT: 0, near: 0, laps: 0, lapAcc: 0, time: 0,
      hazards: [], pickups: [], spawnT: 1.4, orbT: 0.3, switches: 0, pop: 0, x: 0, y: -1,
    };
  }

  function playerPos(r) {
    const rad = radiusOf(r.lanePos);
    r.x = Math.cos(r.a) * rad; r.y = Math.sin(r.a) * rad;
  }

  function addScore(n) {
    run.score += n;
    hud.dirty = true;
  }

  // Forward angular distance the player still has to travel to reach angle a.
  const ahead = (r, a) => wrap((a - r.a) * r.dir);
  // Minimum angular gap between hazards on different orbits: always leaves time to weave.
  const sepFor = (r) => r.w * 0.34 + 0.34;

  function trySpawnHazard(r) {
    const drifting = r.level >= 3 && Math.random() < Math.min(0.55, 0.1 * (r.level - 2));
    const av = drifting ? rand(0.25, 0.55) * (Math.random() < 0.5 ? -1 : 1) : 0;
    const reach = (r.w + Math.abs(av)) * 1.15 + 0.35;
    const sep = sepFor(r);
    for (let attempt = 0; attempt < 16; attempt++) {
      const ring = Math.random() < 0.5 ? 0 : 1;
      const a = rand(0, TAU);
      const fd = ahead(r, a);
      if (fd < reach) continue;
      let ok = true;
      for (const h of r.hazards) {
        if (h.state === 'fade') continue;
        const d = Math.abs(angDiff(a, h.a));
        if (h.ring !== ring ? d < sep : d < 0.34) { ok = false; break; }
      }
      if (!ok) continue;
      for (const p of r.pickups) if (p.ring === ring && Math.abs(angDiff(a, p.a)) < 0.3) { ok = false; break; }
      if (!ok) continue;
      r.hazards.push({ ring, a, av, t: 0, ttl: rand(5.5, 9.5), state: 'warn', spin: rand(0, TAU), inNear: false, nearDone: false });
      return true;
    }
    return false;
  }

  function trySpawnOrb(r) {
    for (let attempt = 0; attempt < 16; attempt++) {
      const ring = r.orbs === 0 && r.pickups.length === 0 ? 0 : (Math.random() < 0.5 ? 0 : 1);
      const fd = rand(1.1, 4.6);
      const a = wrap(r.a + fd * r.dir);
      let ok = true;
      for (const h of r.hazards) if (h.state !== 'fade' && h.ring === ring && Math.abs(angDiff(a, h.a)) < 0.36) { ok = false; break; }
      for (const p of r.pickups) if (Math.abs(angDiff(a, p.a)) < 0.3) { ok = false; break; }
      if (!ok) continue;
      r.pickups.push({ ring, a, t: 0, ttl: 7.5 });
      return true;
    }
    return false;
  }

  function collect(r, p) {
    r.orbs++;
    r.chain = r.chainT > 0 ? r.chain + 1 : 1;
    r.chainT = COMBO_WIN;
    r.maxChain = Math.max(r.maxChain, r.chain);
    const prevMult = multOf(r.chain - 1), mult = multOf(r.chain);
    const pts = 10 * mult;
    addScore(pts);
    const x = Math.cos(p.a) * RING[p.ring], y = Math.sin(p.a) * RING[p.ring];
    const hue = hueNow();
    emit(x, y, 22, { speed: 1.6, life: 0.6, size: 0.022, color: () => (Math.random() < 0.5 ? '#ffe7a3' : `hsl(${hue} 100% 70%)`), drag: 3 });
    wave(x, y, 0.32, 'rgba(255,220,140,', 0.4, 0.018);
    floatText(x, y - 0.1, '+' + pts, '#ffe7a3', 18 + Math.min(mult, 6) * 2);
    addTrauma(0.1);
    r.pop = 1;
    audio.collect(r.chain);
    if (mult > prevMult && r.chain > 1) {
      floatText(0, -0.36, '×' + mult, `hsl(${hue} 100% 72%)`, 34, 1.1);
      wave(0, 0, 1.25, `hsla(${hue},100%,70%,`, 0.7, 0.03);
      doFlash(0.12, '255,240,200');
      audio.multUp(mult);
    }
  }

  function die(r) {
    state = 'dying'; dyingT = 0; timeScale = 0.12;
    const hue = hueNow();
    emit(r.x, r.y, 90, { speed: 3.2, life: 1.2, size: 0.03, color: () => `hsl(${hue + rand(-20, 20)} 100% ${rand(55, 80)}%)`, drag: 1.8 });
    emit(r.x, r.y, 40, { speed: 5, life: 0.7, size: 0.016, color: '#ffffff', drag: 2.4 });
    emit(r.x, r.y, 30, { speed: 2.2, life: 1.0, size: 0.028, color: '#ff3b5c', drag: 2 });
    wave(r.x, r.y, 0.9, 'rgba(255,255,255,', 0.6, 0.04);
    wave(r.x, r.y, 1.6, 'rgba(255,59,92,', 0.9, 0.03);
    addTrauma(1); doFlash(0.65, '255,90,120');
    audio.musicStop(); audio.death();
    trail.length = 0;
    lastResult = commitRun(r, true);
  }

  // Records a finished (or abandoned) run. Very short abandoned runs do not count toward "runs played".
  function commitRun(r, died) {
    if (!r || r.committed) return lastResult;
    r.committed = true;
    const counts = died || r.time >= 3;
    const prevBest = save.best;
    addTotals(counts ? 1 : 0, r.orbs, r.score);
    save.best = Math.max(save.best, r.score);
    save.bestCombo = Math.max(save.bestCombo, r.maxChain);
    const fresh = evaluateUnlocks(save);
    persist();
    return { score: r.score, isBest: r.score > prevBest && r.score > 0, orbs: r.orbs, chain: r.maxChain, near: r.near, fresh };
  }

  /* ---------------------------------------------------------------
   * Simulation (each frame is split into equal sub-steps of at most 1/120 s: no tunnelling at any frame rate)
   * ------------------------------------------------------------- */
  function step(dt) {
    const r = run;
    if (!r) return;
    const alive = state === 'play';

    if (alive) {
      r.time += dt;
      const lvl = Math.min(MAX_LEVEL, Math.floor(r.time / 10) + Math.floor(r.orbs / 8));
      if (lvl > r.level) {
        r.level = lvl;
        floatText(0, 0.42, 'SPEED UP', '#ffffff', 20, 1.2);
        wave(0, 0, 1.4, 'rgba(255,255,255,', 0.8, 0.02);
        audio.levelUp();
      }
      r.w = 1.55 + r.level * 0.15;

      const da = r.w * dt * r.dir;
      r.a = wrap(r.a + da);
      r.lapAcc += Math.abs(da);
      if (r.lapAcc >= TAU) {
        r.lapAcc -= TAU; r.laps++;
        addScore(5);
        floatText(r.x, r.y - 0.12, '+5 lap', 'rgba(255,255,255,0.7)', 14, 0.7);
        audio.lap();
      }
      r.lanePos += clamp(r.lane - r.lanePos, -dt / SWITCH_T, dt / SWITCH_T);
      r.pop = Math.max(0, r.pop - dt * 5);
      playerPos(r);
      trail.push(r.x, r.y);
      if (trail.length > 56) trail.splice(0, trail.length - 56);

      if (r.chainT > 0) {
        r.chainT -= dt;
        if (r.chainT <= 0) {
          if (r.chain >= 4) floatText(0, 0.3, 'chain broken', 'rgba(255,255,255,0.55)', 14, 0.9);
          r.chain = 0; r.chainT = 0;
        }
      }
    }

    // Hazards: telegraph -> lethal -> fade
    const sep = sepFor(r);
    for (let i = r.hazards.length - 1; i >= 0; i--) {
      const h = r.hazards[i];
      h.t += dt; h.spin += dt * (h.av ? 4 : 1.6);
      if (h.state === 'warn' && h.t >= WARN_T) { h.state = 'live'; h.t = 0; if (alive) audio.armed(); }
      else if (h.state === 'live' && h.t >= h.ttl) { h.state = 'fade'; h.t = 0; }
      else if (h.state === 'fade' && h.t >= 0.35) { r.hazards.splice(i, 1); continue; }
      if (h.av && h.state !== 'fade') {
        // Drifters bounce off neighbours so they can never close an unpassable wall.
        for (const o of r.hazards) {
          if (o === h || o.state === 'fade') continue;
          const d = angDiff(o.a, h.a);
          const limit = o.ring !== h.ring ? sep : 0.34;
          if (Math.abs(d) < limit && Math.sign(d) === Math.sign(h.av)) { h.av = -h.av; break; }
        }
        h.a = wrap(h.a + h.av * dt);
      }
    }

    if (!alive) return;

    for (const h of r.hazards) {
      if (h.state !== 'live') continue;
      const rad = RING[h.ring];
      const d = Math.hypot(Math.cos(h.a) * rad - r.x, Math.sin(h.a) * rad - r.y);
      if (d < HIT_D) { die(r); return; }
      if (d < NEAR_D) h.inNear = true;
      else if (h.inNear) {
        h.inNear = false;
        if (!h.nearDone) {
          h.nearDone = true; r.near++;
          const mult = multOf(r.chain);
          addScore(5 * mult);
          if (r.chain > 0) r.chainT = Math.min(COMBO_WIN, r.chainT + 0.75);
          floatText(r.x, r.y - 0.12, 'CLOSE +' + 5 * mult, '#ff8aa0', 16, 0.8);
          emit(r.x, r.y, 12, { speed: 1.4, life: 0.35, size: 0.014, color: '#ffffff', drag: 4 });
          timeScale = 0.45; addTrauma(0.18);
          audio.near();
        }
      }
    }

    for (let i = r.pickups.length - 1; i >= 0; i--) {
      const p = r.pickups[i];
      p.t += dt;
      if (p.t >= p.ttl) { r.pickups.splice(i, 1); continue; }
      const rad = RING[p.ring];
      if (Math.hypot(Math.cos(p.a) * rad - r.x, Math.sin(p.a) * rad - r.y) < PICK_D) {
        r.pickups.splice(i, 1);
        collect(r, p);
      }
    }

    const active = r.hazards.reduce((n, h) => n + (h.state !== 'fade' ? 1 : 0), 0);
    const target = Math.min(9, 2 + Math.floor(r.level * 0.6));
    r.spawnT -= dt;
    if (r.spawnT <= 0 && active < target) { trySpawnHazard(r); r.spawnT = rand(0.45, 1.0); }
    r.orbT -= dt;
    if (r.orbT <= 0 && r.pickups.length < 2) { trySpawnOrb(r); r.orbT = rand(0.5, 1.3); }
  }

  function update(rdt) {
    realTime += rdt;
    trauma = Math.max(0, trauma - rdt * 1.5);
    flash = Math.max(0, flash - rdt * 3);
    timeScale = Math.min(1, timeScale + rdt * (state === 'dying' ? 0.9 : 2.5));

    if (state === 'play' || state === 'dying') {
      const dt = rdt * timeScale;
      const n = Math.max(1, Math.ceil(dt / SIM_STEP));
      for (let i = 0; i < n; i++) step(dt / n);
      updateParticles(dt);
      if (state === 'play' && run) audio.musicTick(118 + run.level * 3, run.level < 2 ? 0 : run.level < 6 ? 1 : run.level < 10 ? 2 : 3);
      if (state === 'dying') {
        dyingT += rdt;
        if (dyingT >= DEATH_T) showOver();
      }
    } else {
      if (state !== 'paused') updateParticles(rdt);
      if (state === 'menu') {
        demo.t += rdt;
        demo.a = wrap(demo.a + rdt * 1.2);
        if (demo.t > 1.6) { demo.t = 0; demo.lane = 1 - demo.lane; }
        demo.lanePos += clamp(demo.lane - demo.lanePos, -rdt / 0.25, rdt / 0.25);
        const rad = radiusOf(demo.lanePos);
        trail.push(Math.cos(demo.a) * rad, Math.sin(demo.a) * rad);
        if (trail.length > 56) trail.splice(0, trail.length - 56);
      }
    }
    for (let i = texts.length - 1; i >= 0; i--) { texts[i].life -= rdt; if (texts[i].life <= 0) texts.splice(i, 1); }
    for (let i = waves.length - 1; i >= 0; i--) { waves[i].life -= rdt; if (waves[i].life <= 0) waves.splice(i, 1); }
    hud.sync();
  }

  /* ---------------------------------------------------------------
   * Rendering
   * ------------------------------------------------------------- */
  function drawStar(cx, cy, spikes, outer, inner, rot) {
    g.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const rr = i % 2 ? inner : outer;
      const a = rot + (i * Math.PI) / spikes;
      if (i === 0) g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      else g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath();
  }

  function render() {
    const hue = hueNow();
    const speed = run ? run.w : 1.2;
    const audioPulse = audio.pulse();
    const pulse = audioPulse !== null ? audioPulse : Math.exp(-((realTime * 2) % 1) * 7) * 0.6;

    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = '#07060d';
    g.fillRect(0, 0, W, H);

    const bg = g.createRadialGradient(CX, CY, 0, CX, CY, Math.max(W, H) * 0.75);
    bg.addColorStop(0, `hsla(${hue}, 80%, 30%, ${0.22 + pulse * 0.08})`);
    bg.addColorStop(0.45, `hsla(${(hue + 60) % 360}, 70%, 14%, 0.12)`);
    bg.addColorStop(1, 'rgba(7,6,13,0)');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // Shake (trauma squared feels right: small hits stay subtle)
    const sh = trauma * trauma * (reducedMotion ? 0.2 : 1);
    const sx = sh * 16 * (Math.random() * 2 - 1);
    const sy = sh * 16 * (Math.random() * 2 - 1);
    const srot = sh * 0.035 * (Math.random() * 2 - 1);

    // Starfield
    const maxD = Math.hypot(W, H) * 0.6;
    const rotBase = realTime * 0.02 + (run ? run.a * 0.08 : 0);
    for (const s of stars) {
      const a = s.a + rotBase * s.z * (speed / 1.5);
      const d = s.d * maxD;
      const x = CX + Math.cos(a) * d + sx * s.z * 0.5, y = CY + Math.sin(a) * d + sy * s.z * 0.5;
      if (x < -2 || y < -2 || x > W + 2 || y > H + 2) continue;
      g.globalAlpha = (0.25 + 0.55 * s.z) * (0.7 + 0.3 * Math.sin(realTime * 2 + s.tw));
      g.fillStyle = '#cfd8ff';
      const sz = s.z * 1.6 + 0.3;
      g.fillRect(x, y, sz, sz);
    }
    g.globalAlpha = 1;

    g.save();
    g.translate(CX + sx, CY + sy);
    g.rotate(srot);
    g.scale(U, U);

    // Orbits
    const activeRing = run && state !== 'menu' ? run.lane : demo.lane;
    for (let i = 0; i < 2; i++) {
      const on = i === activeRing;
      g.beginPath(); g.arc(0, 0, RING[i], 0, TAU);
      g.strokeStyle = `hsla(${hue}, 100%, 65%, ${on ? 0.12 : 0.05})`;
      g.lineWidth = 0.07; g.stroke();
      g.strokeStyle = `hsla(${hue}, 100%, 78%, ${on ? 0.55 : 0.22})`;
      g.lineWidth = on ? 0.009 : 0.006; g.stroke();
    }
    // Rotating tick ring sells speed
    g.save();
    g.rotate(realTime * 0.15 * speed);
    g.setLineDash([0.012, 0.09]);
    g.beginPath(); g.arc(0, 0, 1.18, 0, TAU);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 0.02; g.stroke();
    g.setLineDash([]);
    g.restore();

    // Core + chain timer
    const coreR = 0.16 * (1 + pulse * 0.1);
    const cg = g.createRadialGradient(0, 0, 0, 0, 0, coreR * 2.4);
    cg.addColorStop(0, `hsla(${hue}, 100%, 85%, 0.95)`);
    cg.addColorStop(0.35, `hsla(${hue}, 100%, 60%, 0.45)`);
    cg.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
    g.fillStyle = cg;
    g.beginPath(); g.arc(0, 0, coreR * 2.4, 0, TAU); g.fill();
    g.fillStyle = '#0b0918';
    g.beginPath(); g.arc(0, 0, coreR * 0.78, 0, TAU); g.fill();
    if (run && run.chainT > 0 && state === 'play') {
      const f = run.chainT / COMBO_WIN;
      g.beginPath(); g.arc(0, 0, 0.24, -Math.PI / 2, -Math.PI / 2 + TAU * f);
      g.strokeStyle = f < 0.3 ? `rgba(255,120,140,${0.6 + 0.4 * Math.sin(realTime * 30)})` : `hsla(${hue}, 100%, 75%, 0.9)`;
      g.lineWidth = 0.022; g.lineCap = 'round'; g.stroke(); g.lineCap = 'butt';
    }

    if (run && state !== 'menu') {
      // Orbs
      for (const p of run.pickups) {
        const x = Math.cos(p.a) * RING[p.ring], y = Math.sin(p.a) * RING[p.ring];
        const born = Math.min(1, p.t / 0.25);
        const blink = p.ttl - p.t < 1.5 ? (Math.sin(p.t * 26) > 0 ? 1 : 0.3) : 1;
        const r = ORB_R * (0.6 + 0.4 * smooth(born)) * (1 + Math.sin(p.t * 6) * 0.08);
        g.globalAlpha = blink;
        g.fillStyle = 'rgba(255, 211, 107, 0.16)';
        g.beginPath(); g.arc(x, y, r * 2.6, 0, TAU); g.fill();
        g.fillStyle = '#ffe7a3';
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 0.006;
        g.beginPath();
        const s = r * 2.1, ra = p.t * 2;
        g.moveTo(x + Math.cos(ra) * s, y + Math.sin(ra) * s); g.lineTo(x - Math.cos(ra) * s, y - Math.sin(ra) * s);
        g.moveTo(x + Math.cos(ra + Math.PI / 2) * s, y + Math.sin(ra + Math.PI / 2) * s); g.lineTo(x - Math.cos(ra + Math.PI / 2) * s, y - Math.sin(ra + Math.PI / 2) * s);
        g.stroke();
        g.globalAlpha = 1;
      }

      // Hazards
      for (const h of run.hazards) {
        const x = Math.cos(h.a) * RING[h.ring], y = Math.sin(h.a) * RING[h.ring];
        if (h.state === 'warn') {
          const k = h.t / WARN_T;
          g.globalAlpha = 0.35 + 0.5 * (Math.sin(h.t * 28) * 0.5 + 0.5);
          g.setLineDash([0.02, 0.02]);
          g.strokeStyle = '#ff3b5c'; g.lineWidth = 0.008;
          g.beginPath(); g.arc(x, y, HAZ_R * (1.9 - 0.9 * k), 0, TAU); g.stroke();
          g.setLineDash([]);
          g.fillStyle = 'rgba(255,59,92,0.25)';
          drawStar(x, y, 6, HAZ_R * k, HAZ_R * 0.45 * k, h.spin); g.fill();
        } else {
          const k = h.state === 'fade' ? 1 - h.t / 0.35 : Math.min(1, 0.6 + h.t * 3);
          g.globalAlpha = h.state === 'fade' ? k : 1;
          g.fillStyle = 'rgba(255,59,92,0.18)';
          g.beginPath(); g.arc(x, y, HAZ_R * 2.1 * k, 0, TAU); g.fill();
          g.fillStyle = '#ff3b5c';
          drawStar(x, y, 6, HAZ_R * k, HAZ_R * 0.48 * k, h.spin); g.fill();
          g.fillStyle = '#ffd5dc';
          g.beginPath(); g.arc(x, y, HAZ_R * 0.22 * k, 0, TAU); g.fill();
          if (h.av) {
            g.strokeStyle = 'rgba(255,59,92,0.45)'; g.lineWidth = 0.008;
            g.beginPath(); g.arc(0, 0, RING[h.ring], h.a - Math.sign(h.av) * 0.22, h.a, h.av < 0); g.stroke();
          }
        }
        g.globalAlpha = 1;
      }
    }

    // Trail (additive)
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    const n = trail.length / 2;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      g.strokeStyle = `hsla(${(hue + (skinOf().hue < 0 ? i * 6 : 0)) % 360}, 100%, ${55 + t * 25}%, ${t * 0.75})`;
      g.lineWidth = PLAYER_R * 1.6 * t;
      g.beginPath();
      g.moveTo(trail[(i - 1) * 2], trail[(i - 1) * 2 + 1]);
      g.lineTo(trail[i * 2], trail[i * 2 + 1]);
      g.stroke();
    }
    g.lineCap = 'butt';

    // Player (or attract-mode ghost)
    let px = null, py = null, pop = 0;
    if (state === 'menu') {
      const rad = radiusOf(demo.lanePos); px = Math.cos(demo.a) * rad; py = Math.sin(demo.a) * rad;
    } else if (run && (state === 'play' || state === 'paused')) { px = run.x; py = run.y; pop = run.pop; }
    if (px !== null) {
      const pr = PLAYER_R * (1 + pop * 0.35);
      g.fillStyle = `hsla(${hue}, 100%, 60%, 0.22)`;
      g.beginPath(); g.arc(px, py, pr * 3, 0, TAU); g.fill();
      g.fillStyle = `hsla(${hue}, 100%, 70%, 0.9)`;
      g.beginPath(); g.arc(px, py, pr * 1.25, 0, TAU); g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(px, py, pr * 0.8, 0, TAU); g.fill();
    }

    // Particles
    for (let i = 0; i < pCount; i++) {
      const p = parts[i];
      const k = p.life / p.max;
      g.globalAlpha = k;
      g.fillStyle = p.color;
      g.beginPath(); g.arc(p.x, p.y, p.size * (0.4 + 0.6 * k), 0, TAU); g.fill();
    }
    g.globalAlpha = 1;

    // Shockwaves
    for (const w of waves) {
      const k = 1 - w.life / w.max;
      g.strokeStyle = w.color + (1 - k) * 0.8 + ')';
      g.lineWidth = w.width * (1 - k * 0.7);
      g.beginPath(); g.arc(w.x, w.y, Math.max(0.001, w.maxR * (1 - Math.pow(1 - k, 3))), 0, TAU); g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    g.restore();

    // Pixel-space text (crisp at any scale)
    g.save();
    g.translate(sx, sy);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (run && state === 'play' && run.chain > 0) {
      const m = multOf(run.chain);
      g.fillStyle = `hsla(${hue}, 100%, 88%, 0.95)`;
      g.font = `800 ${Math.round(U * 0.12)}px ${FONT_STACK}`;
      g.fillText('×' + m, CX, CY - U * 0.015);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.font = `600 ${Math.max(9, Math.round(U * 0.04))}px ${FONT_STACK}`;
      g.fillText(run.chain + ' chain', CX, CY + U * 0.075);
    }
    for (const t of texts) {
      const k = t.life / t.max;
      const rise = (1 - k) * U * 0.12;
      const scale = 1 + Math.max(0, (k - 0.85) * 3);
      g.globalAlpha = Math.min(1, k * 1.6);
      g.fillStyle = t.color;
      g.font = `800 ${Math.round(t.size * scale * clamp(U / 220, 0.75, 1.5))}px ${FONT_STACK}`;
      g.fillText(t.text, CX + t.x * U, CY + t.y * U - rise);
    }
    g.restore();
    g.globalAlpha = 1;

    if (vignette) { g.fillStyle = vignette; g.fillRect(0, 0, W, H); }
    if (flash > 0.001) { g.fillStyle = `rgba(${flashColor},${flash * 0.55})`; g.fillRect(0, 0, W, H); }
  }
  const FONT_STACK = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

  /* ---------------------------------------------------------------
   * DOM / HUD / screens
   * ------------------------------------------------------------- */
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'), score: $('score'), hudBest: $('hudBest'), pauseBtn: $('pauseBtn'), muteBtn: $('muteBtn'), hint: $('hint'), toast: $('toast'),
    menu: $('menu'), over: $('over'), pause: $('pause'),
    playBtn: $('playBtn'), retryBtn: $('retryBtn'), menuBtn: $('menuBtn'), resumeBtn: $('resumeBtn'), quitBtn: $('quitBtn'),
    mBest: $('mBest'), mRuns: $('mRuns'), mOrbs: $('mOrbs'), mCombo: $('mCombo'), skins: $('skins'), skinCount: $('skinCount'), mNext: $('mNext'), storeWarn: $('storeWarn'),
    oNew: $('oNew'), oScore: $('oScore'), oBest: $('oBest'), oOrbs: $('oOrbs'), oCombo: $('oCombo'), oNear: $('oNear'), oUnlocks: $('oUnlocks'), oNext: $('oNext'),
  };

  const hud = {
    shown: -1, dirty: true,
    sync() {
      if (!run || !this.dirty) return;
      this.dirty = false;
      const s = Math.floor(run.score);
      if (s !== this.shown) {
        this.shown = s;
        el.score.textContent = fmt(s);
        if (s > 0 && typeof el.score.animate === 'function' && !reducedMotion) {
          el.score.animate([{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
        }
      }
    },
  };

  function applyAccent() {
    const s = skinOf();
    const h = s.hue < 0 ? 280 : s.hue;
    document.documentElement.style.setProperty('--accent', `hsl(${h} 100% 66%)`);
    document.documentElement.style.setProperty('--accent-soft', `hsl(${h} 100% 66% / 0.18)`);
  }
  const skinColor = (s) => (s.hue < 0 ? 'conic-gradient(from 0deg, #ff5ea8, #ffd36b, #7dff8a, #5ef2ff, #a77bff, #ff5ea8)' : `hsl(${s.hue} 100% 66%)`);

  function nextUnlockHTML() {
    let best = null;
    for (const s of SKINS) {
      if (save.unlocked.includes(s.id)) continue;
      const p = clamp(s.prog(save), 0, 0.999);
      if (!best || p > best.p) best = { s, p };
    }
    if (!best) return '<span>Every trail unlocked. Now chase the best score.</span>';
    const pct = Math.floor(best.p * 100);
    return `<span>Next: <b>${best.s.name}</b> · ${best.s.req} · ${pct}%</span><div class="bar"><i style="width:${pct}%"></i></div>`;
  }

  function renderSkins() {
    el.skins.textContent = '';
    for (const s of SKINS) {
      const b = document.createElement('button');
      const owned = save.unlocked.includes(s.id);
      b.type = 'button';
      b.className = 'skin' + (owned ? '' : ' locked');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(save.skin === s.id));
      b.setAttribute('aria-label', owned ? `${s.name} trail` : `${s.name} trail, locked: ${s.req}`);
      b.title = owned ? s.name : `${s.name}: ${s.req}`;
      b.style.setProperty('--c', s.hue < 0 ? '#ff8ad8' : `hsl(${s.hue} 100% 66%)`);
      const dot = document.createElement('i');
      if (owned) dot.style.background = skinColor(s);
      b.appendChild(dot);
      b.addEventListener('click', () => {
        audio.unlock();
        if (!owned) {
          audio.deny(); toast(`${s.name}: ${s.req}`);
          b.classList.remove('deny'); void b.offsetWidth; b.classList.add('deny');
          return;
        }
        if (save.skin !== s.id) { save.skin = s.id; persist(); applyAccent(); renderSkins(); audio.ui(); const nb = el.skins.children[SKINS.indexOf(s)]; if (nb) nb.focus(); }
      });
      el.skins.appendChild(b);
    }
    el.skinCount.textContent = `${save.unlocked.length} / ${SKINS.length}`;
  }

  function refreshMenu() {
    el.mBest.textContent = fmt(save.best);
    el.mRuns.textContent = fmt(save.games);
    el.mOrbs.textContent = fmt(save.orbs);
    el.mCombo.textContent = fmt(save.bestCombo);
    el.hudBest.textContent = fmt(save.best);
    el.mNext.innerHTML = nextUnlockHTML();
    el.storeWarn.hidden = store.available;
    renderSkins();
    applyAccent();
  }

  let toastTimer = 0;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2200);
  }

  function showScreen(name) {
    el.menu.hidden = name !== 'menu';
    el.over.hidden = name !== 'over';
    el.pause.hidden = name !== 'pause';
    el.hud.classList.toggle('idle', name === 'menu');
    el.pauseBtn.hidden = name !== null;
  }

  function blurActive() {
    const a = document.activeElement;
    if (a && a !== document.body && typeof a.blur === 'function') a.blur();
  }

  /* ---------------------------------------------------------------
   * Flow
   * ------------------------------------------------------------- */
  function startRun() {
    audio.unlock();
    run = newRun();
    playerPos(run);
    trail.length = 0; pCount = 0; texts.length = 0; waves.length = 0;
    timeScale = 1; trauma = 0; flash = 0;
    state = 'play';
    showScreen(null);
    blurActive();
    hud.shown = -1; hud.dirty = true; hud.sync();
    el.hudBest.textContent = fmt(save.best);
    el.hint.hidden = save.tutorial;
    trySpawnOrb(run);
    wave(run.x, run.y, 0.5, `hsla(${hueNow()},100%,70%,`, 0.5, 0.02);
    audio.musicStart();
    audio.ui();
  }

  function switchLane() {
    if (state !== 'play' || !run) return;
    run.lane = 1 - run.lane;
    run.switches++;
    const hue = hueNow();
    emit(run.x, run.y, 8, { speed: 0.9, life: 0.3, size: 0.016, color: `hsl(${hue} 100% 75%)`, drag: 5 });
    run.pop = Math.max(run.pop, 0.5);
    audio.hop(run.lane);
    if (!save.tutorial) { save.tutorial = true; el.hint.hidden = true; persist(); }
  }

  function showOver() {
    state = 'over';
    overAt = realTime;
    const r = lastResult || { score: 0, isBest: false, orbs: 0, chain: 0, near: 0, fresh: [] };
    el.oScore.textContent = fmt(r.score);
    el.oNew.hidden = !r.isBest;
    el.oBest.textContent = fmt(save.best);
    el.oOrbs.textContent = fmt(r.orbs);
    el.oCombo.textContent = fmt(r.chain);
    el.oNear.textContent = fmt(r.near);
    el.oUnlocks.textContent = '';
    r.fresh.forEach((s, i) => {
      const d = document.createElement('div');
      d.className = 'unlock';
      d.style.setProperty('--c', s.hue < 0 ? '#ff8ad8' : `hsl(${s.hue} 100% 66%)`);
      d.style.animationDelay = `${0.15 + i * 0.12}s`;
      const dot = document.createElement('i'); dot.style.background = skinColor(s);
      const txt = document.createElement('div');
      const b = document.createElement('b'); b.textContent = `${s.name} trail unlocked`;
      const sp = document.createElement('span'); sp.textContent = 'Equip it from the menu';
      txt.append(b, sp); d.append(dot, txt);
      el.oUnlocks.appendChild(d);
    });
    if (r.fresh.length) audio.unlockFx();
    el.oNext.innerHTML = nextUnlockHTML();
    el.hudBest.textContent = fmt(save.best);
    el.hint.hidden = true;
    showScreen('over');
  }

  function toMenu() {
    if (run && (state === 'play' || state === 'paused')) commitRun(run, false);
    audio.musicStop();
    state = 'menu';
    run = null; trail.length = 0; pCount = 0; texts.length = 0; waves.length = 0;
    el.hint.hidden = true;
    refreshMenu();
    showScreen('menu');
  }

  function pause() {
    if (state !== 'play') return;
    state = 'paused';
    audio.musicStop();
    showScreen('pause');
  }
  function resume() {
    if (state !== 'paused') return;
    state = 'play';
    showScreen(null);
    blurActive();
    audio.unlock();
    audio.musicStart();
  }

  function restartNow() {
    if (run && (state === 'play' || state === 'paused')) commitRun(run, false);
    startRun();
  }

  function primaryAction() {
    switch (state) {
      case 'menu': startRun(); break;
      case 'play': switchLane(); break;
      case 'paused': resume(); break;
      case 'over': if (realTime - overAt >= RESTART_GUARD) startRun(); break;
      case 'dying': if (dyingT >= DEATH_SKIP) showOver(); break; // the panic tap that killed you is ignored; a later tap fast-forwards
      default: break;
    }
  }

  /* ---------------------------------------------------------------
   * Input: pointer (mouse/touch/pen), keyboard, lifecycle
   * ------------------------------------------------------------- */
  let lastTapMs = -1e9;
  window.addEventListener('pointerdown', (e) => {
    audio.unlock();
    if (e.button !== undefined && e.button > 0) return;              // right/middle click
    const t = e.target;
    if (t && t.closest && t.closest('button, a, input, label')) return; // real controls handle themselves
    if (state === 'menu' && t && t.closest && t.closest('.card')) return; // browsing the menu card is not "play"
    const now = performance.now();
    if (now - lastTapMs < 45) return;                                 // two thumbs landing together = one hop
    lastTapMs = now;
    if (e.cancelable) e.preventDefault();
    primaryAction();
  }, { passive: false });

  // iOS needs a touchend gesture to unlock audio in some versions.
  window.addEventListener('touchend', () => audio.unlock(), { passive: true });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  const ACTION_KEYS = new Set(['Space', 'Enter', 'NumpadEnter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD']);
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    audio.unlock();
    const k = e.code || e.key;
    const onButton = e.target && e.target.closest && e.target.closest('button');

    if (k === 'KeyM') { toggleMute(); return; }
    if (k === 'KeyP' || k === 'Escape') {
      e.preventDefault();
      if (state === 'play') pause(); else if (state === 'paused') resume(); else if (state === 'over' && k === 'Escape') toMenu();
      return;
    }
    if (k === 'KeyR') {
      if (e.repeat) return;
      e.preventDefault();
      if (state === 'play' || state === 'paused' || state === 'over' || state === 'dying') restartNow();
      return;
    }
    if (ACTION_KEYS.has(k)) {
      // Let a focused button activate normally in menus (keyboard users), but never during play.
      if (onButton && state !== 'play') return;
      e.preventDefault();
      if (e.repeat) return; // holding a key must not machine-gun hops
      primaryAction();
    }
  });

  function toggleMute() {
    const m = !audio.muted;
    audio.setMuted(m);
    save.muted = m; persist();
    el.muteBtn.setAttribute('aria-pressed', String(m));
    el.muteBtn.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
    if (!m) audio.ui();
  }

  el.playBtn.addEventListener('click', startRun);
  el.retryBtn.addEventListener('click', startRun);
  el.menuBtn.addEventListener('click', () => { audio.ui(); toMenu(); });
  el.resumeBtn.addEventListener('click', resume);
  el.quitBtn.addEventListener('click', () => { audio.ui(); toMenu(); });
  el.pauseBtn.addEventListener('click', pause);
  el.muteBtn.addEventListener('click', () => { audio.unlock(); toggleMute(); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pause(); audio.suspend(); }
    else audio.unlock();
  });
  window.addEventListener('blur', pause);
  window.addEventListener('pagehide', () => { if (run && (state === 'play' || state === 'paused')) commitRun(run, false); });

  // Another tab finished a run: fold its records in.
  window.addEventListener('storage', (e) => {
    if (e.key !== SAVE_KEY) return;
    mergeInto(save, readDisk());
    evaluateUnlocks(save);
    if (state === 'menu') refreshMenu();
    el.hudBest.textContent = fmt(save.best);
  });

  /* ---------------------------------------------------------------
   * Boot
   * ------------------------------------------------------------- */
  audio.setMuted(save.muted);
  el.muteBtn.setAttribute('aria-pressed', String(save.muted));
  el.muteBtn.setAttribute('aria-label', save.muted ? 'Unmute sound' : 'Mute sound');
  refreshMenu();
  showScreen('menu');

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let rdt = (now - last) / 1000;
    last = now;
    if (!(rdt > 0)) rdt = 0;          // NaN / negative / identical timestamps
    rdt = Math.min(rdt, 0.1);         // giant gaps (tab switch, debugger) never teleport the player
    try {
      update(rdt);
      render();
    } catch (err) {
      // A single bad frame must not kill the loop; surface it once for debugging.
      if (!frame.reported) { frame.reported = true; console.error(err); }
    }
  }
  requestAnimationFrame(frame);

  // Test hook (read-only snapshot), handy for automated checks.
  window.__orbita = { get state() { return state; }, get run() { return run; }, get save() { return JSON.parse(JSON.stringify(save)); } };
})();
