import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => errors.push('pageerror: '+e.message));
page.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
await page.goto('file://' + process.cwd() + '/index.html');
await page.evaluate(()=>localStorage.setItem('orbital.save',JSON.stringify({v:1,best:6000,bestTime:1,totalGems:200,runs:3,xp:9000,maxMult:3,skin:'prism',settings:{sfx:true,music:true,volume:0.7,shake:1}})));
await page.reload(); await page.waitForTimeout(500);
await page.click('#btnHangar'); await page.waitForTimeout(600);
await page.screenshot({ path: 'shot-hangar.png' });
await page.click('#btnHangarBack'); await page.waitForTimeout(400);
await page.screenshot({ path: 'shot-title.png' });
await page.click('#btnPlay');
// survive by flipping randomly for ~25s to see pulses
for (let i=0;i<70;i++){ await page.mouse.click(640,400); await page.waitForTimeout(200+Math.random()*300); if (i===50) await page.screenshot({ path: 'shot-prism.png' }); }
await page.screenshot({ path: 'shot-late.png' });
// pause/resume via key
const st = await page.evaluate(()=>window.__orbital.state);
console.log('state', st);
// blocked storage
const p2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
p2.on('pageerror', e => errors.push('p2 pageerror: '+e.message));
await p2.addInitScript(()=>{ Object.defineProperty(window,'localStorage',{get(){ throw new DOMException('denied','SecurityError'); }}); });
await p2.goto('file://' + process.cwd() + '/index.html'); await p2.waitForTimeout(700);
await p2.screenshot({ path: 'shot-blocked.png' });
console.log('blocked note:', await p2.evaluate(()=>document.getElementById('storeNote').innerText));
await p2.click('#btnPlay'); await p2.waitForTimeout(1500);
await p2.screenshot({ path: 'shot-mobile.png' });
console.log('ERRORS', errors);
await browser.close();
