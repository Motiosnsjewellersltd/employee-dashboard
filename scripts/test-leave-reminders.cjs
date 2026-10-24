const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,mocks={},globals={}) { const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,require:k=>Object.hasOwn(mocks,k)?mocks[k]:k==="@/lib/leaveDayType"?load("lib/leaveDayType.ts"):require(k),Buffer,Request,Response,URL,Date,Intl,Map,Set,console,...globals});return module.exports; }
const rules=load('lib/leaveReminderRules.ts'),now=new Date('2026-10-24T12:00:00Z');
const copy=value=>structuredClone(value);
function fixture() {
 const employees=[
  {id:'e',name:'Employee',role:'EMPLOYEE',branch:'MT',floor:'Gold',department:'SALES',status:'ACTIVE',deletedAt:null,exitDate:null,isFloorManager:false},
  {id:'manager',name:'Manager',role:'EMPLOYEE',branch:'MT',floor:'Gold',department:'SALES',status:'ACTIVE',deletedAt:null,exitDate:null,isFloorManager:true,managerScope:'FLOOR'},
  {id:'other-manager',name:'Other Manager',role:'EMPLOYEE',branch:'JB',floor:'Gold',department:'SALES',status:'ACTIVE',deletedAt:null,exitDate:null,isFloorManager:true,managerScope:'FLOOR'},
  {id:'head',name:'Cheshta Malik',employeeCode:'7222',role:'EMPLOYEE',department:'DESIGNING',status:'ACTIVE',deletedAt:null,exitDate:null,isFloorManager:true,managerScope:'DEPARTMENT'},
  {id:'hr',name:'HR',role:'HR',status:'ACTIVE',deletedAt:null,exitDate:null},
  {id:'admin',name:'Admin',role:'ADMIN',status:'ACTIVE',deletedAt:null,exitDate:null}
 ];
 let rows=[],blasts=[],pushes=[],menu='true',sequence=0,queue=Promise.resolve(),decisionAtLock=false,failCreate=false;
 const match=(row,where={})=>Object.entries(where).every(([key,value])=>{
  if(key==='AND')return value.every(clause=>match(row,clause));if(key==='OR')return value.some(clause=>match(row,clause));
  const actual=key==='requester'?employees.find(e=>e.id===row.requesterId):row[key];
  if(value&&typeof value==='object'&&!(value instanceof Date)) {
   if('in'in value)return value.in.includes(actual);if('not'in value)return actual!==value.not;if('gt'in value)return actual>value.gt;if('gte'in value)return actual>=value.gte;if('equals'in value)return String(actual).toLowerCase()===String(value.equals).toLowerCase();if('startsWith'in value)return String(actual||'').startsWith(value.startsWith);
   return match(actual||{},value);
  }
  return actual===value;
 });
 const include=row=>row?copy({...row,requester:employees.find(e=>e.id===row.requesterId)}):null;
 const db={
  employee:{findMany:async({where})=>copy(employees.filter(e=>match(e,where))),findFirst:async({where})=>copy(employees.find(e=>match(e,where))||null)},
  permissionSetting:{findUnique:async()=>({value:menu})},
  leaveRequest:{findMany:async({where,take})=>rows.filter(r=>match(r,where)).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,take).map(include),findUnique:async({where})=>include(rows.find(r=>r.id===where.id)),create:async({data})=>{const row={id:'newrequest',status:'PENDING',createdAt:now,...data};rows.push(row);return include(row);}},
  notificationBlast:{findFirst:async({where})=>copy(blasts.filter(b=>match(b,where)).sort((a,b)=>b.createdAt-a.createdAt)[0]||null),create:async({data})=>{if(failCreate){failCreate=false;throw Error('storage failed');}if(blasts.some(b=>b.id===data.id))throw Object.assign(Error('unique'),{code:'P2002'});const b={...copy(data),id:data.id||'blast-'+ ++sequence,createdAt:data.createdAt||now};blasts.push(b);return b;}},
  $queryRaw:async()=>{if(decisionAtLock){decisionAtLock=false;rows[0].managerStatus='APPROVED';}},
  $transaction:async callback=>{let release;const lock=new Promise(r=>release=r);const before=queue;queue=lock;await before;const snapshot=copy(blasts);try{return await callback(db);}catch(e){blasts=snapshot;throw e;}finally{release();}}
 };
 const scope=load('lib/teamScope.ts',{'@/lib/prisma':{prisma:db}});
 const job=load('lib/leaveReminders.ts',{'@/lib/prisma':{prisma:db},'@/lib/teamScope':scope,'@/lib/webPush':{sendPushToEmployees:async(ids,payload)=>pushes.push({ids,payload})},'@/lib/leaveReminderRules':rules});
 return {db,scope,job,employees,add:(values={})=>{const r={id:'req-'+rows.length,requesterId:'e',status:'PENDING',managerStatus:'PENDING',createdAt:new Date(now-25*3600000),fromDate:new Date('2026-10-25T00:00:00Z'),toDate:new Date('2026-10-25T00:00:00Z'),reason:'Test',...values};rows.push(r);return r;},rows:()=>rows,blasts:()=>blasts,pushes:()=>pushes,menu:value=>menu=value,decideAtLock:()=>decisionAtLock=true,failCreate:()=>failCreate=true};
}
async function main(){
 const sample={id:'r',status:'PENDING',managerStatus:'PENDING',createdAt:new Date(now-6*3600000),fromDate:new Date('2026-10-29T00:00:00Z')};
 assert.equal(rules.dueLeaveReminders({...sample,createdAt:new Date(now-6*3600000+1)},now).length,0);assert.equal(rules.dueLeaveReminders(sample,now).length,1);
 assert.equal(rules.dueLeaveReminders({...sample,createdAt:new Date(now-24*3600000)},now).length,2);
 assert.equal(rules.dueLeaveReminders({...sample,managerStatus:'APPROVED'},now).length,0);assert.equal(rules.dueLeaveReminders({...sample,status:'REJECTED'},now).length,0);
 assert.equal(rules.leaveStartInIndia('2026-10-25T00:00:00Z'),Date.parse('2026-10-24T18:30:00Z'));
 assert.equal(rules.dueLeaveReminders({...sample,fromDate:'2026-10-25T00:00:00Z'},new Date('2026-10-23T18:30:00Z')).some(e=>e.kind==='LEAVE_STARTING_SOON'),false);
 const urgent={...sample,createdAt:new Date('2026-10-23T00:00:00Z'),fromDate:'2026-10-25T00:00:00Z'};
 assert.equal(rules.dueLeaveReminders(urgent,new Date('2026-10-23T18:29:59.999Z')).some(e=>e.kind==='LEAVE_STARTING_SOON'),false);
 assert.equal(rules.dueLeaveReminders(urgent,new Date('2026-10-23T18:30:00Z')).some(e=>e.kind==='LEAVE_STARTING_SOON'),true);
 assert.equal(rules.dueLeaveReminders(urgent,new Date('2026-10-24T18:30:00Z')).some(e=>e.kind==='LEAVE_STARTING_SOON'),false,'urgent only before leave starts');
 assert(rules.dueLeaveReminders(urgent,new Date('2026-10-24T18:30:00Z')).some(e=>e.kind==='LEAVE_MANAGER_REMINDER'),'manager reminders continue until a decision, even if leave date passes');
 assert.equal(rules.leaveNotificationTarget('LEAVE_MANAGER_REMINDER:req-1:3'),'/?section=leaveRequests&requestId=req-1');assert.equal(rules.leaveNotificationTarget('LEAVE_MANAGER_REMINDER:../evil:3'),null);
 const f=fixture();f.add();let stats=await f.job.runLeaveReminders({now});assert.equal(stats.notificationsCreated,3);
 const byKind=kind=>f.blasts().find(b=>b.filterValue.startsWith(kind+':'));
 assert.deepEqual(byKind('LEAVE_MANAGER_REMINDER').recipients.create.map(x=>x.employeeId),['manager']);assert.deepEqual(byKind('LEAVE_MANAGER_PENDING_24H').recipients.create.map(x=>x.employeeId),['hr']);assert.deepEqual(byKind('LEAVE_STARTING_SOON').recipients.create.map(x=>x.employeeId).sort(),['admin','hr']);
 assert(f.pushes().every(p=>p.payload.url==='/?section=leaveRequests&requestId=req-0'));
 stats=await f.job.runLeaveReminders({now});assert.equal(stats.notificationsCreated,0);assert.equal(f.blasts().length,3);
 f.rows()[0].managerStatus='APPROVED';stats=await f.job.runLeaveReminders({now:new Date(now.getTime()+6*3600000)});assert.equal(stats.notificationsCreated,0);
 const cooling=fixture();cooling.add({createdAt:new Date(now-11.9*3600000),fromDate:new Date('2026-10-29T00:00:00Z')});await cooling.job.runLeaveReminders({now});assert.equal((await cooling.job.runLeaveReminders({now:new Date(now.getTime()+.2*3600000)})).notificationsCreated,0);assert.equal((await cooling.job.runLeaveReminders({now:new Date(now.getTime()+6*3600000)})).notificationsCreated,1);
 const design=fixture();design.employees[0].department='DESIGNING';design.add();await design.job.runLeaveReminders({now});assert.equal(design.blasts().find(b=>b.filterValue.startsWith('LEAVE_MANAGER_REMINDER')).recipients.create[0].employeeId,'head');
 const race=fixture();race.add({fromDate:new Date('2026-10-29T00:00:00Z')});race.decideAtLock();assert.equal((await race.job.runLeaveReminders({now})).notificationsCreated,0);
 const concurrent=fixture();concurrent.add();await Promise.all([concurrent.job.runLeaveReminders({now}),concurrent.job.runLeaveReminders({now})]);assert.equal(concurrent.blasts().length,3);assert.equal(concurrent.pushes().length,3);
 const permissions=fixture();permissions.add();permissions.menu('false');await permissions.job.runLeaveReminders({now});assert.equal(permissions.blasts().length,2);assert(permissions.blasts().every(b=>!b.recipients.create.some(x=>x.employeeId==='hr')));
 const pages=fixture();for(let i=0;i<52;i++)pages.add({id:'page-'+String(i).padStart(3,'0'),createdAt:now,fromDate:new Date('2026-10-29T00:00:00Z')});stats=await pages.job.runLeaveReminders({now});assert(stats.nextCursor);assert.equal(stats.checked,50);assert.equal((await pages.job.runLeaveReminders({now,cursor:stats.nextCursor})).checked,2);
 const fail=fixture();fail.add();fail.failCreate();await assert.rejects(fail.job.runLeaveReminders({now}));assert.equal(fail.blasts().length,0);
 console.log('PASS: timing/India date rules; current backlog; 6-hour cooldown; correct managers/designing head/HR/Admin recipients; dedup/concurrency/decision race; permissions; pagination and rollback.');
}
module.exports={fixture,load,rules,now};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
