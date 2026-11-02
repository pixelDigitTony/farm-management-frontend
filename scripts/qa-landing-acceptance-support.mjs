import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium, firefox, webkit} from '@playwright/test';
import {installQaRoutes, makeQaState, qaStoredId} from './landing-mobile-qa-fixtures.mjs';
export const root=fileURLToPath(new URL('../../',import.meta.url));
export const arg=(name,fallback)=>{let i=process.argv.indexOf(`--${name}`);return i<0?fallback:process.argv[i+1]};
export const url=arg('url','http://127.0.0.1:4182');
export const browserName=arg('browser','chromium');
export const output=path.resolve(root,arg('output',`design/landing-mobile-refinement-2026-11-01/qa-extended-${browserName}`));
await mkdir(output,{recursive:true});
export const checks=[],traffic=[],errors=[];
export const expect=(value,message,detail)=>assert.ok(value,`${message}${detail===undefined?'':`: ${JSON.stringify(detail)}`}`);
export async function hashes(){let files={};async function walk(dir){for(let d of await readdir(path.join(root,dir),{withFileTypes:true})){let f=path.posix.join(dir,d.name);if(d.isDirectory())await walk(f);else files[f]=createHash('sha256').update(await readFile(path.join(root,f))).digest('hex')}};for(let dir of ['farm-management-frontend/src','farm-management-frontend/dist','farm-management-backend/src/services'])await walk(dir);return files}
export const started=new Date().toISOString(),sourceBefore=await hashes();
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
export const browser=await ({chromium,firefox,webkit}[browserName]).launch({headless:true,...(browserName==='chromium'?{executablePath:chrome,args:['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']}: {})});
export const axe=await readFile(new URL(import.meta.resolve('axe-core/axe.min.js')),'utf8');
export const card=(page,n=1)=>page.locator(`#product-${qaStoredId(n)}`);
export async function shot(page,name){await page.waitForTimeout(150);await page.screenshot({path:path.join(output,`${name}.png`),animations:'disabled'});return `${name}.png`}
export async function check(id,requirements,page,action){try{let evidence=await action();checks.push({id,requirements,status:'PASS',evidence});console.log(`PASS ${id}`)}catch(e){let screenshot=page?await shot(page,`${id}-failure`).catch(()=>null):null;checks.push({id,requirements,status:'FAIL',error:e.stack,screenshot});console.log(`FAIL ${id}: ${e.message.split('\n')[0]}`)}}
export async function session(state=makeQaState(),options={}){const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block',...options});await installQaRoutes(context,state,new URL(url).origin);let page=await context.newPage();page.setDefaultTimeout(6500);page.on('pageerror',e=>errors.push(e.message));return {state,context,page,async go(){await page.goto(`${url}/site/${state.slug}`);await page.locator('.lp-storefront h1').waitFor({timeout:30000});await page.waitForTimeout(120)},async close(){state.pendingRelease?.();traffic.push({template:state.variant.template.id,requests:state.requests,images:state.imageRequests,orders:state.orders,unexpected:state.unexpectedApi});await context.close()}}}
export async function scenario(id,state,options,action){let s;try{s=await session(state,options);await s.go();await action(s)}catch(e){checks.push({id,requirements:['harness scenario setup'],status:'ERROR',error:e.stack});console.log(`ERROR ${id}: ${e.message.split('\n')[0]}`)}finally{await s?.close()}}
export async function a11y(page,name){await page.addScriptTag({content:axe});let result=await page.evaluate(async()=>{let r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return {violations:r.violations.map(x=>({id:x.id,impact:x.impact,nodes:x.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(x=>({id:x.id,nodes:x.nodes.map(n=>n.target)}))}});await writeFile(path.join(output,`${name}-axe.json`),JSON.stringify(result,null,2));return result}
export async function refresh(page,state,mutate){mutate(state);let r=page.waitForResponse(r=>/\/public\/landing-pages\/[^/]+$/.test(new URL(r.url()).pathname));await page.clock.fastForward(30100);await r;await page.waitForTimeout(120)}
export async function openCart(page){let bar=page.locator('.lp-public-cart-bar:visible');if(await bar.count())await bar.getByRole('button').click();else await page.getByRole('button',{name:/^Open cart,/}).click();await page.getByRole('dialog').getByRole('heading',{name:'Your cart',exact:true}).waitFor()}
export async function checkout(page){await card(page).getByRole('button',{name:'Add to cart',exact:true}).click();await openCart(page);await page.getByRole('button',{name:'Continue to checkout',exact:true}).click();await page.getByLabel('Name',{exact:true}).fill('QA Customer');await page.getByLabel('Mobile number',{exact:true}).fill('09171234567')}
export async function overflow(page){return page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:e.className?.baseVal??e.className,text:e.textContent?.slice(0,70),r:e.getBoundingClientRect(),style:getComputedStyle(e)})).filter(e=>e.r.right>innerWidth+1||e.r.left< -1).slice(0,30).map(e=>({tag:e.tag,cls:e.cls,text:e.text,x:e.r.x,y:e.r.y,w:e.r.width,right:e.r.right,overflow:e.style.overflowX,minWidth:e.style.minWidth}))}))}
export async function finish(){let after=await hashes();let changed=Object.keys(sourceBefore).filter(k=>sourceBefore[k]!==after[k]);let data={started,finished:new Date().toISOString(),browser:browserName,version:browser.version(),url,sourceBefore,sourceAfter:after,sourceChanged:changed,checks,traffic,pageErrors:errors,totals:{pass:checks.filter(c=>c.status==='PASS').length,fail:checks.filter(c=>c.status==='FAIL').length,error:checks.filter(c=>c.status==='ERROR').length}};await writeFile(path.join(output,'verification.json'),JSON.stringify(data,null,2));await browser.close();console.log(JSON.stringify(data.totals));if(data.totals.fail||data.totals.error||changed.length)process.exitCode=1;return data}
