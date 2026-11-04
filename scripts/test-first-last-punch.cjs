// Render the actual punch popup with offline fixture state; no DB/device calls.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const file=path.join(__dirname,'../app/components/BiometricPunchTimes.tsx');
const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function render(punches,{day=4,monthYear='11/2026',loading=false,error='',configured=true}={}){
 const module={exports:{}},state=[punches,error,loading,configured,0];let i=0;
 const mocks={'react':{useEffect:()=>{},useRef:value=>({current:value}),useState:()=>[state[i++],()=>{}]},'./FourDotsLoader':{default:()=>React.createElement('p',null,'Loading punch times…')},'./BiometricPunchTimes.module.css':{default:new Proxy({},{get:(_,k)=>k})}};
 vm.runInNewContext(source,{module,exports:module.exports,require:k=>Object.hasOwn(mocks,k)?mocks[k]:require(k),Date,Intl,Map,Set,console});
 return renderToStaticMarkup(React.createElement(module.exports.default,{employeeId:'self',employeeName:'Test Employee',monthYear,day,onClose:()=>{}}));
}
const punch=(id,time,direction='UNKNOWN')=>({id,punchedAt:time,direction});
function times(events,options){return [...render(events,options).matchAll(/<strong>([^<]+)<\/strong>/g)].map(m=>m[1]);}
const morning=punch('morning','2026-11-04T09:30:00+05:30','OUT'),middle=punch('middle','2026-11-04T13:00:00+05:30','UNKNOWN'),evening=punch('evening','2026-11-04T19:15:00+05:30','IN');
assert.deepEqual(times([evening,middle,morning]),['09:30:00','19:15:00'],'sort chronologically, ignore machine direction and middle events');
for(const direction of ['IN','OUT','UNKNOWN']){
 assert.deepEqual(times([{...morning,direction}]),['09:30:00','—'],'one punch is IN with blank OUT for every vendor direction');
 assert.deepEqual(times([{...evening,direction},{...morning,direction}]),['09:30:00','19:15:00'],'both same-direction punches still produce IN and OUT');
}
assert.deepEqual(times([]),['—','—']);assert(render([]).includes('No punch records received for this date.'));
assert.deepEqual(times([punch('previous','2026-11-03T18:29:59Z'),punch('start','2026-11-03T18:30:00Z'),punch('end','2026-11-04T18:29:59Z'),punch('next','2026-11-04T18:30:00Z')]),['00:00:00','23:59:59'],'India midnight boundary does not mix previous/next dates');
assert.deepEqual(times([punch('before','2026-09-30T18:29:59Z'),punch('start','2026-09-30T18:30:00Z'),punch('end','2026-10-01T13:30:00Z')],{day:1,monthYear:'10/2026'}),['00:00:00','19:00:00'],'October start date preserved');
const html=render([morning,evening]);assert(html.includes('First IN'));assert(html.includes('Last OUT'));assert(!html.includes('Latest IN'));assert(html.includes('Close punch times'));assert(html.includes('Refresh'));
assert(render([],{loading:true}).includes('Loading punch times'));assert(render([],{error:'Test error'}).includes('Test error'));assert(render([],{configured:false}).includes('Punch integration setup pending.'));
console.log('PASS: real popup rendering; first/last chronological punches, all machine direction values, single/empty day, intervening punches, India midnight/month boundaries, existing refresh/close/loading/error states.');
