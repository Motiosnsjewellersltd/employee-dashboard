const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,rules,now}=require('./test-daily-jewellery-quiz.cjs');
(async()=>{
 for(const role of ['EMPLOYEE','HR'])assert(rules.quizEligibleEmployee({role,status:'ACTIVE',department:'HRD'}));
 for(const department of ['HR','H.R.','Human Resources','मानव संसाधन'])assert(rules.quizEligibleEmployee({role:'EMPLOYEE',status:'ACTIVE',department}));
 for(const department of ['DRIVER','SECURITY','PANTRY'])assert(!rules.quizEligibleEmployee({role:'HR',status:'ACTIVE',department}));
 const f=fixture();f.employees.find(p=>p.id==='hr').department='HRD';f.user({id:'admin',role:'ADMIN'});
 let response=await f.admin.POST(f.req({action:'settings',settings:{...rules.DEFAULT_QUIZ_SETTINGS,selectedEmployeeIds:['hr'],targetEmployeeId:'hr'}}));assert.equal(response.status,200);
 const q=f.addQuestion({audience:[{employeeId:'hr',name:'HR Reviewer'}],notificationsStartedAt:null});
 assert.equal((await f.service.runDailyQuizNotifications({now,manual:true,questionId:q.id})).sent,1);assert.deepEqual(Array.from(f.pushes()[0].ids),['hr']);
 f.user({id:'hr',role:'HR'});assert.equal((await f.employee.GET(new Request('http://test/api/daily-quiz'))).status,200);assert.equal((await f.employee.POST(f.req({questionId:q.id,selectedIndex:0}))).status,200);
 assert.equal((await f.service.runDailyQuizNotifications({now:new Date(+now+3600000)})).sent,0);
 for(const action of ['settings','question','gameContent'])assert.equal((await f.admin.POST(f.req({action}))).status,403);assert.equal((await f.admin.DELETE(f.req({id:q.id}))).status,403);
 f.user({id:'other',role:'HR'});assert.equal((await f.employee.GET(new Request('http://test/api/daily-quiz'))).status,403,'HR role alone does not grant quiz access without Admin selection');
 const source=fs.readFileSync(path.join(__dirname,'../app/components/DashboardApp.tsx'),'utf8');assert(source.includes('if (section === "dailyQuiz") return true;'));assert(source.includes('section === "dashboard" && session.role === "HR" && <DailyJewelleryQuiz'));assert(source.includes('section === "dailyQuiz" && session.role === "ADMIN" && <AdminDailyJewelleryQuiz'));
 console.log('PASS: HR/HRD roster eligibility, Admin-only explicit selection, HR own question/answer/reminder stop and deep-link/home wiring; no HR create/edit/delete/manage privilege; other unselected accounts denied.');
})().catch(error=>{console.error(error);process.exitCode=1;});
