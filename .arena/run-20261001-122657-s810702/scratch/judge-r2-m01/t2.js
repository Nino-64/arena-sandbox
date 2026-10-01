const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async()=>{
 const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 for (const vp of [[667,375],[568,320]]) {
  const ctx = await b.newContext({viewport:{width:vp[0],height:vp[1]},hasTouch:true});
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+process.cwd()+'/a007.html'); await p.waitForTimeout(200);
  await p.click('#shopBtn'); await p.waitForTimeout(500);
  const shop = await p.evaluate(()=>{const r=document.querySelector('#shopBack').getBoundingClientRect();return r.bottom<=innerHeight});
  await p.click('#shopBack'); await p.keyboard.press('Space');
  for (let i=0;i<200;i++){ await p.waitForTimeout(100); if (await p.evaluate(()=>!document.querySelector('#over').hidden)) break; }
  await p.waitForTimeout(600);
  const over = await p.evaluate(()=>['#retryBtn','#overShop','#overMenu'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return s+(r.bottom<=innerHeight&&r.top>=0?':in':':OUT'+r.bottom)}).join(' '));
  console.log('a007',vp.join('x'),'shopBack in',shop,over,errs);
  const p2 = await ctx.newPage(); await p2.goto('file://'+process.cwd()+'/a003.html'); await p2.waitForTimeout(200);
  console.log('a003 menu scrollable', await p2.evaluate(()=>{const s=document.querySelector('#menu');return [s.scrollHeight,s.clientHeight,getComputedStyle(s).touchAction]}));
  await ctx.close();
 }
 await b.close();
})();
