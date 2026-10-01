const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: {width:800,height:600} });
  p.on('console', m => console.log('console', m.type(), m.text()));
  await p.goto('file://' + __dirname + '/index.html');
  await p.click('#playBtn');
  for (let i=0;i<80;i++){ const s = await p.evaluate(()=>window.__orbita.state); if (s==='dying') { await p.screenshot({path:'dying.png'}); } if (s==='over') break; await p.waitForTimeout(100); }
  await p.waitForTimeout(300);
  await p.evaluate(()=>document.getElementById('over').hidden=true);
  await p.screenshot({ path: 'over-raw.png' });
  await b.close();
})();
