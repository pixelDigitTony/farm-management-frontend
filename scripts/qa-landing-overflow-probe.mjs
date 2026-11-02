import {makeQaState} from './landing-mobile-qa-fixtures.mjs';
import {scenario,check,expect,overflow,shot,finish} from './qa-landing-acceptance-support.mjs';
for(let [template,width] of [['bold-market',704],['architectural-escape',320],['farm-and-market',320]])await scenario(`${template}-${width}`,makeQaState(template),{viewport:{width,height:844}},async({page})=>{await page.waitForTimeout(1600);await check(`${template}-${width}-settled-overflow`,['Q-07','V-17'],page,async()=>{let detail=await overflow(page);await shot(page,`${template}-${width}-settled`);console.log(JSON.stringify(detail));expect(detail.scrollWidth<=width+1,'Settled page overflow',detail);return detail})});
await finish();
