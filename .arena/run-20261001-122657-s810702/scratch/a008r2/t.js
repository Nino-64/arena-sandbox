const { chromium } = require('/opt/node-tools/node_modules/playwright');
const URL = 'file://' + process.cwd() + '/test.html';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [];
  const mk = async (w, h) => { const p = await b.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); }); await p.goto(URL); await p.waitForTimeout(200); return p; };
  // A. close-call chord
  let p = await mk(1000, 800);
  await p.click('#playBtn'); await p.waitForTimeout(300);
  const setup = (lane) => p.evaluate((lane) => { const t = window.__t, G = t.G; G.spawnAt = G.angle + 1000; G.entities = [{ type: 'mine', lane, at: G.angle + 0.15, born: t.time, dead: false, spin: 0 }]; }, lane);
  await setup(0); // mine on the other (inner) lane, player outer
  await p.evaluate(() => { window.__t.snapLane(); window.__t.snapLane(); });
  await p.waitForTimeout(400);
  console.log('A chord:', await p.evaluate(() => ({ cc: window.__t.G.closeCalls, mode: window.__t.mode, score: window.__t.G.score })));
  await p.keyboard.down('w'); await p.keyboard.up('w'); await p.keyboard.down('s'); await p.keyboard.up('s');
  await setup(0); await p.keyboard.press('w'); await p.keyboard.press('s');
  await p.waitForTimeout(400);
  console.log('A keychord:', await p.evaluate(() => ({ cc: window.__t.G.closeCalls, lane: window.__t.G.lane, mode: window.__t.mode })));
  await setup(1); await p.evaluate(() => window.__t.snapLane()); // real dodge off the mine's orbit
  await p.waitForTimeout(400);
  console.log('A real dodge:', await p.evaluate(() => ({ cc: window.__t.G.closeCalls, lane: window.__t.G.lane, mode: window.__t.mode })));
  // C caps
  await p.evaluate(() => { const G = window.__t.G; G.entities = []; });
  const l0 = await p.evaluate(() => window.__t.G.lane);
  await p.keyboard.press('Shift+W');
  console.log('C Shift+W switched:', (await p.evaluate(() => window.__t.G.lane)) !== l0);
  // D R spam
  const runs0 = await p.evaluate(() => window.__t.Save.data.runs);
  for (let i = 0; i < 26; i++) { await p.keyboard.press('r'); await p.waitForTimeout(30); }
  console.log('D runs before/after 26xR:', runs0, await p.evaluate(() => ({ runs: window.__t.Save.data.runs, ach: window.__t.Save.data.ach })));
  // play 6s then R: counted
  await p.evaluate(() => { const G = window.__t.G; G.spawnAt = G.angle + 1000; G.entities = []; G.runTime = 5.5; });
  await p.waitForTimeout(700); await p.keyboard.press('r');
  console.log('D runs after 6s run + R:', await p.evaluate(() => window.__t.Save.data.runs));
  // B keyboard on over screen: die
  await p.evaluate(() => { const t = window.__t, G = t.G; G.spawnAt = G.angle + 1000; G.entities = [{ type: 'mine', lane: G.lane, at: G.angle + 0.05, born: t.time, dead: false, spin: 0 }]; });
  await p.waitForTimeout(1600);
  console.log('B over mode:', await p.evaluate(() => window.__t.mode), 'focus', await p.evaluate(() => document.activeElement.id));
  await p.keyboard.press('Tab');
  console.log('B focus after Tab:', await p.evaluate(() => document.activeElement.id));
  await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  console.log('B after Enter on Hangar:', await p.evaluate(() => ({ mode: window.__t.mode, hangar: document.getElementById('hangar').classList.contains('show') })));
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.evaluate(() => document.getElementById('overMenuBtn').focus());
  await p.keyboard.press('Space'); await p.waitForTimeout(400);
  console.log('B Space on Menu btn:', await p.evaluate(() => ({ mode: window.__t.mode, menu: document.getElementById('menu').classList.contains('show') })));
  await p.evaluate(() => document.getElementById('hangarBtn').focus());
  await p.keyboard.press('Space'); await p.waitForTimeout(400);
  console.log('B Space on menu Hangar btn:', await p.evaluate(() => ({ mode: window.__t.mode, hangar: document.getElementById('hangar').classList.contains('show') })));
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.evaluate(() => document.activeElement.blur()); await p.keyboard.press('Space'); await p.waitForTimeout(200);
  console.log('B Space on menu (nothing focused) starts:', await p.evaluate(() => window.__t.mode));
  await p.close();
  // E layout
  for (const [w, h] of [[844, 390], [390, 844], [1366, 768], [1280, 720], [1440, 900], [667, 375], [1024, 600]]) {
    p = await mk(w, h);
    await p.click('#playBtn'); await p.waitForTimeout(300);
    const r = await p.evaluate(() => { const v = window.__t.view; const cb = document.getElementById('combo').getBoundingClientRect().bottom; const m = v.unit * 0.022 * 3; return { unit: Math.round(v.unit), hudBottom: Math.round(cb), orbitTopMinusGlow: Math.round(v.cy - v.rOut - m), orbitBottomPlusGlow: Math.round(v.cy + v.rOut + m), h: innerHeight, coreTextHalfW: Math.round(v.unit*0.026*0.6*8/2), inner: Math.round(v.rIn) }; });
    console.log('E', w + 'x' + h, JSON.stringify(r), r.orbitTopMinusGlow >= r.hudBottom && r.orbitBottomPlusGlow <= r.h ? 'OK' : 'OVERLAP');
    if (w === 844) { await p.evaluate(() => { const G = window.__t.G; G.runTime = 17.9; }); await p.waitForTimeout(350); await p.screenshot({ path: 'phase-844.png' }); }
    if (w === 1366) { await p.evaluate(() => { const G = window.__t.G; G.runTime = 17.9; }); await p.waitForTimeout(350); await p.screenshot({ path: 'phase-1366.png' }); }
    await p.close();
  }
  console.log('errors:', errs);
  await b.close();
})();
