const { chromium } = require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:800}});
await p.goto('file://'+path.join(__dirname,'index.html'));await p.waitForTimeout(300);
for (const startScore of [0,200]){
await p.evaluate((s)=>{startRun();G.score=s;window.__d=0;clearInterval(window.__a);window.__a=setInterval(()=>{if(G.state!=='play')return;
 const ahead=l=>G.obs.filter(o=>o.l===l&&!o.passed&&o.a-G.a>-0.2).map(o=>o.a-G.a).sort((a,b)=>a-b)[0]??9;
 const me=ahead(G.lane),ot=ahead(1-G.lane); if(me<0.4&&ot>me) flip();},4)},startScore);
await p.waitForTimeout(20000);
console.log('start',startScore,await p.evaluate(()=>({state:G.state,score:G.score,w:G.w,mult:G.mult,shards:G.runShards})));
await p.screenshot({path:'play'+startScore+'.png'});}
await p.evaluate(()=>{clearInterval(window.__a)});await p.waitForTimeout(15000);await p.waitForTimeout(800);await p.screenshot({path:'dead.png'});
await b.close()})()
