// Applies only the two additive quiz tables; never runs reset/seed/db push.
const {loadEnvConfig}=require('@next/env');
const {spawnSync}=require('node:child_process');
loadEnvConfig(process.cwd(),false,{info:()=>{},error:()=>{}});
const databaseUrl=process.env.DIRECT_URL||process.env.DATABASE_URL;
if(!databaseUrl){
 console.error('Local database URL is not configured. Run prisma/daily-jewellery-quiz.sql in the SAME Neon database used by Vercel, then run APPLY_DAILY_JEWELLERY_QUIZ.cmd --schema-applied. Do not paste credentials into chat.');
 process.exit(1);
}
const result=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'db','execute','--file','prisma/daily-jewellery-quiz.sql','--schema','prisma/schema.prisma'],{stdio:'inherit',env:{...process.env,DATABASE_URL:databaseUrl,DIRECT_URL:databaseUrl}});
if(result.error){console.error('Could not start quiz schema setup.');process.exit(1);}
process.exit(result.status===0?0:1);
