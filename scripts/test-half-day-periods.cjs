const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { fixture, load, rules, now } = require('./test-leave-reminders.cjs');
const day = load('lib/leaveDayType.ts');
async function main() {
  for (const type of ['HALF', 'HALF_FIRST', 'HALF_SECOND']) assert(day.isHalfDay(type));
  assert(!day.isHalfDay('FULL')); assert(!day.isHalfDay('invalid'));
  assert.equal(day.leaveDayTypeLabel('HALF_FIRST'), 'First Half (Morning)');
  assert.equal(day.leaveDayTypeLabel('HALF_SECOND'), 'Second Half (Evening)');
  assert.equal(day.leaveDayTypeLabel('HALF'), 'Half Day — Time not specified');
  assert.equal(day.leaveHalfDetails('2026-10-25','2026-10-25','FULL','FULL'), '');
  assert.match(day.leaveHalfDetails('2026-10-31','2026-11-02','HALF_SECOND','HALF_FIRST'), /2026-10-31: Second Half.*2026-11-02: First Half/);
  // Exercise the actual private count/allocation functions used by final HR approval.
  const source = fs.readFileSync('app/api/leave-requests/route.ts','utf8');
  const ast = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
  const funcs = ast.statements.filter(s => ts.isFunctionDeclaration(s) && ['inclusiveDayCount','monthlyLeaveBreakdown'].includes(s.name?.text)).map(s => s.getText(ast)).join('\n');
  const context = { isHalfDay: day.isHalfDay, Date, Map };
  vm.createContext(context); vm.runInContext(ts.transpileModule(funcs,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  for (const type of ['HALF','HALF_FIRST','HALF_SECOND']) {
    const from=new Date('2026-10-31T00:00:00Z'), to=new Date('2026-11-02T00:00:00Z');
    assert.equal(context.inclusiveDayCount(from,from,type,type),0.5);
    assert.equal(context.inclusiveDayCount(from,to,type,type),2);
    assert.equal(JSON.stringify(context.monthlyLeaveBreakdown(from,to,type,type)),JSON.stringify([{monthYear:'10/2026',leave:0.5},{monthYear:'11/2026',leave:1.5}]));
  }
  assert.equal(context.inclusiveDayCount(new Date('2026-10-31'),new Date('2026-11-02'),'FULL','FULL'),3);
  class FixedDate extends Date { constructor(...args){super(...(args.length?args:[now.getTime()]));} }
  for(const type of ['FULL','HALF','HALF_FIRST','HALF_SECOND','INVALID']) {
    const f=fixture(), pushes=[],system=[],audits=[];
    const api=load('app/api/leave-requests/route.ts',{
      'next/server':{},'@/lib/prisma':{prisma:f.db},'@/lib/auth':{requireSession:async()=>({id:'e',name:'Employee',role:'EMPLOYEE'})},
      '@/lib/audit':{addAuditLog:async x=>audits.push(x)},'@/lib/utils':{ok:data=>Response.json({ok:true,data}),fail:(e,status=400)=>Response.json({ok:false,error:String(e)},{status})},
      '@/lib/systemNotification':{addSystemNotification:async x=>system.push(x)},'@/lib/webPush':{sendPushToEmployees:async(ids,payload)=>pushes.push(payload)},
      '@/lib/permissions':{requireHrPermission:async()=>{}},'@/lib/teamScope':f.scope,'@/lib/leaveReminderRules':rules
    },{Date:FixedDate});
    const response=await api.POST(new Request('http://test/api/leave-requests',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fromDate:'2026-10-25',toDate:'2026-10-25',fromDayType:type,toDayType:'FULL',reason:'Test'})}));
    assert.equal(response.status,type==='INVALID'?400:200);
    if(type==='INVALID'){assert.equal(f.rows().length,0);continue;}
    const saved=(await response.json()).data.request;
    assert.equal(saved.fromDayType,type);assert.equal(saved.toDayType,type,'same-day second field must stay synchronized');
    assert.equal(audits[0].details.days,type==='FULL'?1:0.5);
    if(type!=='FULL') for(const text of [pushes[0].body,system[0].text,f.blasts()[0].text])assert(text.includes(day.leaveDayTypeLabel(type)));
  }
  const availability=load('lib/branchAvailability.ts');
  for(const type of ['HALF','HALF_FIRST','HALF_SECOND']){
    const employee={id:'e',name:'Employee',employeeCode:null,department:'SALES',designation:'Sales',branch:'MT',floor:'Gold',status:'ACTIVE',doj:null,exitDate:null};
    const leave={requesterId:'e',fromDate:new Date('2026-10-25'),toDate:new Date('2026-10-25'),fromDayType:type,toDayType:type,status:'PENDING',managerStatus:'PENDING'};
    const result=availability.buildBranchAvailability([employee],[leave],[],'2026-10-25','MT','2026-10-24');
    assert.match(result.groups.pending[0].note,/Half-day/);
    const f=fixture();f.add({fromDayType:type,toDayType:type});await f.job.runLeaveReminders({now});
    for(const push of f.pushes())assert(push.payload.body.includes(day.leaveDayTypeLabel(type)));
  }
  console.log('PASS: first/second-half persistence, same-day synchronization, invalid values, legacy HALF, manager/HR/push/reminder labels, unchanged full/half-day totals, cross-month approval allocation and branch half-day classification.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
