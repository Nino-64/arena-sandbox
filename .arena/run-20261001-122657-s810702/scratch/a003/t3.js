const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: {width:900,height:700} });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + __dirname + '/index.html');
  await p.click('#playBtn');
  await p.evaluate(() => {
    const TAU=Math.PI*2, wrap=a=>((a%TAU)+TAU)%TAU;
    setInterval(() => {
      const r = window.__orbita.run; if (!r || window.__orbita.state!=='play') return;
      if (Math.abs(r.lanePos - r.lane) > 0.01) return;
      const danger = (ring, lo, hi) => r.hazards.some(h => h.state!=='fade' && h.ring===ring && (()=>{const fd=wrap((h.a-r.a)*r.dir); return fd>lo && fd<hi || fd > TAU-0.17;})());
      const look = 0.17 + r.w*0.22;
      if (danger(r.lane, 0, look) && !danger(1-r.lane, 0, look*0.9)) window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',bubbles:true}));
      else if (!danger(1-r.lane, 0, look*1.6)) { const want = r.pickups.find(pk=>pk.ring!==r.lane && wrap((pk.a-r.a)*r.dir) < 0.25); if (want && !danger(r.lane,0,0.05)) window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',bubbles:true})); }
    }, 16);
  });
  for (let i=0;i<24;i++){ await p.waitForTimeout(5000); const s = await p.evaluate(()=>({st:window.__orbita.state, t: window.__orbita.run && +window.__orbita.run.time.toFixed(1), lvl: window.__orbita.run&&window.__orbita.run.level, score: window.__orbita.run&&window.__orbita.run.score, hz: window.__orbita.run&&window.__orbita.run.hazards.length})); console.log(JSON.stringify(s)); if (s.st!=='play') break; if (i===10) await p.screenshot({path:'late.png'}); }
  await b.close();
})();
