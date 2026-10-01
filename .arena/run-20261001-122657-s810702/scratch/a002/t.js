const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 420, height: 860 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(800);
  await p.screenshot({ path: 'menu.png' });
  await p.keyboard.press('Space');
  await p.waitForTimeout(300);
  for (let i=0;i<40;i++){ await p.waitForTimeout(250); if (Math.random()<0.4) await p.mouse.click(200,500); if (i===12) await p.screenshot({path:'play.png'}); }
  // wait for death
  for (let i=0;i<120;i++){ const ov = await p.evaluate(()=>document.getElementById('over').classList.contains('show')); if(ov) break; await p.waitForTimeout(500);}
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'over.png' });
  console.log(await p.evaluate(()=>localStorage.getItem('orbit-pulse/save/v1')));
  await p.keyboard.press('Space'); await p.waitForTimeout(400);
  console.log('hud on after restart:', await p.evaluate(()=>document.getElementById('hud').classList.contains('on')));
  await p.keyboard.press('KeyP'); await p.waitForTimeout(300);
  console.log('pause shown:', await p.evaluate(()=>document.getElementById('pause').classList.contains('show')));
  await p.keyboard.press('KeyP'); await p.waitForTimeout(300);
  await p.click('#pauseBtn'); await p.click('#quitBtn'); await p.waitForTimeout(300);
  await p.click('#skinsBtn'); await p.waitForTimeout(400);
  await p.screenshot({ path: 'shop.png' });
  console.log('errors:', errs);
  await b.close();
})();
