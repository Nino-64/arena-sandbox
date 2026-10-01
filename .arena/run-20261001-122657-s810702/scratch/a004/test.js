const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror ' + e.message));
  p.on('console', m => { if (m.type() === 'error' || m.type()==='warning') errs.push(m.type()+' '+m.text()); });
  await p.goto('file://' + __dirname + '/index.html');
  await p.waitForTimeout(500);
  await p.screenshot({ path: 'shot-menu.png' });
  // Bot survival test at various speeds, simulated directly
  const res = await p.evaluate(() => {
    const { G, T, start, hop, step } = window.__orbitShift;
    const out = [];
    for (const omega of [1.7, 2.3, 2.9]) {
      const o0 = T.omega0; T.omega0 = omega; const mx = T.omegaMax; T.omegaMax = omega; 
      let deaths = 0, laps = 0, closes=0, orbs=0;
      for (let run = 0; run < 40; run++) {
        start();
        let steps = 0;
        while (G.state === 'play' && steps < 240 * 60) {
          // bot: find nearest upcoming hazard on my target ring
          let next = null;
          for (const h of G.hazards) if (!h.passed && h.a > G.angle - 0.16 && (!next || h.a < next.a)) next = h;
          // also consider: any hazard on other ring very near (just passed) blocks hop
          if (next && next.ring === G.ring && next.a - G.angle < 0.32) {
            let blocked = false;
            for (const h of G.hazards) if (h.ring !== G.ring && Math.abs(h.a - G.angle) < 0.17) blocked = true;
            if (!blocked) hop();
          }
          step(1/240); steps++;
        }
        if (G.state !== 'play') deaths++;
        laps += G.lap; closes += G.closes; orbs += G.orbs;
        G.state = 'menu';
      }
      T.omega0 = o0; T.omegaMax = mx;
      out.push({ omega, deaths, avgLap: laps/40, closes, orbs });
    }
    return out;
  });
  console.log(JSON.stringify(res, null, 1));
  console.log('errors', errs);
  await b.close();
})();
