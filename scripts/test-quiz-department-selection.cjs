const assert=require('node:assert/strict'),React=require('react');
const {component}=require('./quiz-component-test-loader.cjs');
const {fixture,rules,now}=require('./test-daily-jewellery-quiz.cjs');
const people=[...Array.from({length:5},(_,i)=>({id:'account'+i,name:'Account '+i,employeeCode:'A'+i,department:'ACCOUNTS',branch:'MT'})),...Array.from({length:8},(_,i)=>({id:'back'+i,name:'Back Office '+i,employeeCode:'B'+i,department:'BACK OFFICE',branch:'MT'}))];
let local=['',''],index=0,selected=[],changes=0;
const Picker=component('app/components/QuizAudiencePicker.tsx',{react:{...React,useState:initial=>{const at=index++;return[local[at]??initial,value=>{local[at]=value;}];}}}).default;
function nodes(n,out=[]){if(!n||typeof n!=='object')return out;if(Array.isArray(n)){n.forEach(x=>nodes(x,out));return out;}out.push(n);nodes(n.props?.children,out);return out;}
function render(disabled=false){index=0;return nodes(Picker({people,selected,disabled,onChange:ids=>{selected=Array.from(ids);changes++;}}));}
function department(name){const before=changes;render().find(n=>n.type==='select').props.onChange({target:{value:name}});assert.equal(changes,before,'filter changes must never write or clear the selected employee IDs');}
function checks(){return render().filter(n=>n.type==='input'&&n.props.type==='checkbox');}
function summary(){return render().find(n=>n.type==='summary').props.children.join('');}
(async()=>{
 department('ACCOUNTS');assert.equal(checks().length,6);for(let i=1;i<=4;i++)checks()[i].props.onChange({target:{checked:true}});
 assert.equal(selected.length,4);department('BACK OFFICE');assert.equal(checks().length,9);for(let i=1;i<=6;i++)checks()[i].props.onChange({target:{checked:true}});
 assert.equal(selected.length,10);assert(summary().includes('10 selected'));
 const chosen=[...selected];department('ACCOUNTS');assert.deepEqual(checks().slice(1).map(n=>n.props.checked),[true,true,true,true,false]);assert.deepEqual(selected,chosen);
 department('BACK OFFICE');checks()[0].props.onChange({target:{checked:true}});assert.equal(selected.length,12,'department Select All merges, preserving the four Accounts selections');
 checks()[0].props.onChange({target:{checked:false}});assert.deepEqual(selected,people.slice(0,4).map(p=>p.id),'department deselect-all removes only visible employees');
 department('ACCOUNTS');checks()[0].props.onChange({target:{checked:true}});assert.equal(selected.length,5);
 department('');assert.equal(checks().length,14);assert.equal(selected.length,5);
 render().find(n=>n.type==='input'&&n.props.type==='search').props.onChange({target:{value:'Back Office 2'}});assert.equal(checks().length,2);
 checks()[0].props.onChange({target:{checked:true}});assert.equal(selected.length,6);assert(selected.includes('back2'));
 checks()[0].props.onChange({target:{checked:false}});assert.equal(selected.length,5,'search-scoped deselection preserves hidden selections');
 render().find(n=>n.type==='input'&&n.props.type==='search').props.onChange({target:{value:''}});department('BACK OFFICE');
 for(let i=1;i<=6;i++)checks()[i].props.onChange({target:{checked:true}});department('ACCOUNTS');checks()[5].props.onChange({target:{checked:false}});
 assert.equal(selected.length,10);assert.equal(new Set(selected).size,10);
 assert(render(true).filter(n=>n.type==='input'||n.type==='select'||n.type==='button').every(n=>n.props.disabled),'busy controls remain disabled');
 // Persist the exact multi-department selection and use it through the real audience/push service.
 const f=fixture();f.employees.splice(0,f.employees.length,...people.map(p=>({...p,role:'EMPLOYEE',status:'ACTIVE',deletedAt:null,exitDate:null})));f.user({id:'admin',role:'ADMIN'});
 const settings={...rules.DEFAULT_QUIZ_SETTINGS,selectedEmployeeIds:[...selected],targetEmployeeId:selected[0]};
 assert.equal((await f.admin.POST(f.req({action:'settings',settings}))).status,200);
 let data=(await(await f.admin.GET()).json()).data;assert.deepEqual(data.settings.selectedEmployeeIds,selected);
 const response=await f.admin.POST(f.req({action:'question',question:{date:'2026-11-20',question:'Q?',options:['A','B','C'],correctIndex:0,explanation:'A',isPublished:true}}));assert.equal(response.status,200);const q=(await response.json()).data.question;assert.equal(q.audience.length,10);
 assert.equal((await f.service.runDailyQuizNotifications({now,manual:true,questionId:q.id})).sent,10);assert.deepEqual(new Set(f.pushes()[0].ids),new Set(selected));
 render().find(n=>n.type==='button').props.onClick();assert.equal(selected.length,0,'explicit Clear All still clears the full selection');
 console.log('PASS: actual dropdown and checkbox handlers; Accounts4 + Back Office6 =10; filters preserve all choices; scoped Select All/deselect/search; total count; disabled controls; global Clear All; real Admin save/reload/question audience and exact10-recipient push using mocked DB/transport.');
})().catch(e=>{console.error(e);process.exitCode=1;});
