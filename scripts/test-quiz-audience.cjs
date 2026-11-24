const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),React=require('react');
const {fixture,load,rules,now}=require('./test-daily-jewellery-quiz.cjs'),{component}=require('./quiz-component-test-loader.cjs');
const {renderToStaticMarkup}=require('react-dom/server'),admin={id:'admin',name:'Admin',role:'ADMIN'};
const settings=ids=>({...rules.DEFAULT_QUIZ_SETTINGS,selectedEmployeeIds:ids,targetEmployeeId:ids[0]||''});
const body={date:'2026-11-20',question:'Question?',options:['A','B','C'],correctIndex:0,explanation:'A is right.',isPublished:true};
(async()=>{
 const f=fixture();f.employees[0].department='DESIGNING';f.employees[1].department='SALES';
 for(const [i,department,designation] of [[1,'DRIVER',''],[2,'security',''],[3,'Pantry',''],[7,'ADMINISTRATION','Driver'],[8,'SALES','Security Guard']])f.employees.push({...f.employees[1],id:'blocked'+i,department,designation});
 f.employees.push({...f.employees[1],id:'inactive',status:'INACTIVE'});
 f.user(admin);let data=(await(await f.admin.GET()).json()).data;assert.deepEqual(data.candidates.map(p=>p.id),['g','other','hr']);assert.equal(data.candidates[1].department,'SALES');
 let res=await f.admin.POST(f.req({action:'settings',settings:settings(['g','other'])}));assert.equal(res.status,200);
 res=await f.admin.POST(f.req({action:'question',question:body}));assert.equal(res.status,200);const q=(await res.json()).data.question;assert.equal(q.audience.length,2);
 const version=new Date(q.updatedAt).toISOString();let sent=await f.service.runDailyQuizNotifications({now,manual:true,questionId:q.id});assert.equal(sent.sent,2);assert.equal(f.blasts().length,1,'one atomic blast supports the full audience');assert.deepEqual(Array.from(f.pushes()[0].ids),['g','other']);assert(f.blasts()[0].recipients.create.every(r=>r.clearedAt&&!r.readAt));
 // Answering stops reminders only for that employee, never for everyone else.
 f.user({id:'g',role:'EMPLOYEE'});assert.equal((await f.employee.POST(f.req({questionId:q.id,selectedIndex:0}))).status,200);
 sent=await f.service.runDailyQuizNotifications({now:new Date(now.getTime()+3600000)});assert.equal(sent.sent,1);assert.deepEqual(Array.from(f.pushes().at(-1).ids),['other']);
 // Untick the remaining employee; stop access + future reminders immediately after save.
 f.user(admin);res=await f.admin.POST(f.req({action:'settings',settings:settings(['g'])}));assert.equal(res.status,200);assert.equal((await f.db.dailyQuizQuestion.findUnique({where:{id:q.id}})).updatedAt.toISOString(),version,'audience-only changes preserve open option versions');assert.equal((await f.service.runDailyQuizNotifications({now:new Date(now.getTime()+7200000)})).sent,0);
 f.user({id:'other',role:'EMPLOYEE'});assert.equal((await f.employee.GET(new Request('http://test/api/daily-quiz'))).status,403);assert.equal((await f.employee.POST(f.req({questionId:q.id,selectedIndex:0}))).status,403);
 f.user(admin);data=(await(await f.admin.GET()).json()).data;assert.equal(data.questions[0].report.correct,1,'existing answer history retained');assert.equal(data.questions[0].report.noResponse,0,'unticked unresponded employee removed from active audience');
 // Re-select: current/future existing activity includes the person; per-person gap still applies.
 assert.equal((await f.admin.POST(f.req({action:'settings',settings:settings(['g','other'])}))).status,200);
 sent=await f.service.runDailyQuizNotifications({now:new Date(now.getTime()+7200000)});assert.equal(sent.sent,1);assert.deepEqual(Array.from(f.pushes().at(-1).ids),['other']);
 for(const blocked of ['blocked1','blocked2','blocked3','blocked7','blocked8','inactive','missing'])assert.equal((await f.admin.POST(f.req({action:'settings',settings:settings([blocked])}))).status,400,blocked);
 assert.equal((await f.admin.POST(f.req({action:'settings',settings:settings([])}))).status,200);assert.deepEqual((await f.service.quizAccess()).targets,[]);assert.equal((await f.service.runDailyQuizNotifications({now:new Date(now.getTime()+10800000)})).sent,0,'Clear All never reverts to legacy/default person');
 // Past question snapshots and all answers are unaffected by selection changes.
 const old=f.addQuestion({date:'2026-11-19',audience:[{employeeId:'other',name:'Other Employee'}]});await f.admin.POST(f.req({action:'settings',settings:settings(['g'])}));assert.deepEqual((await f.db.dailyQuizQuestion.findUnique({where:{id:old.id}})).audience,[{employeeId:'other',name:'Other Employee'}]);assert.equal(f.answers().length,1);
 // Role/department changes are rechecked server side, even if an ID remains checked.
 const changed=fixture(),cq=changed.addQuestion();changed.employees[0].department='PANTRY';assert.equal((await changed.service.runDailyQuizNotifications({now})).sent,0);assert.equal((await changed.employee.GET(new Request('http://test/api/daily-quiz'))).status,403);
 const html=renderToStaticMarkup(React.createElement(component('app/components/QuizAudiencePicker.tsx').default,{people:data.candidates,selected:['g'],disabled:false,onChange:()=>{}}));assert(html.includes('Select All (3)'));assert(html.includes('Clear All'));assert.equal((html.match(/type="checkbox"/g)||[]).length,4);assert(html.includes('Other Employee'));assert(html.includes('SALES'));
 // Execute real checkbox handlers: select all, one untick, clear all.
 let values=[]; // SSR above uses real hooks; handler harness below supplies only this component's state.
 const mocked=component('app/components/QuizAudiencePicker.tsx',{react:{...React,useState:()=>['',()=>{}]}}).default;
 function allNodes(n,out=[]){if(!n||typeof n!=='object')return out;if(Array.isArray(n)){n.forEach(x=>allNodes(x,out));return out;}out.push(n);allNodes(n.props?.children,out);return out;}
 let nodes=allNodes(mocked({people:data.candidates,selected:['g'],disabled:false,onChange:v=>values=v}));nodes.filter(n=>n.type==='input'&&n.props.type==='checkbox')[0].props.onChange({target:{checked:true}});assert.deepEqual(Array.from(values),['g','other','hr']);
 nodes=allNodes(mocked({people:data.candidates,selected:['g','other'],disabled:false,onChange:v=>values=v}));nodes.filter(n=>n.type==='input'&&n.props.type==='checkbox')[2].props.onChange({target:{checked:false}});assert.deepEqual(Array.from(values),['g']);nodes.find(n=>n.type==='button').props.onClick();assert.deepEqual(Array.from(values),[]);
 console.log('PASS: eligible all-department roster; Driver/Security/Pantry excluded; HR/HRD can be selected only to play; select-all/individual untick/clear-all controls; server validation; multi-recipient private push; per-person answer-stop/gaps; current/future audience update without content version reset; saved deselection blocks access/reminders; old snapshots/answers retained; no automatic rollout on deploy.');
})().catch(e=>{console.error(e);process.exitCode=1;});
