const { chromium } = require('playwright'); const path=require('path');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.goto('file://'+path.join(__dirname,'index.html'));await new Promise(r=>setTimeout(r,300));
const res=await p.evaluate(()=>{const out=[];
 for (const startScore of [0,150,400,1000,3000]) for (const L of [0.2,0.25,0.3,0.35]) {
  let deaths=0, steps=0;
  for (let trial=0; trial<5; trial++){
   startRun(); G.score=startScore; let t=0;
   while(t<60*60 && G.state==='play'){ // 60 s sim
     const pa=PR()/G.r*0.6;
     const threat=G.obs.find(o=>!o.passed && o.l===G.lane && o.a-o.hw-pa-G.a < L && o.a+o.hw+pa>G.a);
     if(threat){ const other=G.obs.find(o=>!o.passed && o.l!==G.lane && Math.abs(o.a-G.a)<o.hw+pa+0.03); if(!other) flip(); }
     update(1/60); t++;
   }
   if(G.state==='dead') deaths++;
  }
  out.push({startScore,L,deaths,w:+G.w.toFixed(2)});
 }
 return out;});
console.table(res);await b.close();})();
