const { chromium } = require('playwright'); const path=require('path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await chromium.launch(); const errs=[];
 const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
 await p.goto('file://'+path.join(__dirname,'a003.html')); await sleep(400);
 await p.keyboard.press('ArrowUp'); await sleep(100);
 console.log('ArrowUp menu ->', await p.evaluate(()=>__orbita.state));
 let s; for(let i=0;i<600;i++){ s=await p.evaluate(()=>__orbita.state); if(s!=='play')break; await sleep(100);} 
 console.log('after idle:',s, await p.evaluate(()=>__orbita.run&&__orbita.run.score));
 await sleep(400); await p.touchscreen.tap(195,100); await sleep(50); console.log('tap1',await p.evaluate(()=>__orbita.state));
 await sleep(320); await p.touchscreen.tap(195,100); await sleep(50); console.log('tap2',await p.evaluate(()=>__orbita.state));
 console.log('save',await p.evaluate(()=>localStorage.getItem('orbita:save:v1')));
 // menu tap outside card
 await p.keyboard.press('Escape'); await sleep(50); await p.keyboard.press('Escape'); await sleep(100); console.log('state',await p.evaluate(()=>__orbita.state));
 await p.screenshot({path:'a003.png'});
 console.log('errors',JSON.stringify(errs)); await b.close();
})();
