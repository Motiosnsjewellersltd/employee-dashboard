// Applies only the bundled additive SQL; never runs db push/reset/seed.
const {loadEnvConfig}=require('@next/env');
const {spawnSync}=require('node:child_process');
loadEnvConfig(process.cwd(),false,{info:()=>{},error:()=>{}});
const databaseUrl=process.env.DIRECT_URL||process.env.DATABASE_URL;
if(!databaseUrl){
 console.error('Database URL is not configured locally. Run prisma/leave-workflow-visibility.sql in the SAME Neon database used by Vercel, then run APPLY_LEAVE_WORKFLOW_VISIBILITY.cmd --schema-applied. Never paste credentials into chat.');
 process.exit(1);
}
const result=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'db','execute','--file','prisma/leave-workflow-visibility.sql','--schema','prisma/schema.prisma'],{stdio:'inherit',env:{...process.env,DATABASE_URL:databaseUrl,DIRECT_URL:databaseUrl}});
if(result.error){console.error('Unable to start schema update.');process.exit(1);}
process.exit(result.status===0?0:1);
