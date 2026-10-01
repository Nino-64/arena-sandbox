const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.click('#playBtn');
  let shot=false;
  for (let i=0;i<200;i++){ const ov = await p.evaluate(()=>document.getElementById('over').classList.contains('show')); if(ov) break; await p.waitForTimeout(150); if(Math.random()<0.3) await p.keyboard.press('Space'); if(i==40&&!shot){shot=true;await p.screenshot({path:'desk.png'});} }
  await p.waitForTimeout(900);
  console.log('badge', await p.evaluate(()=>document.getElementById('oBest').className), await p.evaluate(()=>document.getElementById('oScore').textContent));
  await p.screenshot({path:'over2.png'});
  console.log(errs);
  await b.close();
})();
