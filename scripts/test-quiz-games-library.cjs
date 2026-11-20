const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,load,now}=require('./test-daily-jewellery-quiz.cjs');
const {QUESTION_LIBRARY:questions,GAME_LIBRARY:games}=load('lib/quizActivityCatalog.ts');
const {publicGame,gradeGame,activityForSave}=load('lib/quizActivity.ts');
const root=path.resolve(__dirname,'..');
const admin={id:'admin',name:'Admin',role:'ADMIN'};
const allCorrect=(game,view)=>{
 if(game.kind==='pairs')return{choices:game.pairs.map(p=>view.meanings.indexOf(p.meaning))};
 if(game.kind==='memory'){const flips=[],used=new Set();view.cards.forEach((card,i)=>{if(used.has(i))return;const j=view.cards.findIndex((n,k)=>k!==i&&!used.has(k)&&n===card);assert(j>=0);used.add(i);used.add(j);flips.push(i,j);});return{flips};}
 return{choices:game.kind==='shape'?game.rounds.map(r=>r.correctIndex):game.questionIds.map(i=>questions[i].correctIndex)};
};
(async()=>{
 assert.equal(questions.length,100);assert.equal(new Set(questions.map(q=>q.question)).size,100);assert.equal(games.length,30);assert.equal(new Set(games.map(g=>g.id)).size,30);
 for(const kind of ['pairs','shape','rapid','customer','memory'])assert.equal(games.filter(g=>g.kind===kind).length,6);
 for(const q of questions){assert(q.options.length>=3);assert.equal(new Set(q.options).size,q.options.length);assert(q.options[q.correctIndex]);assert(q.explanation);}
 for(const game of games){
  const seed='test-seed',view=publicGame(game,seed);assert(!JSON.stringify(view).includes('correctIndex'));assert(!JSON.stringify(view).includes('questionIds'));assert(!JSON.stringify(view).includes('explanation'));
  const right=allCorrect(game,view);assert.equal(gradeGame(game,seed,right).isCorrect,true,game.id);assert.equal(gradeGame(game,seed,right,true).isCorrect,false,'server deadline overrides claimed perfection');
  assert.equal(gradeGame(game,seed,game.kind==='memory'?{flips:[]}:{choices:[]}).score,0);assert.throws(()=>gradeGame(game,seed,game.kind==='memory'?{flips:[-1,999]}:{choices:[999]}));
  // Run the actual Admin and Employee endpoints for EVERY saved game, not only pure graders.
  const f=fixture();f.user(admin);let res=await f.admin.POST(f.req({action:'question',question:{date:'2026-11-20',isPublished:true,activity:{type:'game',gameId:game.id},question:'client cannot supply answer key',options:[],correctIndex:999}}));assert.equal(res.status,200,game.id);const stored=(await res.json()).data.question;assert.equal(stored.activity.definition.id,game.id);assert.equal(stored.question,game.title);
  f.user({id:'g',name:'Ghanshyam Jangir',role:'EMPLOYEE'});
  let quiz=(await(await f.employee.GET(new Request('http://test/api/daily-quiz'))).json()).data.quiz;assert.equal(quiz.activity.type,'game');assert(!JSON.stringify(quiz).includes('definition'));assert(!JSON.stringify(quiz).includes('correctIndex'));
  assert.equal((await f.employee.POST(f.req({questionId:stored.id,gameSubmission:right}))).status,400,'cannot submit without a server start');
  const start=await f.employee.POST(f.req({questionId:stored.id,action:'start'}));assert.equal(start.status,200);const started=(await start.json()).data;assert.equal(Date.parse(started.deadline)-Date.parse(started.startedAt),60000);assert.equal(f.answers().length,0,'starting a game is not an answer');
  const resumed=(await(await f.employee.POST(f.req({questionId:stored.id,action:'start'}))).json()).data;assert.equal(resumed.startedAt,started.startedAt,'refresh cannot restart clock');assert.deepEqual(resumed.game,started.game);
  const submitted=await f.employee.POST(f.req({questionId:stored.id,gameSubmission:allCorrect(game,started.game),isCorrect:false,score:999}));assert.equal(submitted.status,200);quiz=(await submitted.json()).data.quiz;assert.equal(quiz.answer.isCorrect,true);assert.equal(quiz.gameResult.score,quiz.gameResult.total);assert.equal(f.answers().length,1);
  assert.equal((await f.employee.POST(f.req({questionId:stored.id,gameSubmission:right}))).status,409);
  f.user(admin);const edit=await f.admin.POST(f.req({action:'question',id:stored.id,question:{date:'2026-11-20',isPublished:true,activity:{type:'game',gameId:game.id}}}));assert.equal(edit.status,400,'first answer locks game edits');
  const report=(await(await f.admin.GET()).json()).data;assert.equal(report.questions[0].report.correct,1);assert.equal(report.questions[0].report.noResponse,0);assert.deepEqual(report.questions[0].report.names.correct,['Ghanshyam Jangir']);
  assert.equal((await f.admin.DELETE(f.req({id:stored.id}))).status,200);assert.equal(f.answers().length,0);assert.equal(await f.db.dailyQuizGameAttempt.findUnique({where:{questionId_employeeId:{questionId:stored.id,employeeId:'g'}}}),null,'question deletion cascades timer records');
 }
 assert.throws(()=>activityForSave({type:'game',gameId:'bogus'}));
 const f=fixture();f.user(admin);const management=(await(await f.admin.GET()).json()).data;assert.equal(management.catalog.games.length,30);assert.equal(management.catalog.questions.length,100);
 for(const role of ['HR','EMPLOYEE']){f.user({id:'other',role});assert.equal((await f.admin.GET()).status,403);assert.equal((await f.admin.POST(f.req({action:'question',question:{activity:{type:'game',gameId:'pair-1'}}}))).status,403);}
 // Validate all four illustrated question characters through normal answer flow.
 for(const visual of ['customer','man','child','cartoon']){const x=fixture();x.user(admin);const res=await x.admin.POST(x.req({action:'question',question:{date:'2026-11-20',question:'Customer?',options:['First','Second','Third'],correctIndex:1,explanation:'Second',isPublished:true,activity:{type:'question',visual}}}));assert.equal(res.status,200);const q=(await res.json()).data.question;x.user({id:'g',name:'Ghanshyam Jangir',role:'EMPLOYEE'});assert.equal((await x.employee.POST(x.req({questionId:q.id,selectedIndex:1}))).status,200);}
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{component}=require('./quiz-component-test-loader.cjs');
 const artwork=component('app/components/QuizArtwork.tsx');for(const character of ['lady','man','child','cartoon']){const html=renderToStaticMarkup(React.createElement(artwork.CustomerScene,{text:'Customer question',character}));assert(html.includes(character==='lady'?'Lady customer':`${character} illustration`));}
 const picker=component('app/components/QuizLibraryPicker.tsx');const catalogue=games.map(g=>({...g,preview:publicGame(g,'preview')}));const html=renderToStaticMarkup(React.createElement(picker.default,{type:'game',games:catalogue,questions,gameId:'customer-1',disabled:false,onGame:()=>{},onQuestion:()=>{}}));assert(html.includes('30 games'));assert(html.includes('Try Preview'));assert(html.includes('Lady customer'));assert(!html.includes('/api/'));
 const questionHtml=renderToStaticMarkup(React.createElement(picker.default,{type:'question',games:catalogue,questions,gameId:'pair-1',disabled:false,onGame:()=>{},onQuestion:()=>{}}));assert(questionHtml.includes('100 ready questions'));assert(questionHtml.includes('Q100'));
 for(const game of games){const screen=component('app/components/QuizGame.tsx');const rendered=renderToStaticMarkup(React.createElement(screen.default,{preview:publicGame(game,'preview')}));assert(rendered.includes('Try Preview'),game.id);}
 const sql=fs.readFileSync(path.join(root,'prisma/quiz-games-library.sql'),'utf8');assert(!/DROP TABLE|TRUNCATE|DELETE FROM/i.test(sql));assert(sql.includes('ON DELETE CASCADE'));assert(sql.includes('IF NOT EXISTS'));
 console.log('PASS: 100 unique questions, 30 curated playable games (6 per type), all answer keys/content valid; every game exercised through actual authorized Admin save/Employee start/resume/grade/duplicate/edit-lock/counts/delete routes; server-only grading, immutable timer and late grading; role guards; lady/man/child/cartoon illustrated question flow; actual picker/preview SSR; additive repeatable migration and deletion cascade.');
})().catch(e=>{console.error(e);process.exitCode=1;});
