const { chromium } = require('/opt/node-tools/node_modules/playwright');
const [phase, secs] = [Number(process.argv[2]), Number(process.argv[3])];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + process.cwd() + '/test.html');
  await p.click('#playBtn');
  await p.evaluate((phase) => {
    const t = window.__t, G = t.G;
    if (phase > 1) { G.phase = phase - 1; G.runTime = (phase - 1) * t.CFG.phaseLength - 0.01; G.speed = Math.min(t.CFG.maxSpeed, t.CFG.baseSpeed + (phase - 2) * t.CFG.speedPerPhase); }
    window.__minRead = 99; const seen = new WeakSet();
    setInterval(() => {
      if (t.mode !== 1) return;
      for (const e of G.entities) if (!seen.has(e)) { seen.add(e); window.__minRead = Math.min(window.__minRead, (e.at - G.angle) / G.speed); }
      const ahead = G.entities.filter(e => !e.resolved && e.at > G.angle);
      const nm = l => { const m = ahead.filter(e => e.type === 'mine' && e.lane === l).map(e => e.at - G.angle); return m.length ? Math.min(...m) : 99; };
      const cur = nm(G.lane), oth = nm(1 - G.lane);
      if (cur < 0.25 && oth > cur + 0.05) t.snapLane();
    }, 8);
  }, phase);
  await p.waitForTimeout(3000); await p.evaluate(() => { window.__minRead = 99; }); await p.waitForTimeout(secs * 1000 - 3000);
  console.log(JSON.stringify(await p.evaluate(() => ({ mode: window.__t.mode, phase: window.__t.G.phase, speed: +window.__t.G.speed.toFixed(2), t: +window.__t.G.runTime.toFixed(1), score: window.__t.G.score, cc: window.__t.G.closeCalls, minRead: +window.__minRead.toFixed(3) }))), errs);
  await b.close();
})();
