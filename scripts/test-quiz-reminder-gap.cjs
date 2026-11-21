const assert = require('node:assert/strict');
const {fixture,load,rules,now} = require('./test-daily-jewellery-quiz.cjs');
const fs = require('node:fs'), path = require('node:path');
const settings = intervalMinutes => ({...rules.DEFAULT_QUIZ_SETTINGS,targetEmployeeId:'g',intervalMinutes,messages:['First message','Second message','Third message']});
(async () => {
 for(const minutes of [1,30,60,120,180]) assert.equal(rules.validateQuizSettings(settings(minutes)).intervalMinutes,minutes);
 for(const minutes of [0,-1,2,5,1.5]) assert.throws(()=>rules.validateQuizSettings(settings(minutes)));
 const f=fixture(); f.config(settings(1)); const q=f.addQuestion({notificationsStartedAt:null});
 f.db.messageRecipient={findUnique:async()=>({pushStatus:'ACCEPTED'})};
 let status=await f.service.runDailyQuizNotifications({now,manual:true,questionId:q.id});
 assert.equal(status.sent,1); assert.equal(status.checkAgainInSeconds,60); assert.equal(status.intervalMinutes,1);
 assert.equal((await f.service.runDailyQuizNotifications({now:new Date(+now+59999)})).sent,0);
 for(const minute of [1,2,3]) {
  const at=new Date(+now+minute*60000);
  const results=await Promise.all([f.service.runDailyQuizNotifications({now:at}),f.service.runDailyQuizNotifications({now:at})]);
  assert.equal(results.filter(r=>r.sent===1).length,1,'only one reminder at the actual gap, even inside the same half-hour');
  assert(results.some(r=>r.pushStatus==='ACCEPTED'),'scheduled checks report actual single-recipient transport status too');
 }
 const recorded=JSON.parse(f.settings().get(rules.DAILY_QUIZ_LAST_RUN));assert.equal(recorded.sent,0);assert.equal(recorded.lastNotification.pushStatus,'ACCEPTED');assert.equal(recorded.lastNotification.checkedAt,new Date(+now+180000).toISOString(),'no-op checks preserve the last actual send');
 assert.equal(f.pushes().length,4); assert.equal(new Set(f.blasts().map(b=>b.id)).size,4);
 assert(f.blasts().every(b=>b.recipients.create.every(r=>r.clearedAt && !r.readAt)),'quiz pushes remain outside the employee bell');
 assert.deepEqual(f.pushes().map(p=>p.payload.body),['First message','Second message','Third message','First message']);
 await f.employee.POST(f.req({questionId:q.id,selectedIndex:0}));
 status=await f.service.runDailyQuizNotifications({now:new Date(+now+4*60000)});
 assert.equal(status.sent,0); assert.equal(status.checkAgainInSeconds,null,'stop active polling once all selected recipients answered');
 const two=fixture();two.config(settings(120));two.addQuestion();
 assert.equal((await two.service.runDailyQuizNotifications({now})).sent,1);
 for(let minute=1;minute<120;minute++) {
  status=await two.service.runDailyQuizNotifications({now:new Date(+now+minute*60000)});
  assert.equal(status.sent,0);assert.equal(status.checkAgainInSeconds,60,'runner keeps checking during the two-hour gap');
 }
 assert.equal((await two.service.runDailyQuizNotifications({now:new Date(+now+120*60000)})).sent,1);
 two.config(settings(1)); assert.equal((await two.service.runDailyQuizNotifications({now:new Date(+now+121*60000)})).sent,1,'changing from 120 to 1 takes effect without duplicate bucket collisions');
 two.config(settings(120)); assert.equal((await two.service.runDailyQuizNotifications({now:new Date(+now+122*60000)})).sent,0);
 const a=fixture();a.user({id:'admin',role:'ADMIN'});assert.equal((await a.admin.POST(a.req({action:'settings',settings:settings(1)}))).status,200);assert.equal(JSON.parse(a.settings().get(rules.DAILY_QUIZ_KEY)).intervalMinutes,1);
 for(const scenario of ['paused','deselected','past','future','draft','unstarted','outside']) {
  const x=fixture();x.config(settings(1)); x.addQuestion(scenario==='past'?{date:'2026-11-19'}:scenario==='future'?{date:'2026-11-21'}:scenario==='draft'?{isPublished:false}:scenario==='unstarted'?{notificationsStartedAt:null}:{});
  if(scenario==='paused')x.config({...settings(1),notificationsEnabled:false});
  if(scenario==='deselected')x.config({...settings(1),selectedEmployeeIds:[]});
  status=await x.service.runDailyQuizNotifications({now:scenario==='outside'?new Date('2026-11-20T14:30:00Z'):now});
  assert.equal(status.sent,0,scenario);assert.equal(status.checkAgainInSeconds,null,scenario);
 }
 const auth=load('app/api/daily-quiz/reminders/route.ts',{'@/lib/auth':{requireSession:async()=>{throw Error('no session')}},'@/lib/dailyQuizSchedulerAuth':{authenticateDailyQuizScheduler:async(req,fail)=>{fail({code:'SCHEDULER_REPOSITORY_MISMATCH'});return false;}},'@/lib/dailyQuiz':{runDailyQuizNotifications:async()=>{throw Error('must not run')}}});
 const denied=await auth.POST(new Request('http://test',{method:'POST',headers:{authorization:'Bearer hidden-test-token'}}));assert.equal(denied.status,401);const text=await denied.text();assert(text.includes('SCHEDULER_REPOSITORY_MISMATCH'));assert(!text.includes('hidden-test-token'));
 const source=fs.readFileSync(path.join(__dirname,'../app/components/AdminDailyJewelleryQuiz.tsx'),'utf8');assert(source.includes('[1,30,60,120,180].map'));assert(source.includes('1 minute (Test)'));
 console.log('PASS: real Admin settings API accepts one-minute test gap; minute-by-minute 120-minute reminder, exact 60-second threshold, repeated same-half-hour notifications, concurrent dedup, interval changes, transport reporting, hidden bell ledger, pause/answer/date/hour/access guards and safe auth diagnostics. Mock DB/transport; no live pushes.');
})().catch(error=>{console.error(error);process.exitCode=1;});
