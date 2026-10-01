const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  for (const vp of [{ width: 390, height: 844, hasTouch: true, isMobile: true }, { width: 1280, height: 720 }]) {
    const p = await b.newPage({ viewport: { width: vp.width, height: vp.height }, hasTouch: !!vp.hasTouch, isMobile: !!vp.isMobile });
    p.on('pageerror', e => errs.push('pageerror ' + e.message));
    p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
    await p.goto('file://' + __dirname + '/index.html');
    await p.waitForTimeout(300);
    await p.close();
  }
  const p = await b.newPage({ viewport: { width: 420, height: 860 } });
  p.on('pageerror', e => errs.push('pageerror ' + e.message));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
  await p.goto('file://' + __dirname + '/index.html');
  await p.waitForTimeout(300);
  const res = await p.evaluate(() => {
    const { G, T, start, hop, step } = window.__orbitShift;
    const TAU = Math.PI * 2, START = -Math.PI / 2;
    const out = {};
    function botStep() {
      let next = null;
      for (const h of G.hazards) if (!h.passed && h.a > G.angle - 0.16 && (!next || h.a < next.a)) next = h;
      if (next && next.ring === G.ring && next.a - G.angle < 0.32) {
        let blocked = false;
        for (const h of G.hazards) if (h.ring !== G.ring && Math.abs(h.a - G.angle) < 0.17) blocked = true;
        if (!blocked) hop();
      }
      step(1 / 240);
    }
    // 1) Natural progression from lap 1: 40 runs x 120 s.
    let deaths = 0, laps = [], banners = new Set();
    for (let run = 0; run < 40; run++) {
      start();
      let n = 0;
      while (G.state === 'play' && n < 240 * 120) { botStep(); n++; if (G.banner) banners.add(G.banner.text + ' ' + G.banner.sub); }
      if (G.state !== 'play') deaths++;
      laps.push(G.lap);
      G.state = 'menu'; G.runOpen = false;
    }
    out.natural = { deaths, minLap: Math.min(...laps), maxLap: Math.max(...laps), banners: [...banners].sort((a, b) => parseInt(a.slice(4)) - parseInt(b.slice(4))) };
    // 2) Max heat (lap 29+, 2.9 rad/s): 40 runs x 60 s; record gap stats from the generator.
    deaths = 0; let minSwap = 9, minSame = 9, swaps = 0, total = 0, golds = 0;
    for (let run = 0; run < 40; run++) {
      start();
      G.angle = START + 28 * TAU; G.lap = 29; G.nextA = G.angle + T.startGap; G.hazards.length = 0; G.orbList.length = 0;
      let prev = null, n = 0;
      const seen = new Set();
      while (G.state === 'play' && n < 240 * 60) {
        botStep(); n++;
        for (const h of G.hazards) if (!seen.has(h)) { seen.add(h); if (prev) { const g = h.a - prev.a; total++; if (h.ring !== prev.ring) { swaps++; minSwap = Math.min(minSwap, g); } else minSame = Math.min(minSame, g); } prev = h; }
        for (const o of G.orbList) if (o.gold && !seen.has(o)) { seen.add(o); golds++; }
      }
      if (G.state !== 'play') deaths++;
      G.state = 'menu'; G.runOpen = false;
    }
    out.maxHeat = { deaths, minSwapGap: +minSwap.toFixed(4), minSameGap: +minSame.toFixed(4), swapShare: +(swaps / total).toFixed(3), shardsPerRun: Math.round(total / 40), goldsPerRun: +(golds / 40).toFixed(1) };
    // 3) Lap-1 baseline swap share / shard count for comparison (lap 9, heat 0).
    let s9 = 0, t9 = 0;
    for (let run = 0; run < 40; run++) {
      start(); G.angle = START + 8 * TAU; G.lap = 9; G.nextA = G.angle + T.startGap; G.hazards.length = 0;
      let prev = null; const seen = new Set();
      for (let n = 0; n < 240 * 20; n++) { if (G.state !== 'play') break; botStep(); G.lap = 9; for (const h of G.hazards) if (!seen.has(h)) { seen.add(h); if (prev) { t9++; if (h.ring !== prev.ring) s9++; } prev = h; } }
      G.state = 'menu'; G.runOpen = false;
    }
    out.lap9 = { swapShare: +(s9 / t9).toFixed(3) };
    return out;
  });
  console.log(JSON.stringify(res, null, 1));
  console.log('errors', errs);
  await b.close();
})();
