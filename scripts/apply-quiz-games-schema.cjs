// Add quiz/game metadata and durable game timer; no sends/deletes/resets.
const {loadEnvConfig}=require('@next/env');
const {spawnSync}=require('node:child_process');
loadEnvConfig(process.cwd(),false,{info:()=>{},error:()=>{}});
const databaseUrl=process.env.DIRECT_URL||process.env.DATABASE_URL;
if(!databaseUrl){console.error('Run prisma/quiz-games-library.sql in the SAME Neon database used by Vercel, then run APPLY_QUIZ_GAMES_LIBRARY.cmd --schema-applied. Do not share credentials.');process.exit(1);}
const result=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'db','execute','--file','prisma/quiz-games-library.sql','--schema','prisma/schema.prisma'],{stdio:'inherit',env:{...process.env,DATABASE_URL:databaseUrl,DIRECT_URL:databaseUrl}});
if(result.error){console.error('Could not start quiz notification setup.');process.exit(1);}
process.exit(result.status===0?0:1);
