// Adds one quiz audience column and binds existing quiz notification metadata.
const {loadEnvConfig}=require('@next/env');
const {spawnSync}=require('node:child_process');
loadEnvConfig(process.cwd(),false,{info:()=>{},error:()=>{}});
const databaseUrl=process.env.DIRECT_URL||process.env.DATABASE_URL;
if(!databaseUrl){console.error('Run prisma/quiz-admin-reports.sql in the SAME Neon database used by Vercel, then run APPLY_QUIZ_ADMIN_MANAGEMENT.cmd --schema-applied. Do not share credentials.');process.exit(1);}
const result=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'db','execute','--file','prisma/quiz-admin-reports.sql','--schema','prisma/schema.prisma'],{stdio:'inherit',env:{...process.env,DATABASE_URL:databaseUrl,DIRECT_URL:databaseUrl}});
if(result.error){console.error('Could not start quiz report schema update.');process.exit(1);}
process.exit(result.status===0?0:1);
