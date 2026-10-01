const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: {width:1000,height:800} });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.click('#playBtn');
  // smarter bot: decide lane by looking at upcoming items; it wants the lane whose next mine is farther
  await p.evaluate(() => {
    setInterval(() => {
      const o = window.__orbit; if (o.mode !== 1) return;
      const G = o.G; const ahead = G.entities.filter(e => !e.resolved && e.at > G.angle);
      const nm = l => { const m = ahead.filter(e => e.type==='mine' && e.lane===l).map(e=>e.at-G.angle); return m.length? Math.min(...m): 99; };
      const cur = nm(G.lane), oth = nm(1-G.lane);
      if (cur < 0.25 && oth > cur + 0.05) o.snapLane();
    }, 8);
  });
  const t0 = Date.now();
  while (Date.now()-t0 < 100000) {
    await p.waitForTimeout(5000);
    const st = await p.evaluate(() => ({ mode: window.__orbit.mode, score: window.__orbit.G.score, phase: window.__orbit.G.phase, sp: window.__orbit.G.speed.toFixed(2), t: window.__orbit.G.runTime.toFixed(1) }));
    console.log(JSON.stringify(st));
    if (st.mode !== 1) { await p.screenshot({path:'botdeath.png'}); break; }
    if (st.phase >= 4 && !global.shot) { global.shot = 1; await p.screenshot({path:'phase4.png'}); }
  }
  await b.close();
})();
