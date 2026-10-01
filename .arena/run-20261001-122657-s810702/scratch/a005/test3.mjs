import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => errors.push('pageerror: '+e.message));
await page.goto('file://' + process.cwd() + '/dbg.html');
await page.evaluate(()=>localStorage.setItem('orbital.save',JSON.stringify({v:1,best:20000,bestTime:1,totalGems:2000,runs:50,xp:9000,maxMult:8,skin:'prism',settings:{sfx:true,music:true,volume:0.7,shake:1}})));
await page.reload(); await page.waitForTimeout(400);
await page.click('#btnPlay'); await page.waitForTimeout(1500);
await page.evaluate(()=>{ __G.time=120; __G.shield=true; __G.magnetT=6; __G.combo=18; __G.mult=5; __G.comboT=3; __spawnPulse(); });
await page.waitForTimeout(700);
await page.screenshot({ path: 'shot-pulse.png' });
// god-mode: keep alive by invuln and check slowT render
await page.evaluate(()=>{ __G.slowT=4; __G.invuln=100; });
await page.waitForTimeout(3000);
console.log('state', await page.evaluate(()=>__G.state), 'score', await page.evaluate(()=>Math.floor(__G.score)));
// pause via visibility / Escape
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
console.log('after esc', await page.evaluate(()=>__G.state));
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
console.log('after esc2', await page.evaluate(()=>__G.state));
// perf check: frame time
const fps = await page.evaluate(()=>new Promise(r=>{let n=0;const t0=performance.now();function f(){n++; if(performance.now()-t0<2000) requestAnimationFrame(f); else r(n/2);} requestAnimationFrame(f);}));
console.log('fps', fps);
// force death
await page.evaluate(()=>{ __G.invuln=0; __G.shield=false; });
for (let i=0;i<60;i++){ if (await page.evaluate(()=>__G.state)!=='playing') break; await page.waitForTimeout(500);}
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shot-over2.png' });
console.log('ERRORS', errors);
await browser.close();
