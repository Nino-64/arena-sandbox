const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--autoplay-policy=no-user-gesture-required'] });
  for (const vp of [{width:390,height:844},{width:1440,height:900}]) {
  const p = await b.newPage({ viewport: vp });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(500);
  await p.screenshot({ path: `menu-${vp.width}.png` });
  await p.click('#playBtn');
  await p.waitForTimeout(200);
  console.log('mode after play', await p.evaluate(() => window.__orbit.mode));
  // bot: dodge mines on our lane within 0.35 rad, else chase shards
  await p.evaluate(() => {
    window.__bot = setInterval(() => {
      const o = window.__orbit; if (o.mode !== 1) return;
      const G = o.G; const ahead = G.entities.filter(e => !e.resolved && e.at > G.angle).sort((a,b)=>a.at-b.at);
      const nextMine = ahead.find(e => e.type==='mine' && e.lane===G.lane);
      const otherMineSoon = ahead.find(e => e.type==='mine' && e.lane!==G.lane && e.at - G.angle < 0.35);
      if (nextMine && nextMine.at - G.angle < 0.3 && !otherMineSoon) { o.snapLane(); return; }
      const next = ahead[0];
      if (next && next.type==='shard' && next.lane!==G.lane && next.at - G.angle < 0.3) {
        const m = ahead.find(e => e.type==='mine' && e.lane!==G.lane && e.at - G.angle < 0.5); if (!m) o.snapLane();
      }
    }, 16);
  });
  await p.waitForTimeout(12000);
  await p.screenshot({ path: `play-${vp.width}.png` });
  const st = await p.evaluate(() => ({ mode: window.__orbit.mode, score: window.__orbit.G.score, phase: window.__orbit.G.phase, combo: window.__orbit.G.maxCombo, cc: window.__orbit.G.closeCalls }));
  console.log('bot state', JSON.stringify(st));
  await p.evaluate(() => clearInterval(window.__bot));
  await p.waitForTimeout(4000);
  console.log('mode after idle', await p.evaluate(() => window.__orbit.mode));
  await p.screenshot({ path: `over-${vp.width}.png` });
  console.log('save', await p.evaluate(() => localStorage.getItem('orbitsnap.save.v1')));
  await p.keyboard.press('Space');
  await p.waitForTimeout(200);
  console.log('mode after space retry', await p.evaluate(() => window.__orbit.mode));
  await p.keyboard.press('Space'); await p.waitForTimeout(150); await p.keyboard.press('Space');
  console.log('lane after taps', await p.evaluate(() => window.__orbit.G.lane), 'mode', await p.evaluate(() => window.__orbit.mode), 'runTime', await p.evaluate(() => window.__orbit.G.runTime.toFixed(2)));
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.screenshot({ path: `pause-${vp.width}.png` });
  await p.click('#pauseMenuBtn'); await p.waitForTimeout(400);
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('orbitsnap.save.v1')); d.bank = 500; localStorage.setItem('orbitsnap.save.v1', JSON.stringify(d)); });
  await p.reload(); await p.waitForTimeout(400);
  await p.click('#hangarBtn'); await p.waitForTimeout(400);
  await p.click('.skin:nth-child(2)'); await p.waitForTimeout(300);
  await p.screenshot({ path: `hangar-${vp.width}.png` });
  console.log('after buy', await p.evaluate(() => localStorage.getItem('orbitsnap.save.v1')));
  console.log('errors', errs);
  await p.close();
  }
  await b.close();
})();
