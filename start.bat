@echo off
REM Start the Workspace Hub dev server
cd /d "%~dp0"
if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
)
echo Starting dev server on http://localhost:3000 ...
call npm run dev
pause
