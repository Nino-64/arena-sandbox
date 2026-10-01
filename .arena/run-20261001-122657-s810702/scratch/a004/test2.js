const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror ' + e.message));
  p.on('console', m => { if (m.type() === 'error' || m.type()==='warning') errs.push(m.type()+' '+m.text()); });
  await p.goto('file://' + __dirname + '/index.html');
  await p.waitForTimeout(300);
  console.log('focused', await p.evaluate(() => document.activeElement.id));
  await p.keyboard.press('Space'); // activates focused Play button natively
  await p.waitForTimeout(300);
  console.log('state after space', await p.evaluate(() => window.__orbitShift.G.state), 'focus', await p.evaluate(()=>document.activeElement.tagName));
  // play with bot via real time for 6 s
  await p.evaluate(() => {
    const { G, hop } = window.__orbitShift;
    window.__bot = setInterval(() => {
      if (G.state !== 'play') return;
      let next = null;
      for (const h of G.hazards) if (!h.passed && h.a > G.angle - 0.16 && (!next || h.a < next.a)) next = h;
      if (next && next.ring === G.ring && next.a - G.angle < 0.24) {
        let blocked = false;
        for (const h of G.hazards) if (h.ring !== G.ring && Math.abs(h.a - G.angle) < 0.17) blocked = true;
        if (!blocked) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      }
    }, 4);
  });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: 'shot-play1.png' });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: 'shot-play2.png' });
  console.log(await p.evaluate(() => { const G = window.__orbitShift.G; return { state: G.state, score: G.score, lap: G.lap, orbs: G.orbs, closes: G.closes, combo: G.combo }; }));
  await p.evaluate(() => clearInterval(window.__bot));
  await p.waitForTimeout(3000); // should die
  await p.screenshot({ path: 'shot-over.png' });
  console.log(await p.evaluate(() => ({ state: window.__orbitShift.G.state, ls: localStorage.getItem('orbit-shift-save-v1') })));
  await p.mouse.click(210, 120);
  await p.waitForTimeout(200);
  console.log('after tap', await p.evaluate(() => window.__orbitShift.G.state));
  // pause test
  await p.keyboard.press('KeyP');
  await p.waitForTimeout(300);
  console.log('after P', await p.evaluate(() => window.__orbitShift.G.state));
  await p.screenshot({ path: 'shot-pause.png' });
  await p.keyboard.press('Escape');
  console.log('after Esc', await p.evaluate(() => window.__orbitShift.G.state));
  // force unlocks via save & reload
  await p.evaluate(() => localStorage.setItem('orbit-shift-save-v1', JSON.stringify({best:60,totalOrbs:200,maxLap:3,games:5,skin:'nope',muted:false,unlocked:['core','bogus']})));
  await p.reload(); await p.waitForTimeout(400);
  console.log(await p.evaluate(() => JSON.stringify(window.__orbitShift.save)));
  await p.screenshot({ path: 'shot-menu2.png' });
  await p.setViewportSize({ width: 1280, height: 720 });
  await p.click('#btnPlay'); await p.waitForTimeout(1800);
  await p.screenshot({ path: 'shot-wide.png' });
  // corrupt storage
  await p.evaluate(() => localStorage.setItem('orbit-shift-save-v1', '{not json'));
  await p.reload(); await p.waitForTimeout(300);
  console.log('corrupt ->', await p.evaluate(() => JSON.stringify(window.__orbitShift.save)));
  console.log('errors', errs);
  await b.close();
})();
