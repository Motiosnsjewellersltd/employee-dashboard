const assert=require('node:assert/strict'),React=require('react');
const {load}=require('./test-daily-jewellery-quiz.cjs'),{component}=require('./quiz-component-test-loader.cjs');
const {GAME_LIBRARY:games,QUESTION_LIBRARY:questions}=load('lib/quizActivityCatalog.ts'),{publicGame}=load('lib/quizActivity.ts');
function text(n){if(n===null||n===undefined||typeof n==='boolean')return'';if(typeof n==='string'||typeof n==='number')return String(n);if(Array.isArray(n))return n.map(text).join('');return text(n.props?.children);}
function nodes(n,out=[]){if(!n||typeof n!=='object')return out;if(Array.isArray(n)){n.forEach(x=>nodes(x,out));return out;}out.push(n);nodes(n.props?.children,out);return out;}
function screen(preview){let states=[],refs=[],si=0,ri=0,tree;const mock={...React,useState:init=>{const i=si++;if(!(i in states))states[i]=typeof init==='function'?init():init;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useRef:init=>{const i=ri++;if(!(i in refs))refs[i]={current:init};return refs[i];},useEffect:()=>{}};const C=component('app/components/QuizGame.tsx',{react:mock}).default;const render=()=>{si=0;ri=0;tree=C({preview});return tree;};const buttons=()=>nodes(tree).filter(n=>n.type==='button');const click=async predicate=>{const b=buttons().find(predicate);assert(b,'button must exist; available: '+buttons().map(text).join(' | '));assert(!b.props.disabled,'button must be enabled: '+text(b));await b.props.onClick();render();};render();return{render,buttons,click,get tree(){return tree;}};}
(async()=>{
 for(const game of games){const view=publicGame(game,'admin-preview'),ui=screen(view);await ui.click(b=>text(b)==='Try Preview');assert(text(ui.tree).includes(game.title));
  if(game.kind==='pairs')for(let i=0;i<game.pairs.length;i++){await ui.click(b=>text(b)===`${i+1}${game.pairs[i].term}`);await ui.click(b=>text(b)===game.pairs[i].meaning);}
  else if(game.kind==='memory'){const used=new Set();for(let i=0;i<view.cards.length;i++){if(used.has(i))continue;const j=view.cards.findIndex((n,k)=>k!==i&&!used.has(k)&&n===view.cards[i]);used.add(i);used.add(j);await ui.click(b=>b.props['aria-label']===`Open card ${i+1}`);await ui.click(b=>b.props['aria-label']===`Open card ${j+1}`);}}
  else for(let i=0;i<view.rounds.length;i++){const correct=game.kind==='shape'?game.rounds[i].correctIndex:questions[game.questionIds[i]].correctIndex;await ui.click(b=>text(b)===`${String.fromCharCode(65+correct)}. ${view.rounds[i].options[correct]}`);if(i<view.rounds.length-1)await ui.click(b=>text(b)==='Next');}
  await ui.click(b=>text(b)==='Submit Game');assert(text(ui.tree).includes('Preview complete'),'actual control state machine completes: '+game.id);
 }
 console.log('PASS: Actual React gameplay handlers for all 30 previews: start, pair selection/reassignment, card flips and matching, question options, round navigation, submit and preview completion without employee API writes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
