import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const out=path.join(process.cwd(),'public','interactive-retry');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--hide-scrollbars','--autoplay-policy=no-user-gesture-required']});
const ctx=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:out,size:{width:1440,height:900}},locale:'en-US'});
const page=await ctx.newPage();const trace=[];const start=Date.now();const stamp=()=>Number(((Date.now()-start)/1000).toFixed(3));
page.on('response',r=>{if(r.url().includes('/api/'))trace.push({type:'api',at:stamp(),url:r.url(),status:r.status()});});
const wait=ms=>page.waitForTimeout(ms);
async function mark(id){trace.push({type:'chapter',id,at:stamp()});console.log('CHAPTER',id,stamp());}
async function snap(id){await page.screenshot({path:path.join(out,id+'.png')});await fs.writeFile(path.join(out,'trace-progress.json'),JSON.stringify(trace,null,2));}
async function click(sel){const l=page.locator(sel).first();await l.scrollIntoViewIfNeeded();const b=await l.boundingBox();if(b)await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});await wait(220);await l.click();await wait(650);trace.push({type:'click',selector:sel,at:stamp(),box:b});}
async function type(sel,text){const l=page.locator(sel).first();await l.scrollIntoViewIfNeeded();await l.click();await l.fill('');await l.pressSequentially(text,{delay:45});await wait(500);trace.push({type:'input',selector:sel,text,at:stamp()});}
async function close(){if(await page.locator('.sheet-head [data-close]').count())await click('.sheet-head [data-close]');}
async function hot(id){await close();await click('[data-area="'+id+'"]');}
try{
await page.goto('https://pocketroom-six.vercel.app/',{waitUntil:'networkidle',timeout:60000});await wait(1200);await mark('decor');await click('[data-act="decor"]');await click('[data-wall="sage"]');await page.locator('#decor-file').setInputFiles('public/interactive/room.png');await wait(1600);await snap('custom-poster');await close();await snap('custom-room');
await mark('wardrobe');await hot('wardrobe');await page.locator('#wd-photo').setInputFiles('C:/Users/anura/Downloads/wardrobe.jpg');await wait(1500);await snap('wardrobe-upload');await click('#wd-detect');await page.waitForFunction(()=>!document.querySelector('#wd-detect')?.disabled,{},{timeout:90000});await wait(1200);await snap('wardrobe-detected');console.log('WARDROBE', (await page.locator('.sheet-body').innerText()).slice(-2500));if(!await page.locator('[data-df="name"]').first().inputValue()){await click('#wd-detect');await page.waitForFunction(()=>!document.querySelector('#wd-detect')?.disabled,{},{timeout:90000});await wait(1200);await snap('wardrobe-retried');}if(!await page.locator('[data-df="name"]').first().inputValue()){await type('[data-df="name"]','Cream knit cardigan');await type('[data-df="color"]','cream');await type('[data-df="tags"]','cozy, work');trace.push({type:'disclosure',at:stamp(),message:'Live photo analysis unavailable after retry. Garment labelled manually.'});}await click('#wd-draft-save');await snap('wardrobe-saved');
if(await page.locator('[data-state]').count()>2){for(const [i,value] of [[0,'worn'],[1,'laundry'],[2,'unavailable']]){await page.locator('[data-state]').nth(i).selectOption(value);await wait(600);}await snap('wardrobe-states');}
await page.locator('#wd-occ').selectOption('work');await page.locator('#wd-occ').scrollIntoViewIfNeeded();await wait(700);await snap('outfit-suggestions');if(await page.locator('[data-keep]').count())await click('[data-keep]');
const picks=page.locator('[data-pick]');for(let i=0;i<Math.min(3,await picks.count());i++){await picks.nth(i).check();await wait(250);}await type('#wd-oname','Launch day');await click('#wd-save');await snap('outfit-saved');
await mark('end');
}catch(e){trace.push({type:'error',at:stamp(),message:String(e)});await snap('error');console.error(e);process.exitCode=1;}finally{const video=page.video();await ctx.close();const videoPath=await video.path();await fs.writeFile(path.join(out,'trace.json'),JSON.stringify({video:path.basename(videoPath),events:trace},null,2));await browser.close();console.log('VIDEO',videoPath);}


