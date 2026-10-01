import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1024, height: 700 } });
const errors=[]; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
await page.goto('file://' + process.cwd() + '/index.html'); await page.waitForTimeout(500);
await page.click('#btnPlay');
for (let i=0;i<60;i++){ await page.mouse.click(500,350); await page.waitForTimeout(250); }
await page.click('#btnSettings').catch(()=>{});
console.log('fatal', await page.evaluate(()=>document.getElementById('fatal').classList.contains('show')), 'save', await page.evaluate(()=>localStorage.getItem('orbital.save')));
console.log('ERRORS', errors); await browser.close();
