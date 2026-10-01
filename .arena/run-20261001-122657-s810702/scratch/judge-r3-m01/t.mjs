import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
for (const f of ['a007','a008']) {
  const p = await b.newPage({viewport:{width:1280,height:720}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await p.goto('file://'+process.cwd()+'/'+f+'.html');
  await p.waitForTimeout(500);
  await p.screenshot({path:f+'-menu.png'});
  await p.keyboard.press('Space'); await p.waitForTimeout(300);
  // play: tap randomly
  for (let i=0;i<60;i++){ await p.mouse.click(640,400); await p.waitForTimeout(150+Math.random()*300); if(i==10) await p.screenshot({path:f+'-play.png'}); }
  await p.screenshot({path:f+'-late.png'});
  await p.waitForTimeout(2000);
  await p.screenshot({path:f+'-end.png'});
  const ls = await p.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  console.log(f, 'errors', errs, 'ls', ls.slice(0,400));
  await p.keyboard.press('r'); await p.waitForTimeout(500);
  await p.screenshot({path:f+'-restart.png'});
}
await b.close();
