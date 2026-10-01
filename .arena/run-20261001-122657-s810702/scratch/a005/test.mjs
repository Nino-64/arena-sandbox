import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', m => { if (m.type()==='error' || m.type()==='warning') errors.push(m.type()+': '+m.text()); });
page.on('pageerror', e => errors.push('pageerror: '+e.message));
await page.goto('file://' + process.cwd() + '/index.html');
await page.waitForTimeout(800);
await page.screenshot({ path: 'shot-title.png' });
await page.click('#btnPlay');
await page.waitForTimeout(300);
for (let i=0;i<40;i++){ await page.keyboard.press('Space'); await page.waitForTimeout(150 + Math.random()*400); }
await page.screenshot({ path: 'shot-play.png' });
console.log('state', await page.evaluate(()=>window.__orbital.state), 'score', await page.evaluate(()=>window.__orbital.score));
// wait until dead
for (let i=0;i<120;i++){ const s=await page.evaluate(()=>window.__orbital.state); if (s==='over') break; await page.waitForTimeout(500); }
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shot-over.png' });
console.log('state', await page.evaluate(()=>window.__orbital.state), JSON.stringify(await page.evaluate(()=>window.__orbital.save)));
await page.keyboard.press('Space');
await page.waitForTimeout(300);
console.log('after retry', await page.evaluate(()=>window.__orbital.state));
// corrupt save test
await page.evaluate(()=>localStorage.setItem('orbital.save','{not json'));
await page.reload(); await page.waitForTimeout(600);
console.log('toast', await page.evaluate(()=>document.getElementById('toasts').innerText));
await page.evaluate(()=>localStorage.setItem('orbital.save',JSON.stringify({v:1,best:'9999',xp:-5,skin:'hack',settings:{volume:7}})));
await page.reload(); await page.waitForTimeout(600);
console.log('toast2', await page.evaluate(()=>document.getElementById('toasts').innerText), JSON.stringify(await page.evaluate(()=>window.__orbital.save)));
await page.evaluate(()=>localStorage.setItem('orbital.save',JSON.stringify({v:1,best:20000,totalGems:2000,runs:50,xp:90000,maxMult:8,skin:'prism'})));
await page.reload(); await page.waitForTimeout(600);
await page.click('#btnHangar'); await page.waitForTimeout(500);
await page.screenshot({ path: 'shot-hangar.png' });
await page.keyboard.press('Escape'); await page.click('#btnPlay'); await page.waitForTimeout(2500);
await page.screenshot({ path: 'shot-prism.png' });
await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(400);
await page.screenshot({ path: 'shot-mobile.png' });
console.log('fatal visible', await page.evaluate(()=>document.getElementById('fatal').classList.contains('show')));
console.log('ERRORS', errors);
await browser.close();
