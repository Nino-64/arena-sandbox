const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + __dirname + '/index.html');
  await p.evaluate(() => localStorage.setItem('orbit-shift-save-v1', JSON.stringify({best:300,totalOrbs:200,maxLap:6,games:25,skin:'prism',unlocked:['core','prism']})));
  await p.reload(); await p.waitForTimeout(300);
  console.log(await p.evaluate(() => JSON.stringify(window.__orbitShift.save)));
  await p.click('#btnPlay');
  await p.waitForTimeout(100);
  const r0 = await p.evaluate(() => window.__orbitShift.G.ring);
  await p.mouse.click(195, 700); // immediately after start: overlay fading, must reach canvas
  const r1 = await p.evaluate(() => window.__orbitShift.G.ring);
  console.log('ring before/after canvas click', r0, r1);
  await p.waitForTimeout(800);
  await p.screenshot({ path: 'shot-prism.png' });
  // die, then retry by tapping backdrop, then hop immediately
  await p.waitForTimeout(3500);
  console.log('state', await p.evaluate(() => window.__orbitShift.G.state));
  await p.mouse.click(30, 60);
  await p.waitForTimeout(50);
  const a = await p.evaluate(() => [window.__orbitShift.G.state, window.__orbitShift.G.ring]);
  await p.mouse.click(195, 780);
  const c = await p.evaluate(() => [window.__orbitShift.G.state, window.__orbitShift.G.ring]);
  console.log('retry then hop', a, c);
  console.log('errors', errs);
  await b.close();
})();
