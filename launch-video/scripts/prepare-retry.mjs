import fs from 'node:fs/promises';
let s=await fs.readFile('scripts/record-interactive.mjs','utf8');
s=s.replace("'interactive');","'interactive-retry');");
const a=s.indexOf('await page.goto(');const b=s.indexOf("await mark('wardrobe')",a);
s=s.slice(0,a)+`await page.goto('https://pocketroom-six.vercel.app/',{waitUntil:'networkidle',timeout:60000});await wait(1200);await mark('decor');await click('[data-act="decor"]');await click('[data-wall="sage"]');await page.locator('#decor-file').setInputFiles('public/interactive/room.png');await wait(1600);await snap('custom-poster');await close();await snap('custom-room');
`+s.slice(b,s.indexOf("await mark('window')",b))+"await mark('end');\n"+s.slice(s.indexOf('}catch(e)'));
s=s.replace("await click('#wd-draft-save');",`if(!await page.locator('[data-df="name"]').first().inputValue()){await click('#wd-detect');await page.waitForFunction(()=>!document.querySelector('#wd-detect')?.disabled,{},{timeout:90000});await wait(1200);await snap('wardrobe-retried');}if(!await page.locator('[data-df="name"]').first().inputValue()){await type('[data-df="name"]','Cream knit cardigan');await type('[data-df="color"]','cream');await type('[data-df="tags"]','cozy, work');trace.push({type:'disclosure',at:stamp(),message:'Live photo analysis unavailable after retry. Garment labelled manually.'});}await click('#wd-draft-save');`);
await fs.writeFile('scripts/record-retry.mjs',s);
