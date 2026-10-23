@echo off
setlocal
cd /d "%~dp0"
if not exist "package.json" (
  echo Open this update inside the existing Employee Dashboard project folder.
  exit /b 1
)
echo Generate Prisma client...
call npx prisma generate
if errorlevel 1 exit /b 1
echo TypeScript check...
call npx tsc --noEmit
if errorlevel 1 exit /b 1
echo Production build...
call npm run build
if errorlevel 1 exit /b 1
echo Handover route and permission checks...
node scripts\test-asset-handovers.cjs
if errorlevel 1 exit /b 1
echo Create Asset Handover tables on the dashboard PostgreSQL database...
if exist ".env" (
  node --env-file=.env scripts\setup-asset-handovers.cjs
) else (
  node scripts\setup-asset-handovers.cjs
)
if errorlevel 1 exit /b 1
git add -- "app/components/DashboardApp.tsx" "app/components/AssetHandover.tsx" "app/components/AssetHandover.module.css" "app/api/asset-handovers/route.ts" "app/api/asset-handovers/attachments/[id]/route.ts" "lib/assetHandover.ts" "lib/permissions.ts" "prisma/schema.prisma" "prisma/asset-handovers.sql" "scripts/test-asset-handovers.cjs" "scripts/setup-asset-handovers.cjs" "docs/ASSET_HANDOVER_SETUP.txt" "APPLY_ASSET_HANDOVER_UPDATE.cmd"
if errorlevel 1 exit /b 1
git diff --cached --quiet -- "app/components/DashboardApp.tsx" "app/components/AssetHandover.tsx" "app/components/AssetHandover.module.css" "app/api/asset-handovers/route.ts" "app/api/asset-handovers/attachments/[id]/route.ts" "lib/assetHandover.ts" "lib/permissions.ts" "prisma/schema.prisma" "prisma/asset-handovers.sql" "scripts/test-asset-handovers.cjs" "scripts/setup-asset-handovers.cjs" "docs/ASSET_HANDOVER_SETUP.txt" "APPLY_ASSET_HANDOVER_UPDATE.cmd"
if errorlevel 2 exit /b 1
if errorlevel 1 (
  git commit --only -m "Add Admin HR Asset Handover records and transfer history" -- "app/components/DashboardApp.tsx" "app/components/AssetHandover.tsx" "app/components/AssetHandover.module.css" "app/api/asset-handovers/route.ts" "app/api/asset-handovers/attachments/[id]/route.ts" "lib/assetHandover.ts" "lib/permissions.ts" "prisma/schema.prisma" "prisma/asset-handovers.sql" "scripts/test-asset-handovers.cjs" "scripts/setup-asset-handovers.cjs" "docs/ASSET_HANDOVER_SETUP.txt" "APPLY_ASSET_HANDOVER_UPDATE.cmd"
  if errorlevel 1 exit /b 1
)
git push origin HEAD
if errorlevel 1 exit /b 1
echo Asset Handover update pushed. Wait for the Vercel deployment, then refresh the app.
endlocal
