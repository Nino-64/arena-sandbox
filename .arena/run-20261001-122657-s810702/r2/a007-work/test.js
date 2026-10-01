const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path='file://'+__dirname+'/test.html';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const errs=[]; const res={};
 // ---- desktop
 let p=await b.newPage({viewport:{width:1280,height:800}});
 p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
 await p.goto(path); await p.evaluate(()=>localStorage.clear()); await p.reload();
 await p.keyboard.press('Space'); await sleep(300);
 res.started=await p.evaluate(()=>__t.state);
 // Attack 3: score mid-run, then press R -> must be saved
 await p.evaluate(()=>{__t.G.score=500;__t.G.gems=7;});
 await sleep(100);
 res.hudRec=await p.evaluate(()=>document.querySelector('.hbest').classList.contains('rec'));
 await p.keyboard.press('KeyR'); await sleep(100);
 res.afterR=await p.evaluate(()=>JSON.parse(localStorage.getItem('pulse-orbit:v1')));
 // pause -> Menu path
 await p.evaluate(()=>{__t.G.score=900;}); await sleep(50);
 await p.keyboard.press('Escape'); await sleep(100); await p.click('#pauseMenu'); await sleep(100);
 res.afterMenu=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('pulse-orbit:v1'));return {best:s.best,plays:s.plays,xp:s.xp}});
 // checkpoint then crash: no double count
 await p.keyboard.press('Space'); await sleep(200);
 await p.evaluate(()=>{__t.G.score=100;__t.bank(false);__t.G.score=150;}); 
 // Attack 2: double-tap clutch farming. Put player on outer ring, live spike on inner ring ~0.1s ahead
 await p.evaluate(()=>{const G=__t.G;G.objs=[];G.hzT=99;G.gmT=99;G.clutches=0;G.p.ring=1;G.p.blend=1;
   G.objs.push({k:'h',ring:0,a:G.p.a+G.dir*G.omega*0.15,va:0,age:1,life:8,spin:0,prevD:null,passed:false});});
 await p.keyboard.press('Space'); await sleep(20); await p.keyboard.press('Space'); await sleep(500);
 res.doubleTap={clutches:await p.evaluate(()=>__t.G.clutches),state:await p.evaluate(()=>__t.state)};
 // genuine clutch: on inner ring, spike on inner ring 0.3 s ahead, swap at once
 await p.evaluate(()=>{const G=__t.G;G.objs=[];G.p.ring=0;G.p.blend=0;});
 await sleep(200);
 await p.evaluate(()=>{const G=__t.G;G.objs.push({k:'h',ring:0,a:G.p.a+G.dir*G.omega*0.28,va:0,age:1,life:8,spin:0,prevD:null,passed:false});});
 await p.keyboard.press('Space'); await sleep(600);
 res.genuine={clutches:await p.evaluate(()=>__t.G.clutches),state:await p.evaluate(()=>__t.state)};
 // let it die: put a live spike right ahead on current ring
 await p.evaluate(()=>{const G=__t.G;G.score=150;G.objs.push({k:'h',ring:G.p.ring,a:G.p.a+G.dir*0.2,va:0,age:1,life:8,spin:0,prevD:null,passed:false});});
 await sleep(1500);
 res.over={state:await p.evaluate(()=>__t.state),save:await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('pulse-orbit:v1'));return {best:s.best,plays:s.plays,xp:s.xp}}),
   visible:await p.isVisible('#over')};
 // Attack 5: record then instant retry during dying
 await p.keyboard.press('Space'); await sleep(200);
 await p.evaluate(()=>{const G=__t.G;G.score=5000;G.objs.push({k:'h',ring:G.p.ring,a:G.p.a+G.dir*0.15,va:0,age:1,life:8,spin:0,prevD:null,passed:false});});
 await sleep(500); res.dyingState=await p.evaluate(()=>__t.state);
 await p.keyboard.press('Space'); await sleep(100);
 res.instant={state:await p.evaluate(()=>__t.state),overVisible:await p.isVisible('#over'),best:await p.evaluate(()=>__t.S.best)};
 await p.screenshot({path:'shot-instant.png'});
 await p.close();
 // ---- landscape phone touch
 for (const vp of [{width:667,height:375},{width:568,height:320},{width:375,height:667}]) {
 const ctx=await b.newContext({viewport:vp,hasTouch:true,isMobile:true,deviceScaleFactor:2});
 p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e)));
 await p.goto(path);
 const inView=async sel=>{const r=await p.locator(sel).boundingBox();return r&&r.y>=0&&r.y+r.height<=vp.height&&r.x>=0&&r.x+r.width<=vp.width};
 const k=vp.width+'x'+vp.height; res[k]={};
 res[k].play=await inView('#playBtn'); res[k].shopBtn=await inView('#shopBtn');
 await p.tap('#shopBtn'); await sleep(500); res[k].shopBack=await inView('#shopBack');
 await p.screenshot({path:`shot-shop-${k}.png`});
 await p.tap('#shopBack'); await sleep(400);
 await p.tap('#playBtn'); await sleep(300);
 await p.evaluate(()=>{const G=__t.G;G.score=40;G.objs.push({k:'h',ring:G.p.ring,a:G.p.a+G.dir*0.2,va:0,age:1,life:8,spin:0,prevD:null,passed:false});});
 await sleep(1800);
 for (const s of ['#retryBtn','#overShop','#overMenu']) res[k][s]=await inView(s);
 await p.screenshot({path:`shot-over-${k}.png`});
 await p.tap('#overMenu'); await sleep(300); res[k].menuAfter=await p.evaluate(()=>__t.state);
 await ctx.close();
 }
 res.errors=errs;
 console.log(JSON.stringify(res,null,1));
 await b.close();
})();
