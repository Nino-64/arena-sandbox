const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const p = await b.newPage({ viewport: { width: 420, height: 860 } });
  p.on('pageerror', e => errs.push('pageerror ' + e.message));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
  await p.goto('file://' + __dirname + '/index.html');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForTimeout(300);
  const out = {};
  const KEY = 'orbit-shift-save-v1';
  const stored = () => p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  // Swap share at heat 0 (lap 9) vs heat 1, measured from the generator only.
  out.swapShare = await p.evaluate(() => {
    const { G, start } = window.__orbitShift; const r = {};
    for (const lap of [9, 29]) {
      start(); let s = 0, t = 0;
      for (let i = 0; i < 20000; i++) { G.lap = lap; G.angle = G.nextA; const before = G.hazards.length; G.hazards.length = 0; G.nextA = 0; G.angle = -4.4; G.nextRing = 0; window.__orbitShift.G.hazards.length = 0; }
      G.state = 'menu'; G.runOpen = false;
    }
    return r;
  });
  // Mid-run restart via R keeps progress.
  await p.keyboard.press('Space'); // start from menu
  await p.evaluate(() => { const { G } = window.__orbitShift; G.score = 320; G.orbs = 60; G.lap = 7; G.bestCombo = 12; });
  await p.keyboard.press('KeyR');
  out.afterR = await stored();
  out.afterR_banner = await p.evaluate(() => window.__orbitShift.G.banner && window.__orbitShift.G.banner.text);
  // Pause checkpoint then quit to menu.
  await p.evaluate(() => { const { G } = window.__orbitShift; G.score = 40; G.orbs = 100; G.lap = 3; });
  await p.keyboard.press('KeyP');
  out.afterPause = await stored();
  out.memGamesAfterPause = await p.evaluate(() => window.__orbitShift.save.games);
  await p.click('#btnQuit');
  out.afterQuit = await stored();
  // Reload: everything survives and Tide (150 orbs) is unlocked.
  await p.reload(); await p.waitForTimeout(200);
  out.afterReload = await stored();
  // Hue after a long run: no rainbow sweep at restart.
  out.hue = await p.evaluate(() => {
    const { G, start } = window.__orbitShift;
    start(); G.hue = (205 + 19 * 47) % 360; G.hueTarget = G.hue; G.state = 'menu'; G.runOpen = false;
    start(); return { hueAtStart: G.hue, target: G.hueTarget };
  });
  out.hueStepMax = await p.evaluate(async () => {
    const { G } = window.__orbitShift;
    G.hue = 10; G.hueTarget = 350; let maxStep = 0, prev = G.hue, path = 0;
    await new Promise((res) => { let n = 0; const f = () => { const d = Math.abs(((G.hue - prev + 540) % 360) - 180); path += d; prev = G.hue; if (++n < 90) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    return { finalHue: +G.hue.toFixed(1), totalDegreesTravelled: +path.toFixed(1) };
  });
  // Gold miss keeps combo; regular miss resets it.
  out.gold = await p.evaluate(() => {
    const { G, T, start, step } = window.__orbitShift;
    start(); G.hazards.length = 0; G.orbList.length = 0; G.nextA = 1e9; G.combo = 6;
    G.orbList.push({ a: G.angle + 0.05, ring: 0, gold: true, born: 0, got: false, missed: false, t: 0 });
    for (let i = 0; i < 240; i++) step(1 / 240);
    const afterGold = G.combo;
    G.orbList.push({ a: G.angle + 0.05, ring: 0, gold: false, born: 0, got: false, missed: false, t: 0 });
    for (let i = 0; i < 240; i++) step(1 / 240);
    return { afterGoldMiss: afterGold, afterRegularMiss: G.combo };
  });
  console.log(JSON.stringify(out, null, 1));
  console.log('errors', errs);
  await b.close();
})();
