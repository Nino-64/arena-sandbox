const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 700 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto('file://' + __dirname + '/index.html');
  await p.waitForTimeout(500);
  await p.screenshot({ path: 'menu.png' });
  await p.keyboard.press('Space');
  for (let i = 0; i < 40; i++) { await p.waitForTimeout(250); if (i % 3 === 0) await p.mouse.click(450, 400); }
  await p.screenshot({ path: 'play.png' });
  // run until death
  for (let i=0;i<120;i++){ await p.waitForTimeout(250); if (await p.isVisible('#over')) break; }
  await p.waitForTimeout(1200);
  await p.screenshot({ path: 'over.png' });
  console.log('save', await p.evaluate(() => localStorage.getItem('pulse-orbit:v1')));
  await p.keyboard.press('Space');
  await p.waitForTimeout(300);
  console.log('hud visible after retry', await p.isVisible('#hud'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  console.log('paused', await p.isVisible('#pause'));
  await p.click('#pauseMenu'); await p.click('#shopBtn'); await p.waitForTimeout(400);
  await p.screenshot({ path: 'shop.png' });
  await p.setViewportSize({ width: 375, height: 740 }); await p.click('#shopBack'); await p.keyboard.press('Space'); await p.waitForTimeout(1500);
  await p.screenshot({ path: 'mobile.png' });
  console.log('errors', errs);
  await b.close();
})();
