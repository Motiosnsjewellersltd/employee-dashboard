@echo off
setlocal EnableExtensions
chcp 65001 >nul
color 0A
title Motisons Employee Dashboard Launcher - FINAL

set "PROJECT_DIR=%~dp0"
set "PORT=5020"
set "URL=http://172.150.1.251:5020/login"

cls
echo ========================================================
echo      Motisons Employee Dashboard Launcher - FINAL
echo ========================================================
echo Project folder: %PROJECT_DIR%
echo.

if not exist "%PROJECT_DIR%package.json" (
  echo ERROR: package.json nahi mila.
  echo Is BAT file ko Employee Dashboard ke main folder me rakho.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js install nahi hai ya PATH me nahi hai.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm PATH me nahi mila.
  pause
  exit /b 1
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do set "PORT_PID=%%P"
if defined PORT_PID (
  echo Port %PORT% already running hai. Browser open ho raha hai...
  start "" "%URL%"
  exit /b 0
)

if not exist "%PROJECT_DIR%node_modules" (
  echo node_modules nahi mila. npm install chal raha hai...
  pushd "%PROJECT_DIR%"
  call npm install
  if errorlevel 1 (
    popd
    echo ERROR: npm install fail hua.
    pause
    exit /b 1
  )
  popd
)

if not exist "%PROJECT_DIR%.next" (
  echo Production build nahi mila. npm run build chal raha hai...
  pushd "%PROJECT_DIR%"
  call npm run build
  if errorlevel 1 (
    popd
    echo ERROR: npm run build fail hua.
    pause
    exit /b 1
  )
  popd
)

where pm2 >nul 2>&1
if errorlevel 1 (
  echo PM2 nahi mila. Direct detached mode me dashboard start ho raha hai...
  start "Employee Dashboard Server" /min cmd.exe /d /s /c "cd /d ""%PROJECT_DIR%"" && npm run start -- -p %PORT%"
) else (
  echo Purana employee-dashboard PM2 process remove ho raha hai...
  call pm2 delete employee-dashboard >nul 2>&1
  echo Employee Dashboard PM2 se cmd.exe ke through start ho raha hai...
  call pm2 start "%ComSpec%" --name employee-dashboard --interpreter none --cwd "%PROJECT_DIR%" -- /d /s /c "npm run start -- -p %PORT%"
  if errorlevel 1 (
    echo PM2 start fail hua. Direct detached fallback start ho raha hai...
    start "Employee Dashboard Server" /min cmd.exe /d /s /c "cd /d ""%PROJECT_DIR%"" && npm run start -- -p %PORT%"
  ) else (
    call pm2 save >nul 2>&1
  )
)

echo.
echo Port %PORT% ready hone ka wait...
for /L %%S in (1,1,90) do (
  powershell -NoProfile -Command "try { $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',%PORT%); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 goto READY
  timeout /t 1 /nobreak >nul
)

echo.
echo ERROR: 90 seconds me port %PORT% ready nahi hua.
echo.
echo Ye command run karke error dekho:
echo cd /d "%PROJECT_DIR%"
echo npm run start -- -p %PORT%
echo.
if exist "%USERPROFILE%\.pm2\logs\employee-dashboard-error.log" (
  echo PM2 error log:
  powershell -NoProfile -Command "Get-Content '%USERPROFILE%\.pm2\logs\employee-dashboard-error.log' -Tail 30"
)
pause
exit /b 1

:READY
echo SUCCESS: Dashboard port %PORT% par ready hai.
echo Opening: %URL%
start "" "%URL%"
timeout /t 3 /nobreak >nul
exit /b 0
