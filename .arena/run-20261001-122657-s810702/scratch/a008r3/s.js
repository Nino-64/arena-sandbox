const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport:{width:390,height:844}, hasTouch:true })).newPage();
  const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.goto('file://'+__dirname+'/test.html'); await p.click('#playBtn');
  let deaths=0, lives=[];
  for (let i=0;i<120;i++){ await p.mouse.click(200,500); await p.waitForTimeout(100);
    const m=await p.evaluate(()=>__t.mode); if(m===2){deaths++; await p.waitForTimeout(450); await p.mouse.click(200,500);} }
  console.log('deaths',deaths,'mode',await p.evaluate(()=>__t.mode),'runs',await p.evaluate(()=>__t.Save.data.runs),'sr',await p.evaluate(()=>document.getElementById('srLive').textContent),'errors',errs);
  await b.close();})();
