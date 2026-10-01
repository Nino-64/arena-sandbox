const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + process.cwd() + '/test.html');
  await p.tap('#playBtn'); await p.waitForTimeout(4000); // play until first mine likely hits
  await p.waitForTimeout(4000);
  const st = await p.evaluate(() => ({ mode: window.__t.mode, save: window.__t.Save.data }));
  console.log('after 8s idle:', st.mode, st.save.runs, st.save.best);
  await p.evaluate(() => { const S = window.__t.Save; S.refresh(); S.data.bank = 500; S.write(); });
  await p.reload(); await p.waitForTimeout(300);
  await p.tap('#hangarBtn'); await p.waitForTimeout(400);
  await p.locator('.skin').nth(1).tap(); await p.waitForTimeout(200);
  console.log('after buy:', await p.evaluate(() => JSON.parse(localStorage.getItem('orbitsnap.save.v1'))));
  await p.tap('#hangarBack'); await p.waitForTimeout(400);
  console.log('menuBest', await p.textContent('#menuBest'), 'runs', await p.textContent('#menuRuns'));
  await p.tap('#playBtn'); await p.waitForTimeout(500); await p.tap('canvas'); await p.waitForTimeout(300);
  await p.click('#pauseBtn'); await p.waitForTimeout(300); console.log('paused', await p.evaluate(() => window.__t.mode));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200); console.log('resumed', await p.evaluate(() => window.__t.mode));
  console.log('errors', errs); await b.close();
})();
