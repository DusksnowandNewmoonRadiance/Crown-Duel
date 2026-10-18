@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

if not defined PORT set "PORT=3000"
if not "%~1"=="" set "PORT=%~1"

if not exist "server\index.js" (
  echo Cannot find server\index.js. Put this script in the Duel project root.
  pause
  exit /b 1
)

set "NODE_EXE="
for /f "delims=" %%I in ('where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%I"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined NODE_EXE (
  echo Node.js 18 or newer is required. Install Node.js and try again.
  pause
  exit /b 1
)
"%NODE_EXE%" -e "process.exit(Number(process.versions.node.split('.')[0])>=18?0:1)"
if errorlevel 1 (
  echo Node.js 18 or newer is required.
  pause
  exit /b 1
)

"%NODE_EXE%" -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz',{signal:AbortSignal.timeout(1500)}).then(r=>r.json()).then(x=>process.exit(x.ok?0:1)).catch(()=>process.exit(1))" >nul 2>nul
if not errorlevel 1 (
  echo A Duel server is already running at http://127.0.0.1:%PORT%/
  echo To use this folder, stop the other server window first, then run this script again.
  pause
  exit /b 0
)

if not exist "node_modules\express\package.json" (
  set "NPM_CMD="
  for /f "delims=" %%I in ('where npm.cmd 2^>nul') do if not defined NPM_CMD set "NPM_CMD=%%I"
  if not defined NPM_CMD if exist "%ProgramFiles%\nodejs\npm.cmd" set "NPM_CMD=%ProgramFiles%\nodejs\npm.cmd"
  if not defined NPM_CMD (
    echo Dependencies are missing. Install npm, then run npm install in this folder.
    pause
    exit /b 1
  )
  call "!NPM_CMD!" install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

if not defined ADMIN_TOKEN (
  if not exist "data" mkdir "data"
  if not exist "data\admin-token.txt" "%NODE_EXE%" -e "require('fs').writeFileSync('data/admin-token.txt',require('crypto').randomBytes(24).toString('hex'))"
  set /p "ADMIN_TOKEN="<"data\admin-token.txt"
)
if not defined ADMIN_TOKEN (
  echo Cannot load the admin token.
  pause
  exit /b 1
)

echo Starting Duel at http://127.0.0.1:%PORT%/
echo Admin page: http://127.0.0.1:%PORT%/admin
echo Admin token: !ADMIN_TOKEN!
echo Keep this window open. Press Ctrl+C to stop the server.
"%NODE_EXE%" "server\index.js"
set "EXIT_CODE=%ERRORLEVEL%"
echo Server stopped with exit code %EXIT_CODE%.
pause
exit /b %EXIT_CODE%
