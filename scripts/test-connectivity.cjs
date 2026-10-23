const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/connectivity.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:mod,exports:mod.exports});
class Target{constructor(){this.listeners=new Map();}addEventListener(k,f){if(!this.listeners.has(k))this.listeners.set(k,new Set());this.listeners.get(k).add(f);}removeEventListener(k,f){this.listeners.get(k)?.delete(f);}emit(k){for(const f of this.listeners.get(k)||[])f();}}
let now=0,next=0,timers=new Map(),states=[];
const win=new Target(),doc=new Target(),nav={onLine:true};doc.visibilityState='visible';
win.setTimeout=(fn,ms)=>{const id=++next;timers.set(id,{fn,due:now+ms});return id;};win.clearTimeout=id=>timers.delete(id);
function advance(ms){now+=ms;for(const[id,t]of [...timers])if(t.due<=now){timers.delete(id);t.fn();}}
const stop=mod.exports.watchOfflineStatus(x=>states.push(x),{window:win,document:doc,navigator:nav});
win.emit('motisons-network-unavailable');advance(5000);assert(!states.includes(true),'failed request while online must not open offline dialog');
for(let i=0;i<3;i++){doc.visibilityState='hidden';doc.emit('visibilitychange');nav.onLine=false;win.emit('offline');win.emit('motisons-network-unavailable');advance(5000);nav.onLine=true;doc.visibilityState='visible';doc.emit('visibilitychange');win.emit('focus');advance(2000);}assert(!states.includes(true),'lock/unlock cycles must not trigger offline dialog');
nav.onLine=false;win.emit('offline');advance(1000);nav.onLine=true;win.emit('online');advance(2000);assert(!states.includes(true),'transient disconnect must not flash');
nav.onLine=false;win.emit('offline');advance(1499);assert(!states.includes(true));advance(1);assert.equal(states.at(-1),true,'stable visible disconnect must show warning');
nav.onLine=true;win.emit('online');assert.equal(states.at(-1),false,'reconnect clears without reload/retry');
nav.onLine=false;win.emit('offline');stop();const count=states.length;advance(5000);win.emit('online');doc.emit('visibilitychange');assert.equal(states.length,count,'cleanup cancels timers and listeners');
console.log('PASS: online request failures, repeated hidden lock/unlock, transient disconnect, confirmed offline, auto-recovery and cleanup.');
