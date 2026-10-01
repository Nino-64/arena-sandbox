const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({viewport:{width:420,height:800}});
  const errs=[]; pg.on('pageerror', e=>errs.push(e.message)); pg.on('console', m=>{ if(m.type()==='error') errs.push(m.text()); });
  await pg.goto('file://'+__dirname+'/test.html');
  await pg.waitForTimeout(500);
  await pg.screenshot({path:'menu.png'});
  await pg.click('#playBtn');
  // bot: launch when tangent aims within the next planet capture radius
  const res = await pg.evaluate(async () => {
    const H = window.__orbitHop; const out=[];
    for (let run=0; run<3; run++){
      if (H.state!=='play') H.startRun();
      let t0=performance.now();
      while (H.state==='play' && performance.now()-t0<25000){
        const P=H.P;
        if (P.mode==='orbit'){
          const tx=-Math.sin(P.ang)*P.dir, ty=Math.cos(P.ang)*P.dir;
          const tgt = H.planets.filter(p=>!p.visited && p!==P.planet).sort((a,b)=>b.y-a.y)[0];
          if (tgt){ const dx=tgt.x-P.x, dy=tgt.y-P.y; const along=dx*tx+dy*ty; const perp=Math.abs(dx*ty-dy*tx);
            if (along>0 && perp<tgt.r*0.3 + (run==2?60:0)) H.launch(); }
        }
        await new Promise(r=>requestAnimationFrame(r));
      }
      out.push({state:H.state, score:H.score});
      await new Promise(r=>setTimeout(r,1500));
    }
    return out;
  });
  console.log(JSON.stringify(res));
  await pg.screenshot({path:'over.png'});
  console.log(await pg.evaluate(()=>localStorage.getItem('orbithop.save.v1')));
  await pg.mouse.click(200,700); await pg.waitForTimeout(400);
  console.log('after tap state', await pg.evaluate(()=>window.__orbitHop.state));
  await pg.waitForTimeout(800); await pg.screenshot({path:'play.png'});
  await pg.keyboard.press('Space'); await pg.waitForTimeout(3000);
  await pg.screenshot({path:'later.png'});
  console.log('errors', errs);
  await b.close();
})();
