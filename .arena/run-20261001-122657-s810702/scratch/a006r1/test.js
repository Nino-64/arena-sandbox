// Acceptance tests for index.html. Run: NODE_PATH=$(npm root -g) node test.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const FILE = 'file://' + path.join(__dirname, 'index.html');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const src = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  ok(!/<script[^>]+src=|<link[^>]+href=|@import|url\(http/i.test(src), 'T1 single self-contained file, no external resources');
  ok(!/TODO|FIXME|placeholder|lorem/i.test(src), 'T2 no placeholders / TODOs');
  ok(/AudioContext/.test(src) && /createOscillator/.test(src), 'T3 Web Audio procedural synthesis present');

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  const errors = []; const requests = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => m.type() === 'error' && errors.push(m.text()));
  p.on('request', r => requests.push(r.url()));
  await p.goto(FILE); await sleep(400);

  ok(await p.evaluate(() => G.state) === 'menu', 'T4 boots to menu');
  const lit = await p.evaluate(() => { const c = document.querySelector('canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) n++; return n; });
  ok(lit > 2000, 'T5 menu renders visible content (' + lit + ' bright px)');

  await p.keyboard.press('Space'); await sleep(100);
  ok(await p.evaluate(() => G.state) === 'play', 'T6 space starts a run');
  ok(await p.evaluate(() => !!(window.AC && AC.state)), 'T7 AudioContext created on first input');

  // flip lanes and verify lane changes
  const l0 = await p.evaluate(() => G.lane); await p.keyboard.press('Space'); await sleep(50);
  ok(await p.evaluate(() => G.lane) !== l0, 'T8 input flips lane');

  // play with no input until death (obstacles must eventually kill an idle player)
  let died = false;
  for (let i = 0; i < 300 && !died; i++) { await sleep(100); died = await p.evaluate(() => G.state === 'dead'); }
  ok(died, 'T9 idle player eventually dies (obstacles are real)');
  ok(await p.evaluate(() => G.shake > 0 || G.parts.length > 20), 'T10 death produces shake/particles');

  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('orbit.save.v1')));
  ok(saved && saved.plays >= 1 && typeof saved.best === 'number', 'T11 save written to localStorage');

  await sleep(500);
  const t0 = Date.now(); await p.keyboard.press('Space'); await sleep(30);
  ok(await p.evaluate(() => G.state) === 'play' && Date.now() - t0 < 300, 'T12 instant restart from death');
  ok(await p.evaluate(() => G.score === 0 && G.obs.length >= 0), 'T13 restart resets score');

  // scoring: autopilot flips away from threats; score must rise
  await p.evaluate(() => { window.__auto = setInterval(() => { if (G.state !== 'play') return; const lr = G.lane; const danger = G.obs.some(o => o.l === lr && o.a - G.a > 0 && o.a - G.a < 0.45); if (danger) flip(); }, 16); });
  await sleep(6000);
  ok(await p.evaluate(() => G.score) > 0, 'T14 dodging scores points (score=' + await p.evaluate(() => G.score) + ')');
  await p.evaluate(() => clearInterval(window.__auto));

  // pause on blur / visibility
  await p.evaluate(() => { if (G.state === 'play') pause(true); });
  const st = await p.evaluate(() => G.state);
  const sc1 = await p.evaluate(() => G.a); await sleep(300); const sc2 = await p.evaluate(() => G.a);
  ok(st !== 'play' && sc1 === sc2, 'T15 pause freezes simulation');

  // unlockables persist across reload
  await p.evaluate(() => localStorage.setItem('orbit.save.v1', JSON.stringify({ best: 42, shards: 99999, plays: 3, skin: 0, muted: false })));
  await p.reload(); await sleep(300);
  ok(await p.evaluate(() => SKINS.every((s, i) => unlocked(i))), 'T16 skins unlock from lifetime shards');
  await p.keyboard.press('ArrowRight'); await sleep(50);
  await p.reload(); await sleep(300);
  ok(await p.evaluate(() => G.save.skin) === 1 && await p.evaluate(() => G.save.best) === 42, 'T17 skin choice + best persist across reload');

  // locked skin cannot be selected
  await p.evaluate(() => localStorage.setItem('orbit.save.v1', JSON.stringify({ best: 0, shards: 0, plays: 0, skin: 0, muted: false })));
  await p.reload(); await sleep(300);
  await p.keyboard.press('ArrowRight'); await sleep(50);
  ok(await p.evaluate(() => G.save.skin) === 0, 'T18 locked skin not selectable');

  // mute toggle persists
  await p.keyboard.press('KeyM'); await sleep(50);
  ok(await p.evaluate(() => G.save.muted) === true, 'T19 mute toggles and saves');

  // corrupt save does not crash
  await p.evaluate(() => localStorage.setItem('orbit.save.v1', '{bad json'));
  await p.reload(); await sleep(300);
  ok(await p.evaluate(() => G.state) === 'menu', 'T20 corrupt save tolerated');

  // touch / phone layout
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const mp = await m.newPage(); mp.on('pageerror', e => errors.push(e.message));
  await mp.goto(FILE); await sleep(300);
  const dims = await mp.evaluate(() => ({ cw: document.querySelector('canvas').clientWidth, ch: document.querySelector('canvas').clientHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight }));
  ok(dims.cw === 390 && dims.ch === 844 && dims.sw <= 390 && dims.sh <= 844, 'T21 fills phone viewport, no scroll ' + JSON.stringify(dims));
  await mp.tap('canvas', { position: { x: 195, y: 700 } }); await sleep(100);
  ok(await mp.evaluate(() => G.state) === 'play', 'T22 tap starts on touch');

  // frame rate sanity
  const fps = await p.evaluate(() => new Promise(r => { let n = 0; const t = performance.now(); (function f() { n++; if (performance.now() - t < 1000) requestAnimationFrame(f); else r(n); })(); }));
  ok(fps > 30, 'T23 page keeps frame rate (' + fps + ' fps)');

  // input hygiene: right-click and extra fingers must not flip
  await p.evaluate(() => { G.save.skin = 0; startRun(); });
  const ln = await p.evaluate(() => G.lane);
  await p.mouse.click(640, 400, { button: 'right' }); await sleep(30);
  await p.evaluate(() => document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerdown', { isPrimary: false, button: 0, clientX: 640, clientY: 400, bubbles: true })));
  ok(await p.evaluate(() => G.lane) === ln, 'T26 right-click and secondary pointers do not flip');
  await p.mouse.click(640, 400); await sleep(30);
  ok(await p.evaluate(() => G.lane) !== ln, 'T27 primary click still flips');

  // difficulty keeps escalating past the old plateau; spawn lead exceeds half an orbit
  const esc = await p.evaluate(() => { const r = []; for (const sc of [150, 400, 1000]) { startRun(); G.score = sc; update(1 / 60); r.push(G.w); } return r; });
  ok(esc[0] < esc[1] && esc[1] < esc[2] && esc[2] <= 3.8, 'T28 speed keeps rising past score 150 and stays capped ' + esc.map(v => v.toFixed(2)));
  ok(await p.evaluate(() => { startRun(); G.score = 3000; update(1 / 60); let min = 9; for (let i = 0; i < 600 && G.state === 'play'; i++) { const before = G.obs.length; update(1 / 60); for (const o of G.obs.slice(before)) min = Math.min(min, o.a - G.a); } return min > Math.PI; }), 'T29 after the opening frame, every arc spawns more than half an orbit ahead (at top speed)');

  // fairness: a reflex bot survives 60 s at maximum difficulty
  const botDeaths = await p.evaluate(() => { let d = 0; for (let k = 0; k < 10; k++) { startRun(); G.score = 3000; for (let t = 0; t < 3600 && G.state === 'play'; t++) { const pa = PR() / G.r * 0.6; if (G.obs.some(o => !o.passed && o.l === G.lane && o.a - o.hw - pa - G.a < 0.3 && o.a + o.hw + pa > G.a)) flip(); update(1 / 60); } if (G.state === 'dead') d++; } return d; });
  ok(botDeaths === 0, 'T30 top difficulty is survivable (bot deaths ' + botDeaths + '/10)');

  // reduced motion is read live
  await p.emulateMedia({ reducedMotion: 'reduce' });
  ok(await p.evaluate(() => { startRun(); die(); return G.shake === 4; }), 'T31 reduced-motion change applies without reload');
  await p.emulateMedia({ reducedMotion: 'no-preference' });

  ok(requests.every(u => u.startsWith('file:')), 'T24 zero network requests');
  ok(errors.length === 0, 'T25 no runtime errors ' + JSON.stringify(errors));
  await p.screenshot({ path: path.join(__dirname, 'shot.png') });
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
