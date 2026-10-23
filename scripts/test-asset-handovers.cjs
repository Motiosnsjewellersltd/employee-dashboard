// Actual route/validation code with a transactional in-memory database double.
// Run: node scripts/test-asset-handovers.cjs. No live employee/database access.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, mocks) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: key => key in mocks ? mocks[key] : require(key), Buffer, Request, Response, FormData, URL, Date, Intl, Number, Object, console }, { filename: file });
  return module.exports;
}
function fixture() {
  let items = [], events = [], attachments = [], counter = 0, session = { id: 'admin-1', role: 'ADMIN', name: 'Test Admin' }, menuAllowed = true, manageAllowed = true;
  let forceConflict = false, failEvent = false, reads = 0;
  const employees = [
    { id: 'employee-a', name: 'Employee A', employeeCode: '7001', branch: 'MT', department: 'SALES', designation: 'Sales Executive', role: 'EMPLOYEE', deletedAt: null, status: 'ACTIVE' },
    { id: 'employee-b', name: 'Employee B', employeeCode: '7002', branch: 'JB', department: 'ACCOUNTS', designation: 'Accounts Executive', role: 'EMPLOYEE', deletedAt: null, status: 'ACTIVE' },
    { id: 'deleted', name: 'Deleted Employee', role: 'EMPLOYEE', deletedAt: new Date() },
    { id: 'admin-1', name: 'Test Admin', role: 'ADMIN', deletedAt: null }
  ];
  const copy = value => structuredClone(value);
  const permission = async (role, key) => { if (role === 'ADMIN') return; if (role !== 'HR' || key === 'hrMenuAssetHandover' && !menuAllowed || key === 'hrCanManageAssetHandover' && !manageAllowed) throw new Error('Access denied.'); };
  const helper = load('lib/assetHandover.ts', { '@/lib/auth': { requireSession: async () => { if (!session) throw new Error('Unauthorized'); return session; } }, '@/lib/permissions': { requireHrPermission: permission } });
  function matches(item, where) {
    return Object.entries(where).every(([key, value]) => key === 'OR' ? value.some(part => Object.entries(part).every(([field, condition]) => String(item[field] || '').toLowerCase().includes(condition.contains.toLowerCase()))) : item[key] === value);
  }
  function duplicate(data, except) { if (data.identifierKey && items.some(item => item.id !== except && item.identifierKey === data.identifierKey)) throw Object.assign(new Error('duplicate'), { code: 'P2002' }); }
  const db = {
    employee: { findFirst: async ({ where }) => { reads++; const e = employees.find(e => e.id === where.id && !e.deletedAt && e.role !== 'ADMIN'); if (!e) return null; const {id,name,employeeCode,branch,department,designation}=e;return {id,name,employeeCode,branch,department,designation}; } },
    assetHandover: {
      findUnique: async ({ where, include }) => { reads++; const item = items.find(item => item.id === where.id); if (!item) return null; return copy(include ? { ...item, events: events.filter(e => e.handoverId === item.id).reverse().map(e => ({ ...e, attachments: attachments.filter(f => f.eventId === e.id).map(({fileData,...meta})=>meta) })) } : item); },
      findUniqueOrThrow: async args => { const item=await db.assetHandover.findUnique(args);if(!item)throw Error('Missing');return item; },
      findMany: async ({ where, skip, take }) => { reads++; return copy(items.filter(item => matches(item, where)).sort((a,b)=>b.updatedAt-a.updatedAt).slice(skip, skip+take)); },
      count: async ({ where }) => { reads++; return items.filter(item => matches(item, where)).length; },
      create: async ({ data }) => { duplicate(data); if(items.some(i=>i.id===data.id))throw Object.assign(Error('duplicate'),{code:'P2002'});const item={accessories:'',remarks:'',holderCode:null,holderBranch:null,holderDepartment:null,holderDesignation:null,version:0,...copy(data),createdAt:new Date(),updatedAt:new Date()};items.push(item);return copy(item); },
      deleteMany: async ({where}) => { if(forceConflict){forceConflict=false;return {count:0};}const item=items.find(item=>item.id===where.id&&item.version===where.version);if(!item)return {count:0};const eventIds=events.filter(e=>e.handoverId===item.id).map(e=>e.id);attachments=attachments.filter(a=>!eventIds.includes(a.eventId));events=events.filter(e=>e.handoverId!==item.id);items=items.filter(i=>i.id!==item.id);return {count:1}; },
      updateMany: async ({ where, data }) => { if(forceConflict){forceConflict=false;return {count:0};}const item=items.find(item=>item.id===where.id&&item.version===where.version);if(!item)return {count:0};duplicate(data,item.id);Object.assign(item,copy(data),{version:item.version+1,updatedAt:new Date(Date.now()+ ++counter)});return {count:1}; }
    },
    assetHandoverEvent: { create: async ({ data }) => { if(failEvent){failEvent=false;throw Error('event failed');}const {attachments:upload,...rest}=data;const event={id:'event-'+ ++counter,...copy(rest),createdAt:new Date()};events.push(event);if(upload)attachments.push({id:'file-'+counter,eventId:event.id,...upload.create});return copy(event); } },
    assetHandoverAttachment: { findUnique: async ({ where }) => {reads++;return attachments.find(file=>file.id===where.id)||null;} },
    $transaction: async callback => { if(Array.isArray(callback))return Promise.all(callback);const before=copy({items,events,attachments});try{return await callback(db);}catch(e){items=before.items;events=before.events;attachments=before.attachments;throw e;} }
  };
  const mocks = { '@/lib/prisma': { prisma: db }, '@/lib/permissions': { requireHrPermission: permission }, '@/lib/assetHandover': helper };
  const route = load('app/api/asset-handovers/route.ts', mocks);
  const fileRoute = load('app/api/asset-handovers/attachments/[id]/route.ts', mocks);
  const post = async (values, attachment) => {
    const form = new FormData();Object.entries(values).forEach(([k,v])=>form.set(k,String(v)));
    if(attachment)form.set('attachment',new Blob([attachment.data],{type:attachment.type}),attachment.name);
    return route.POST(new Request('http://test/api/asset-handovers',{method:'POST',body:form}));
  };
  return { route, fileRoute, post, helper, employees, state:()=>copy({items,events,attachments}), setSession:s=>session=s, setPermissions:(menu,manage)=>{menuAllowed=menu;manageAllowed=manage;}, conflict:()=>forceConflict=true, failEvent:()=>failEvent=true, reads:()=>reads };
}
async function main() {
  const f=fixture(), today=f.helper.indiaDate();
  const create={action:'CREATE',requestId:randomUUID(),itemType:'MOBILE',itemName:'Samsung A15',identifier:'IMEI 123',employeeId:'employee-a',date:today,condition:'New',accessories:'Charger',remarks:'Initial handover'};
  f.setSession({id:'employee-a',name:'A',role:'EMPLOYEE'});
  assert.equal((await f.route.GET(new Request('http://test/api/asset-handovers'))).status,403);assert.equal((await f.post(create)).status,403);assert.equal((await f.fileRoute.GET(null,{params:Promise.resolve({id:'x'})})).status,403);assert.equal(f.reads(),0);
  f.setSession(null);assert.equal((await f.route.GET(new Request('http://test/api/asset-handovers'))).status,401);
  f.setSession({id:'hr-1',name:'HR',role:'HR'});f.setPermissions(false,false);assert.equal((await f.route.GET(new Request('http://test/api/asset-handovers'))).status,403);
  f.setPermissions(true,false);assert.equal((await f.post(create)).status,403);assert.equal((await (await f.route.GET(new Request('http://test/api/asset-handovers'))).json()).data.canManage,false);
  f.setSession({id:'admin-1',name:'Admin',role:'ADMIN'});
  const uploaded={data:Buffer.from('%PDF-1.4\nreceipt'),type:'application/pdf',name:'handover.pdf'};
  let response=await f.post(create,uploaded);assert.equal(response.status,200);let item=(await response.json()).data.handover;const id=item.id;
  assert.equal(f.state().events.length,1);assert.equal(f.state().attachments.length,1);assert.equal(item.employeeId,'employee-a');
  assert.equal((await f.post(create,uploaded)).status,200);assert.equal(f.state().items.length,1);assert.equal(f.state().events.length,1);
  assert.equal((await f.post({...create,requestId:randomUUID(),identifier:'imei123'})).status,409);
  assert.equal((await f.post({...create,requestId:randomUUID(),identifier:'other',employeeId:'deleted'})).status,400);
  assert.equal((await f.post({...create,requestId:randomUUID(),identifier:'other',date:'2099-01-01'})).status,400);
  assert.equal((await f.post({...create,requestId:randomUUID(),identifier:'other',date:'2026-02-30'})).status,400);
  assert.equal((await f.post({...create,requestId:randomUUID(),identifier:'other'}, {data:'<html>bad</html>',type:'image/png',name:'bad.png'})).status,400);
  const move={action:'TRANSFER',id,version:0,employeeId:'employee-b',date:today,condition:'Good',accessories:'Charger',remarks:'Transferred'};
  assert.equal((await f.post({...move,employeeId:'employee-a'})).status,400);
  f.conflict();assert.equal((await f.post(move)).status,409);assert.equal(f.state().events.length,1);
  f.failEvent();assert.equal((await f.post(move)).status,500);assert.equal(f.state().items[0].employeeId,'employee-a');assert.equal(f.state().events.length,1);
  response=await f.post(move);assert.equal(response.status,200);item=(await response.json()).data.handover;assert.equal(item.employeeId,'employee-b');assert.equal(item.version,1);
  const transfer=f.state().events[1];assert.equal(transfer.fromEmployee.name,'Employee A');assert.equal(transfer.toEmployee.name,'Employee B');
  assert.equal((await f.post(move)).status,409);
  const ret={action:'RETURN',id,version:1,date:today,condition:'Good',accessories:'Charger',remarks:'Collected'};
  response=await f.post(ret);assert.equal(response.status,200);assert.equal(f.state().items[0].employeeId,null);assert.equal(f.state().items[0].status,'RETURNED');
  assert.equal((await f.post({...ret,version:2})).status,409);
  assert.equal((await f.post({...move,action:'ASSIGN',version:2,employeeId:'employee-a'})).status,200);
  assert.equal((await f.post({...create,action:'EDIT',id,version:3,itemName:'Samsung A15 updated',remarks:'Edited'})).status,200);
  assert.equal(f.state().events.length,5);assert.equal(f.state().events[4].details.previous.itemName,'Samsung A15');assert.equal(f.state().items[0].employeeId,'employee-a');
  const detail=await (await f.route.GET(new Request('http://test/api/asset-handovers?id='+id))).json();assert.equal(detail.data.handover.events.length,5);assert(!JSON.stringify(detail).includes('fileData'));
  assert.equal((await (await f.route.GET(new Request('http://test/api/asset-handovers?employeeId=employee-b'))).json()).data.total,0);
  assert.equal((await (await f.route.GET(new Request('http://test/api/asset-handovers?q=samsung&branch=MT&status=ASSIGNED'))).json()).data.total,1);
  const fileId=f.state().attachments[0].id;response=await f.fileRoute.GET(null,{params:Promise.resolve({id:fileId})});assert.equal(response.status,200);assert(response.headers.get('content-disposition').startsWith('attachment;'));
  f.setSession({id:'employee-a',role:'EMPLOYEE'});assert.equal((await f.fileRoute.GET(null,{params:Promise.resolve({id:fileId})})).status,403);
  console.log('PASS: employee/anonymous/HR permissions; create retry; duplicate identifiers; date/file validation; transfers/returns/reassignment; immutable history; stale/racing edits; rollback; filtered lists; attachment authorization. Mock database, no live writes.');
}
module.exports={fixture};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
