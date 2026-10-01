const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: {width:390,height:844} });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.click('#playBtn');
  for (let i=0;i<4;i++){ await p.waitForTimeout(500); console.log(await p.evaluate(() => { const G=window.__orbit.G; let n=0; return JSON.stringify({rt:G.runTime, a:G.angle, n:G.entities.length, mode:window.__orbit.mode}); })); }
  console.log(await p.evaluate(() => new Promise(r => { let c=0; const t0=performance.now(); const f=()=>{ if(++c<30) requestAnimationFrame(f); else r((performance.now()-t0)/30); }; requestAnimationFrame(f); })));
  await b.close();
})();
