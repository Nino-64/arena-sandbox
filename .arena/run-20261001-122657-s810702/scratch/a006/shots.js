const { chromium } = require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();
for(const [w,h] of [[1280,800],[390,844]]){const p=await b.newPage({viewport:{width:w,height:h}});
await p.goto('file://'+path.join(__dirname,'index.html'));await p.waitForTimeout(400);await p.screenshot({path:`menu${w}.png`});
await p.keyboard.press('Space');await p.waitForTimeout(3500);await p.screenshot({path:`run${w}.png`});}
await b.close()})()
