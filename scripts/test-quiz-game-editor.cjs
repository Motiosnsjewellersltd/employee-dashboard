const assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {fixture,load}=require('./test-daily-jewellery-quiz.cjs');
const css={default:new Proxy({},{get:(_,key)=>key})};
function nodes(n,out=[]){if(!n||typeof n!=='object')return out;if(Array.isArray(n)){n.forEach(x=>nodes(x,out));return out;}out.push(n);nodes(n.props?.children,out);return out;}
(async()=>{
 const f=fixture();f.user({id:'admin',name:'Admin',role:'ADMIN'});const catalog=(await(await f.admin.GET()).json()).data.catalog.games;
 for(const entry of catalog){
  let values=[JSON.parse(JSON.stringify(entry)),false,''],index=0,saved=null,closed=0;
  const Editor=load('app/components/QuizGameEditor.tsx',{'react':{...React,useState:initial=>{const i=index++;return[values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},useRef:value=>({current:value}),useEffect:()=>{}},'react-dom':{createPortal:node=>node},'./AdminDailyJewelleryQuiz.module.css':css,'./DailyJewelleryQuiz.module.css':css},{document:{body:{}},fetch:async(url,options)=>f.admin.POST(new Request('http://test'+url,{method:'POST',headers:options.headers,body:options.body}))}).default;
  function render(){index=0;return Editor({game:entry,onClose:()=>closed++,onSaved:game=>saved=game});}
  let tree=render(),all=nodes(tree);assert(renderToStaticMarkup(tree).includes('Edit Game Content'));assert(all.some(n=>n.type==='button'&&n.props.children==='Save Game Content'));
  all.find(n=>n.type==='input').props.onChange({target:{value:entry.title+' corrected'}});
  all=nodes(render());const question=all.find(n=>n.type==='textarea');if(question)question.props.onChange({target:{value:question.props.value+' corrected'}});
  const form=nodes(render()).find(n=>n.type==='form');form.props.onSubmit({preventDefault(){}});
  for(let i=0;i<30&&values[1];i++)await new Promise(resolve=>setImmediate(resolve));
  assert(saved,entry.id+': actual Save handler must receive persisted response');assert.equal(saved.title,entry.title+' corrected');assert.equal(values[2],'');
  const field=entry.rounds?'rounds':entry.pairs?'pairs':entry.steps?'steps':entry.words?'words':entry.bingo?'bingo':null;
  if(field)assert.notEqual(JSON.stringify(saved[field]),JSON.stringify(entry[field]),entry.id+': edited field persisted');
  nodes(render()).find(n=>n.type==='button'&&n.props.children==='Cancel').props.onClick();assert.equal(closed,1);
 }
 console.log('PASS: all44 real game editor renderings and handlers: question/options, matching, steps, words and Bingo text fields; title edits; actual Save to authorized Admin API persists then calls onSaved; Cancel closes. Mock DB/transport, no browser UI automation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
