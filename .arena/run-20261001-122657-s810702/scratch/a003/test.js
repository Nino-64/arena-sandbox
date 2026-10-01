const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  for (const vp of [{width:1280,height:800},{width:390,height:844}]) {
    const p = await b.newPage({ viewport: vp });
    p.on('pageerror', e => errors.push('pageerror '+e.message));
    p.on('console', m => { if (m.type()==='error') errors.push('console '+m.text()); });
    await p.goto('file://' + __dirname + '/index.html');
    await p.waitForTimeout(800);
    await p.screenshot({ path: `menu-${vp.width}.png` });
    await p.click('#playBtn');
    // play: tap periodically
    for (let i=0;i<20;i++){ await p.mouse.click(vp.width/2, vp.height*0.8); await p.waitForTimeout(350); }
    await p.screenshot({ path: `play-${vp.width}.png` });
    let st = await p.evaluate(()=>({s:window.__orbita.state, score: window.__orbita.run && window.__orbita.run.score, hz: window.__orbita.run && window.__orbita.run.hazards.length}));
    console.log(vp.width, st);
    // wait for death without input
    for (let i=0;i<60;i++){ const s = await p.evaluate(()=>window.__orbita.state); if (s==='over') break; await p.waitForTimeout(500); }
    await p.waitForTimeout(600);
    await p.screenshot({ path: `over-${vp.width}.png` });
    console.log(await p.evaluate(()=>({s:window.__orbita.state, save: window.__orbita.save, ls: localStorage.getItem('orbita:save:v1')})));
    await p.keyboard.press('KeyR');
    await p.waitForTimeout(200);
    console.log('after R', await p.evaluate(()=>window.__orbita.state));
    // corrupt save test
    await p.evaluate(()=>localStorage.setItem('orbita:save:v1','{"best":"NaN","games":-5,"orbs":1e99,"unlocked":["prism",3,"x"],"skin":"prism"'));
    await p.reload(); await p.waitForTimeout(300);
    console.log('corrupt', await p.evaluate(()=>({save: window.__orbita.save, bak: !!localStorage.getItem('orbita:save:v1:corrupt')})));
    await p.evaluate(()=>localStorage.setItem('orbita:save:v1','{"best":700,"games":-5,"orbs":"12","unlocked":["prism",3,"x"],"skin":"prism"}'));
    await p.reload(); await p.waitForTimeout(300);
    console.log('tampered', await p.evaluate(()=>window.__orbita.save));
    await p.screenshot({ path: `menu2-${vp.width}.png` });
    await p.evaluate(()=>localStorage.clear());
  }
  // storage blocked
  const ctx = await b.newContext();
  await ctx.addInitScript(()=>{ Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}}); });
  const p2 = await ctx.newPage(); p2.on('pageerror', e => errors.push('blocked pageerror '+e.message));
  await p2.goto('file://' + __dirname + '/index.html'); await p2.waitForTimeout(400);
  console.log('blocked warn visible', await p2.evaluate(()=>!document.getElementById('storeWarn').hidden));
  await p2.click('#playBtn'); await p2.waitForTimeout(500);
  console.log('blocked state', await p2.evaluate(()=>window.__orbita.state));
  console.log('ERRORS', errors);
  await b.close();
})();
