import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const f = process.argv[2];
const b = await chromium.launch();
for (const vp of [{width:1280,height:800},{width:390,height:844}]) {
const p = await b.newPage({viewport: vp});
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('file://'+process.cwd()+'/'+f);
await p.waitForTimeout(800);
await p.screenshot({path:f+'-menu-'+vp.width+'.png'});
const btns = await p.$$eval('button', bs=>bs.filter(b=>b.offsetParent).map(b=>b.id+':'+b.textContent.trim()));
console.log(f, vp.width, 'buttons', btns.join(' | '));
await p.keyboard.press('Enter'); await p.waitForTimeout(300);
await p.mouse.click(vp.width/2, vp.height/2);
for (let i=0;i<60;i++){ await p.waitForTimeout(250+Math.random()*300); await p.keyboard.press('Space'); if(i==20) await p.screenshot({path:f+'-play-'+vp.width+'.png'}); }
await p.screenshot({path:f+'-later-'+vp.width+'.png'});
await p.waitForTimeout(1500);
await p.keyboard.press('Space'); await p.waitForTimeout(2000);
const ls = await p.evaluate(()=>JSON.stringify(localStorage));
console.log('LS', ls.slice(0,400));
console.log('errors', errs);
await p.close();
}
await b.close();
