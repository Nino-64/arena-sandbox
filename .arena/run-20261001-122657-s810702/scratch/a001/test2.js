const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({viewport:{width:420,height:800}});
  const errs=[]; pg.on('pageerror', e=>errs.push(e.message));
  await pg.goto('file://'+__dirname+'/test.html');
  await pg.click('#playBtn');
  await pg.evaluate(async () => {
    const H = window.__orbitHop; let n=0;
    const t0=performance.now();
    while (H.state==='play' && performance.now()-t0<9000){
      const P=H.P;
      if (P.mode==='orbit'){
        const tx=-Math.sin(P.ang)*P.dir, ty=Math.cos(P.ang)*P.dir;
        const tgt = H.planets.filter(p=>!p.visited).sort((a,b)=>b.y-a.y)[0];
        if (tgt){ const dx=tgt.x-P.x, dy=tgt.y-P.y; const along=dx*tx+dy*ty; const perp=Math.abs(dx*ty-dy*tx);
          if (along>0 && perp<tgt.r*0.3) H.launch(); }
      }
      await new Promise(r=>requestAnimationFrame(r));
    }
  });
  await pg.waitForTimeout(150);
  await pg.screenshot({path:'mid.png'});
  await pg.addInitScript(()=>{if(!sessionStorage.x){sessionStorage.x=1;localStorage.setItem('orbithop.save.v1',JSON.stringify({best:35,gems:500,runs:1,owned:['ion'],skin:'ion'}));}});
  await pg.reload(); await pg.click('#menuSkinsBtn'); await pg.click('.skin:nth-child(4)'); await pg.click('.skin:nth-child(6)');
  await pg.waitForTimeout(400); await pg.screenshot({path:'skins.png'});
  console.log(await pg.evaluate(()=>localStorage.getItem('orbithop.save.v1')));
  await pg.setViewportSize({width:1280,height:720}); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
  await pg.keyboard.press('Space'); await pg.waitForTimeout(600); await pg.screenshot({path:'desk.png'});
  console.log('errors', errs, await pg.evaluate(()=>window.__orbitHop.state));
  await b.close();
})();
