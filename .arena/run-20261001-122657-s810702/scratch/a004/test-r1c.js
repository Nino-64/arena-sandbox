const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file://' + __dirname + '/index.html'); await p.waitForTimeout(200);
  console.log(JSON.stringify(await p.evaluate(() => {
    const { G, T, start } = window.__orbitShift; const START = -Math.PI / 2, TAU = Math.PI * 2; const r = {};
    for (const lap of [9, 19, 29]) {
      let s = 0, t = 0, gsum = 0;
      for (let run = 0; run < 1000; run++) {
        start(); G.angle = START + (lap - 1) * TAU; G.lap = lap; G.nextA = G.angle; G.hazards.length = 0;
        
        window.__orbitShift.step(0);
        const hs = G.hazards.slice().sort((a, b) => a.a - b.a);
        for (let i = 1; i < hs.length; i++) { t++; gsum += hs[i].a - hs[i - 1].a; if (hs[i].ring !== hs[i - 1].ring) s++; }
        G.state = 'menu'; G.runOpen = false;
      }
      r['lap' + lap] = { swapShare: +(s / t).toFixed(3), meanGap: +(gsum / t).toFixed(3), shardsPerSecond: +(2.9 / (gsum / t)).toFixed(2) };
    }
    return r;
  }), null, 1));
  await b.close();
})();
