const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async()=>{
 const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 for (const x of ['a007','a003']) for (const vp of [[1280,800],[375,667],[667,375],[568,320]]) {
  const ctx = await b.newContext({viewport:{width:vp[0],height:vp[1]},hasTouch:true});
  const p = await ctx.newPage(); const errs=[];
  p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await p.goto('file://'+process.cwd()+'/'+x+'.html'); await p.waitForTimeout(300);
  const vis = async sel => p.evaluate(s=>{return [...document.querySelectorAll(s)].filter(e=>e.offsetParent!==null||getComputedStyle(e).position==='fixed').map(e=>{const r=e.getBoundingClientRect();return (e.id||e.className)+':'+(r.bottom<=innerHeight&&r.top>=0?'in':'OUT('+Math.round(r.bottom)+')')}).join(' ')},sel);
  const menu = await vis('#menu button');
  await p.keyboard.press('Space'); await p.waitForTimeout(200);
  const st1 = await p.evaluate(()=>document.querySelector('#hud').hidden===false||!document.querySelector('#hud').classList.contains('idle'));
  // play until death by tapping randomly
  for (let i=0;i<60;i++){ await p.mouse.click(vp[0]/2, vp[1]-5); await p.waitForTimeout(150); if (await p.evaluate(()=>!document.querySelector('#over').hidden)) break; }
  await p.waitForTimeout(1200);
  const overShown = await p.evaluate(()=>!document.querySelector('#over').hidden);
  const over = await vis('#over button');
  const ls = await p.evaluate(()=>JSON.stringify(localStorage));
  console.log(x, vp.join('x'), '| menu', menu, '| playing', st1, '| over', overShown, over, '| ls', ls.slice(0,160), '| errs', errs);
  await ctx.close();
 }
 await b.close();
})();
