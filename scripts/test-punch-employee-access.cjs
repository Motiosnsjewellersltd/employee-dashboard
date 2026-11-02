const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,mocks={}){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,require:k=>Object.hasOwn(mocks,k)?mocks[k]:require(k),Request,Response,URL,Date,Intl,Buffer,Map,Set,console,document:{body:{}}});return module.exports;}
const access=load('lib/attendanceCalendarAccess.ts'),punch=load('lib/biometricPunch.ts');
let session={id:'employee-a',role:'EMPLOYEE'},queries=[],employeeQueries=0,missing=false;
const events=[{id:'before',employeeId:'employee-a',punchedAt:new Date('2026-09-30T18:29:59.999Z'),direction:'IN'},{id:'start',employeeId:'employee-a',punchedAt:new Date('2026-09-30T18:30:00Z'),direction:'IN'},{id:'last',employeeId:'employee-a',punchedAt:new Date('2026-10-31T18:29:59Z'),direction:'OUT'},{id:'next',employeeId:'employee-a',punchedAt:new Date('2026-10-31T18:30:00Z'),direction:'IN'},{id:'other',employeeId:'employee-b',punchedAt:new Date('2026-10-01T04:30:00Z'),direction:'IN'},{id:'future',employeeId:'employee-a',punchedAt:new Date('2099-10-01T04:30:00Z'),direction:'IN'}];
const prisma={employee:{findFirst:async()=>{employeeQueries++;return missing?null:{id:'employee-a'};}},biometricPunch:{findMany:async query=>{queries.push(query);const t=query.where.punchedAt;return events.filter(e=>e.employeeId===query.where.employeeId&&e.punchedAt>=t.gte&&e.punchedAt<t.lt&&e.punchedAt<=t.lte).map(({employeeId,...e})=>e);}},monthlyAttendance:{findUnique:async()=>({days:{'1':'P','2':'H'},sourceName:'existing.xlsx'})}};
const mocks={'next/server':{NextResponse:{json:(body,opts)=>Response.json(body,opts)}},'@/lib/auth':{requireSession:async()=>{if(!session)throw Error('Unauthorized');return session;}},'@/lib/prisma':{prisma},'@/lib/attendanceCalendarAccess':access,'@/lib/biometricPunch':punch,'@/lib/permissions':{requireHrPermission:async()=>{}},'@/lib/utils':{ok:data=>Response.json({ok:true,data}),fail:(e,status=400)=>Response.json({ok:false,error:String(e)},{status})},'@/lib/attendanceImport':{}};
const api=load('app/api/biometric-punches/route.ts',mocks),calendar=load('app/api/attendance-calendar/route.ts',mocks);
function req(id='employee-a',month='10/2026'){const url=new URL('http://test/api/biometric-punches');url.searchParams.set('employeeId',id);url.searchParams.set('monthYear',month);return{nextUrl:url};}
(async()=>{
 let result=await api.GET(req());assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');assert.deepEqual((await result.json()).data.punches.map(x=>x.id),['start','last']);assert.equal(queries[0].where.punchedAt.gte.toISOString(),'2026-09-30T18:30:00.000Z');
 const n=queries.length;assert.equal((await api.GET(req('employee-b'))).status,403);assert.equal(queries.length,n,'cannot query another employee');
 for(const month of ['04/2026','09/2026']){result=await api.GET(req('employee-a',month));assert.equal(result.status,200);assert.deepEqual((await result.json()).data.punches,[]);}assert.equal(queries.length,n,'no pre-October punch query');
 assert.equal((await api.GET(req('employee-a','03/2026'))).status,403);
 result=await api.GET(req('employee-a','10/2099'));assert.deepEqual((await result.json()).data.punches,[],'future punch times remain excluded');
 for(const role of ['ADMIN','HR']){session={id:'reviewer',role};assert.equal((await api.GET(req('employee-b'))).status,200);}
 session={id:'employee-a',role:'OTHER'};assert.equal((await api.GET(req())).status,403);
 session=null;assert.equal((await api.GET(req())).status,401);
 session={id:'employee-a',role:'EMPLOYEE'};missing=true;assert.equal((await api.GET(req())).status,404);missing=false;
 result=await calendar.GET(req());let data=(await result.json()).data;assert.equal(data.canViewPunchTimes,true);assert.equal(data.canUpload,false);assert.deepEqual(data.days,{'1':'P','2':'H'});
 assert.equal((await calendar.GET(req('employee-b'))).status,403);
 assert.equal((await calendar.POST({})).status,403,'employee import remains forbidden');
 for(const role of ['ADMIN','HR']){session={id:'reviewer',role};result=await calendar.GET(req('employee-a'));data=(await result.json()).data;assert.equal(data.canViewPunchTimes,true);assert.equal(data.canUpload,true);}
 // Render the real calendar with loaded authorized state, without network or a browser.
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 function renderCalendar(monthYear,canView=true,canUpload=false){
   const states=[true,null,20261102,{'1':'P'},canUpload,canView,false,false,'','',null,null,null];let index=0;
   const client=load('app/components/MonthlyAttendanceCalendar.tsx',{'react':{useState:()=>[states[index++],()=>{}],useRef:value=>({current:value}),useEffect:()=>{}},'react-dom':{createPortal:child=>child},'./DashboardIcon':{default:()=>null},'./BiometricPunchTimes':{default:()=>null},'./FourDotsLoader':{default:()=>null},'./MonthlyAttendanceCalendar.module.css':{default:new Proxy({},{get:(_,key)=>key})}});
   return renderToStaticMarkup(React.createElement(client.default,{employee:{id:'employee-a',name:'Employee A'},monthYear}));
 }
 const oct=renderCalendar('10/2026');assert.equal((oct.match(/View punch IN and OUT/g)||[]).length,31,'all October dates including 1 October are clickable');
 assert.equal((renderCalendar('09/2026').match(/View punch IN and OUT/g)||[]).length,0,'September has no timing buttons');
 assert.equal((renderCalendar('11/2026').match(/View punch IN and OUT/g)||[]).length,2,'future dates remain unclickable');
 assert.equal((renderCalendar('10/2026',false).match(/View punch IN and OUT/g)||[]).length,0,'access flag is respected');
 assert(!oct.includes('Upload October'),'employee has no upload controls');assert(renderCalendar('10/2026',true,true).includes('Upload October'),'Admin/HR upload controls retained');
 console.log('PASS: rendered calendar October 1–31 timing buttons; September and future date restrictions; role flag and upload controls.');
 console.log('PASS: employee self-only punch access; Admin/HR retained; unauthorized/other employee denied; IST 1 October inclusive boundary; no earlier/future punch exposure; existing attendance/status/import rights preserved.');
})().catch(e=>{console.error(e);process.exitCode=1;});
