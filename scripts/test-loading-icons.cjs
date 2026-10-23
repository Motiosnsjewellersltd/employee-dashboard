const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const source=fs.readFileSync('lib/dataLoading.ts','utf8');let events=0;
const moduleObject={exports:{}};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:moduleObject,exports:moduleObject.exports,window:{dispatchEvent:()=>events++},Event});
const {beginDataLoad,pendingDataLoads}=moduleObject.exports;
(async()=>{
 const first=beginDataLoad(),second=beginDataLoad();assert.equal(pendingDataLoads(),2);first();first();assert.equal(pendingDataLoads(),1);second();assert.equal(pendingDataLoads(),0);assert.equal(events,4);
 const dashboard=fs.readFileSync('app/components/DashboardApp.tsx','utf8');
 const api=dashboard.slice(dashboard.indexOf('async function api('),dashboard.indexOf('\nfunction isNetworkFailure'));
 let mode='ok';const m={exports:{}};
 vm.runInNewContext(ts.transpileModule(api+'\nmodule.exports=api;',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,beginDataLoad,fetch:async()=>{if(mode==='network')throw new TypeError('Failed to fetch');return{json:async()=>{if(mode==='json')throw Error('bad json');return mode==='server'?{ok:false,error:'Server error'}:{ok:true,data:{value:1}};}};},showToast:()=>{},window:{dispatchEvent:()=>{}},isNetworkFailure:()=>true,Event});
 assert.equal((await m.exports('/test')).value,1);assert.equal(pendingDataLoads(),0);
 for(mode of ['network','json','server']){await assert.rejects(m.exports('/test'));assert.equal(pendingDataLoads(),0);}
 assert(!dashboard.includes('EmployeeQuickAccess'));assert(!dashboard.includes('EmployeeChangeHistory'));assert(!dashboard.includes('EmployeeAttendanceLeaves'));
 assert(!fs.existsSync('app/api/profile-history/route.ts'));
 console.log('PASS: concurrent/idempotent loading counter; API completion/network/JSON/server failure cleanup; removed experience UI/route.');
})().catch(e=>{console.error(e);process.exitCode=1;});
