const assert=require('node:assert/strict');
const {fixture,load,rules,now}=require('./test-leave-reminders.cjs');
(async()=>{
 const jose=await import('jose'),{publicKey,privateKey}=await jose.generateKeyPair('RS256');const jwk=await jose.exportJWK(publicKey);jwk.kid='test';const local=jose.createLocalJWKSet({keys:[jwk]});
 const auth=load('lib/leaveReminderAuth.ts',{jose:{...jose,createRemoteJWKSet:()=>local}});
 const claims={repository:'Motisonsjewellersltd/employee-dashboard',ref:'refs/heads/main',workflow_ref:'Motisonsjewellersltd/employee-dashboard/.github/workflows/leave-reminders.yml@refs/heads/main',event_name:'schedule'};
 async function token(change={},audience='motisons-leave-reminders',expiration='5m') {return new jose.SignJWT({...claims,...change}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer('https://token.actions.githubusercontent.com').setAudience(audience).setIssuedAt().setExpirationTime(expiration).sign(privateKey);}
 const request=async(t)=>new Request('https://test/api/leave-reminders',{method:'POST',headers:{authorization:'Bearer '+t}});
 assert.equal(await auth.authenticateLeaveScheduler(await request(await token())),true);
 for(const change of [{repository:'attacker/fork'},{ref:'refs/pull/1/merge'},{workflow_ref:'Motisonsjewellersltd/employee-dashboard/.github/workflows/other.yml@refs/heads/main'},{event_name:'pull_request'}])assert.equal(await auth.authenticateLeaveScheduler(await request(await token(change))),false);
 assert.equal(await auth.authenticateLeaveScheduler(await request(await token({},'other-audience'))),false);assert.equal(await auth.authenticateLeaveScheduler(await request(await token({},'motisons-leave-reminders','-1m'))),false);
 const wrongIssuer=await new jose.SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer('https://attacker.invalid').setAudience('motisons-leave-reminders').setIssuedAt().setExpirationTime('5m').sign(privateKey);
 assert.equal(await auth.authenticateLeaveScheduler(await request(wrongIssuer)),false);
 assert.equal(await auth.authenticateLeaveScheduler(await request('forged.token.signature')),false);
 let session=null,allow=true,calls=0;
 const endpoint=load('app/api/leave-reminders/route.ts',{'@/lib/auth':{requireSession:async()=>{if(!session)throw Error('no session');return session;}},'@/lib/permissions':{requireHrPermission:async()=>{if(!allow)throw Error('denied');}},'@/lib/leaveReminderAuth':auth,'@/lib/leaveReminders':{runLeaveReminders:async()=>{calls++;return{checked:0,notificationsCreated:0,nextCursor:null};}}});
 const post=(url='http://test/api/leave-reminders')=>endpoint.POST(new Request(url,{method:'POST'}));
 assert.equal((await post()).status,401);session={role:'EMPLOYEE'};assert.equal((await post()).status,403);session={role:'HR'};allow=false;assert.equal((await post()).status,403);session={role:'ADMIN'};allow=true;assert.equal((await endpoint.POST(await request('bad'))).status,401);assert.equal(calls,0);
 assert.equal((await post('http://test/api/leave-reminders?cursor=../bad')).status,400);assert.equal((await post()).status,200);session=null;assert.equal((await endpoint.POST(await request(await token()))).status,200);
 const f=fixture();f.add({id:'request-a'});f.employees.push({id:'outsider',name:'Other',role:'EMPLOYEE',status:'ACTIVE',deletedAt:null,exitDate:null});f.add({id:'request-other',requesterId:'outsider'});
 let initialPush=[];let user={id:'manager',role:'EMPLOYEE',isFloorManager:true};
 class FixedDate extends Date {constructor(...args){super(...(args.length?args:[now.getTime()]));}static now(){return now.getTime();}}
 const leave=load('app/api/leave-requests/route.ts',{'next/server':{},'@/lib/prisma':{prisma:f.db},'@/lib/auth':{requireSession:async()=>user},'@/lib/audit':{addAuditLog:async()=>{}},'@/lib/utils':{ok:data=>Response.json({ok:true,data}),fail:(error,status=400)=>Response.json({ok:false,error:String(error)},{status})},'@/lib/systemNotification':{addSystemNotification:async()=>{}},'@/lib/webPush':{sendPushToEmployees:async(ids,payload)=>initialPush.push({ids,payload})},'@/lib/permissions':{requireHrPermission:async()=>{}},'@/lib/teamScope':{...f.scope,getManagerRecord:async()=>f.employees.find(e=>e.id===user.id),getManagerTeamEmployeeIds:async()=>['e']},'@/lib/leaveReminderRules':{...rules,dueLeaveReminders:row=>rules.dueLeaveReminders(row,now)}},{Date:FixedDate});
 let response=await leave.GET(new Request('http://test/api/leave-requests?requestId=request-other'));assert.equal((await response.json()).data.requests.length,0,'deep link cannot bypass manager scope');
 response=await leave.GET(new Request('http://test/api/leave-requests?requestId=request-a'));let data=(await response.json()).data;assert.equal(data.requests.length,1);assert.equal(data.requests[0].managerActionPending,true);assert.equal(data.requests[0].leaveStartingSoon,true);
 user={id:'outsider',role:'EMPLOYEE'};response=await leave.GET(new Request('http://test/api/leave-requests?requestId=request-a'));assert.equal((await response.json()).data.requests.length,0);
 user={id:'e',name:'Employee',role:'EMPLOYEE'};
 response=await leave.POST(new Request('http://test/api/leave-requests',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fromDate:'2026-10-25',toDate:'2026-10-25',reason:'Test new leave'})}));assert.equal(response.status,200);
 assert.equal(f.blasts().at(-1).filterValue,'NEW_LEAVE_REQUEST_MANAGER:newrequest');assert.equal(initialPush.at(-1).payload.url,'/?section=leaveRequests&requestId=newrequest');assert.equal(initialPush.at(-1).ids[0],'manager');
 const targets=load('lib/notificationTargets.ts',{'./leaveReminderRules':rules});assert.equal(targets.employeeNotificationTarget('NEW_LEAVE_REQUEST_MANAGER:request-a'),'/?section=leaveRequests&requestId=request-a');assert.equal(targets.employeeNotificationTarget('EMPLOYEE_PROFILE_UPDATED'),'/?section=profile');
 console.log('PASS: actual signed JWT verification and issuer/audience/expiry/repository/workflow/branch/event rejection; endpoint auth/HR rights; deep-link team/self authorization; pending/urgent flags; existing notification targets.');
})().catch(e=>{console.error(e);process.exitCode=1;});
