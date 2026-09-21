@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.13 or newer, then run this file again.
  pause
  exit /b 1
)
if not exist .env.local (
  copy .env.example .env.local >nul
  echo Created .env.local. Open it in VS Code and add your Supabase and AI credentials.
  echo The interface can open before setup, but accounts and AI require valid credentials.
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 (
    echo Dependency installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)
echo Open http://localhost:3000 after the server says Ready.
call npm run dev:local
pause
