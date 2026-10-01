const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const errs = []; const url = 'file://' + __dirname + '/test.html';
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  await p.goto(url); await p.waitForTimeout(300);
  // 4: Enter on fresh menu
  await p.keyboard.press('Enter'); await p.waitForTimeout(100);
  console.log('enter starts from menu:', await p.evaluate(() => __t.mode));
  console.log('hud aria-hidden while playing:', await p.evaluate(() => document.getElementById('hud').getAttribute('aria-hidden')));
  // 1: die, then key at 0.2s (ignored) and 0.5s (restarts)
  await p.evaluate(() => { __t.G.score = 50; __t.die(400, 300); });
  await p.waitForTimeout(150); await p.keyboard.press('Space');
  console.log('after 0.15s key mode (2=DYING):', await p.evaluate(() => __t.mode));
  await p.waitForTimeout(350); const t0 = await p.evaluate(() => __t.time);
  await p.keyboard.press('Space');
  console.log('after ~0.5s key mode (1=PLAY):', await p.evaluate(() => __t.mode), 'runs saved:', await p.evaluate(() => __t.Save.data.runs), 'best', await p.evaluate(() => __t.Save.data.best));
  // tap during dying
  await p.evaluate(() => { __t.die(400, 300); }); await p.waitForTimeout(450);
  await p.mouse.click(640, 360); console.log('tap during dying ->', await p.evaluate(() => __t.mode));
  // wait full card path still works
  await p.evaluate(() => { __t.die(400, 300); }); await p.waitForTimeout(1300);
  console.log('card mode (3):', await p.evaluate(() => __t.mode), 'srLive:', await p.evaluate(() => document.getElementById('srLive').textContent), 'hud aria-hidden:', await p.evaluate(() => document.getElementById('hud').getAttribute('aria-hidden')));
  await p.keyboard.press('Enter'); console.log('enter on card ->', await p.evaluate(() => __t.mode));
  // 2: second tab equips void + mutes during run
  const p2 = await ctx.newPage(); await p2.goto(url); await p2.waitForTimeout(200);
  await p2.evaluate(() => { const d = JSON.parse(localStorage.getItem('orbitsnap.save.v1')); d.owned.push('void'); d.skin = 'void'; d.muted = true; d.bank = 999; localStorage.setItem('orbitsnap.save.v1', JSON.stringify(d)); });
  await p.waitForTimeout(200);
  console.log('mid-run skin:', await p.evaluate(() => __t.skin().id), 'mid-run muted:', await p.evaluate(() => __t.Sound.muted), 'bank adopted:', await p.evaluate(() => __t.Save.data.bank));
  await p.bringToFront();
  await p.evaluate(() => { __t.die(400, 300); }); await p.waitForTimeout(1300);
  console.log('after run skin:', await p.evaluate(() => __t.skin().id), 'muted:', await p.evaluate(() => __t.Sound.muted), 'icon label:', await p.evaluate(() => document.getElementById('muteBtn').getAttribute('aria-label')), 'void still owned:', await p.evaluate(() => JSON.parse(localStorage.getItem('orbitsnap.save.v1')).owned.includes('void')));
  // multiplier announce
  await p.keyboard.press('Space'); await p.waitForTimeout(100);
  await p.evaluate(() => { __t.G.combo = 7; }); 
  console.log('mode', await p.evaluate(() => __t.mode));
  console.log('errors:', errs);
  await b.close();
})();
