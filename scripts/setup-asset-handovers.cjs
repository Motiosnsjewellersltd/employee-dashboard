// Creates only the additive Asset Handover tables using existing dashboard settings.
// Run with the project's environment: node --env-file=.env scripts/setup-asset-handovers.cjs
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const connection = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connection || !/^postgres(?:ql)?:\/\//i.test(connection)) {
  console.error('Dashboard PostgreSQL connection missing. Set DATABASE_URL / DIRECT_URL in your local project .env. Do not use the Realtime SQL Server login.');
  process.exitCode = 1;
} else {
  const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL || connection, DIRECT_URL: connection };
  const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'execute', '--file', path.join(root, 'prisma/asset-handovers.sql'), '--schema', path.join(root, 'prisma/schema.prisma')], { cwd: root, env, stdio: 'inherit' });
  if (result.error) { console.error('Could not start Prisma setup. Check that project dependencies are installed.'); process.exitCode = 1; }
  else process.exitCode = result.status === 0 ? 0 : 1;
}
