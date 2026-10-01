const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: {width:390,height:844}, hasTouch: true });
  const errs=[]; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.screenshot({path:'menu-final.png'});
  await p.click('#playBtn');
  for (let i=0;i<10;i++){ await p.keyboard.press('Space'); await p.waitForTimeout(300); }
  await p.click('#muteBtn'); await p.keyboard.press('Space');
  await p.waitForTimeout(6000);
  const over = await p.evaluate(() => document.getElementById('over').classList.contains('show'));
  console.log('over shown', over);
  await p.mouse.click(195, 750); await p.waitForTimeout(300);
  console.log('playing after tap', await p.evaluate(() => document.body.classList.contains('playing')));
  console.log('save', await p.evaluate(() => localStorage.getItem('orbitsnap.save.v1')));
  console.log('errors', errs);
  await b.close();
})();
