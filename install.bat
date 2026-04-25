@echo off
:: =============================================================================
:: OpenClaw Character Dashboard -- Installer (Windows CMD)
:: =============================================================================
setlocal EnableDelayedExpansion

set REQUIRED_NODE_MAJOR=22
set "PROJECT_DIR=%~dp0"
:: Remove trailing backslash
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

echo.
echo ============================================================
echo  OpenClaw Character Dashboard -- Installer (Windows)
echo ============================================================
echo.

:: ── Check Node.js ──────────────────────────────────────────────────────────
echo [check] Checking Node.js...

where node >nul 2>&1
if %errorlevel% neq 0 (
  echo [warn]  Node.js is not installed.
  call :ask_install_node
  if !ASK_RESULT! neq 0 (
    echo [error] Node.js installation skipped. Cannot continue.
    goto :fail
  )
  call :install_node
  goto :check_node_version
)

:check_node_version
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo [error] Node.js still not found after installation attempt.
  echo         Please install Node.js v%REQUIRED_NODE_MAJOR% manually:
  echo         https://nodejs.org/en/download
  goto :fail
)

for /f "tokens=1 delims=v." %%M in ('node --version 2^>nul') do set NODE_MAJOR_RAW=%%M
:: node --version gives "v22.x.x" -- strip the leading 'v'
for /f "tokens=*" %%V in ('node --version 2^>nul') do set NODE_VER=%%V
set NODE_VER_STRIP=%NODE_VER:v=%
for /f "tokens=1 delims=." %%M in ("%NODE_VER_STRIP%") do set NODE_MAJOR=%%M

if !NODE_MAJOR! LSS %REQUIRED_NODE_MAJOR% (
  echo [warn]  Node.js !NODE_VER! found but v%REQUIRED_NODE_MAJOR%+ is required.
  set /p UPGRADE_CHOICE="Upgrade Node.js? [Y/n]: "
  if /i "!UPGRADE_CHOICE!"=="" set UPGRADE_CHOICE=Y
  if /i "!UPGRADE_CHOICE!"=="Y" (
    call :install_node
    :: Re-check after upgrade
    for /f "tokens=*" %%V in ('node --version 2^>nul') do set NODE_VER=%%V
    set NODE_VER_STRIP=!NODE_VER:v=!
    for /f "tokens=1 delims=." %%M in ("!NODE_VER_STRIP!") do set NODE_MAJOR=%%M
    if !NODE_MAJOR! LSS %REQUIRED_NODE_MAJOR% (
      echo [error] Node.js upgrade did not produce v%REQUIRED_NODE_MAJOR%+.
      echo         Please restart this installer in a new terminal window.
      goto :fail
    )
  ) else (
    echo [error] Node.js upgrade skipped. Cannot continue.
    goto :fail
  )
)

echo [ok]    Node.js !NODE_VER! is ready.

:: ── Check npm ──────────────────────────────────────────────────────────────
echo.
echo [check] Checking npm...
where npm >nul 2>&1
if %errorlevel% neq 0 (
  echo [error] npm not found. Reinstall Node.js from https://nodejs.org
  goto :fail
)
for /f "tokens=*" %%V in ('npm --version 2^>nul') do set NPM_VER=%%V
echo [ok]    npm !NPM_VER! is ready.

:: ── .env setup ────────────────────────────────────────────────────────────
echo.
echo [info]  Setting up environment file...
if not exist "%PROJECT_DIR%\.env" if not exist "%PROJECT_DIR%\.env.local" (
  if exist "%PROJECT_DIR%\.env.example" (
    copy "%PROJECT_DIR%\.env.example" "%PROJECT_DIR%\.env.local" >nul
    echo [ok]    Created .env.local from .env.example
    echo         Edit it to customise your OpenClaw settings.
  )
) else (
  echo [info]  .env / .env.local already exists -- skipping.
)

:: ── npm install ────────────────────────────────────────────────────────────
echo.
echo [info]  Installing dependencies...
pushd "%PROJECT_DIR%"
call npm install
if %errorlevel% neq 0 (
  echo [error] npm install failed.
  popd
  goto :fail
)
popd
echo [ok]    Dependencies installed.

:: ── Create runner ──────────────────────────────────────────────────────────
echo.
echo [info]  Creating run.bat...
(
  echo @echo off
  echo :: OpenClaw Character Dashboard -- Runner
  echo setlocal
  echo set "PROJECT_DIR=%%~dp0"
  echo if "%%PROJECT_DIR:~-1%%"=="\" set "PROJECT_DIR=%%PROJECT_DIR:~0,-1%%"
  echo echo Starting OpenClaw Character Dashboard ^(frontend + API server^)...
  echo echo Frontend:  http://localhost:5173
  echo echo Press Ctrl+C to stop.
  echo pushd "%%PROJECT_DIR%%"
  echo call npm run dev:all
  echo popd
) > "%PROJECT_DIR%\run.bat"
echo [ok]    Created run.bat

:: ── Summary ────────────────────────────────────────────────────────────────
echo.
echo ============================================================
echo  OpenClaw Character Dashboard -- Ready to launch!
echo ============================================================
echo.
echo  To start the dashboard, run ONE of the following:
echo.
echo    run.bat              (double-click or run from CMD)
echo    npm run dev          (frontend only)
echo    npm run dev:all      (frontend + API server)
echo.
echo  Then open your browser at:  http://localhost:5173
echo.
echo  Optional: edit .env.local to point at your OpenClaw data.
echo.
goto :end

:: ── Helpers ────────────────────────────────────────────────────────────────
:ask_install_node
set ASK_RESULT=0
set /p INSTALL_CHOICE="Install Node.js v%REQUIRED_NODE_MAJOR%? [Y/n]: "
if /i "%INSTALL_CHOICE%"=="" set INSTALL_CHOICE=Y
if /i "%INSTALL_CHOICE%"=="n" set ASK_RESULT=1
if /i "%INSTALL_CHOICE%"=="N" set ASK_RESULT=1
goto :eof

:install_node
echo.
echo [info]  Attempting to install Node.js v%REQUIRED_NODE_MAJOR% via winget...
winget install OpenJS.NodeJS.LTS --version %REQUIRED_NODE_MAJOR% --accept-package-agreements --accept-source-agreements 2>nul
if %errorlevel% equ 0 (
  echo [ok]    Node.js installed via winget.
  echo [info]  Please close and reopen this terminal, then re-run install.bat
  echo         so the new PATH is picked up.
  pause
  exit /b 0
)
echo [warn]  winget not available or install failed.
echo.
echo [info]  Please install Node.js v%REQUIRED_NODE_MAJOR%+ manually:
echo         https://nodejs.org/en/download
echo.
echo         After installing, close this window, open a new Command Prompt,
echo         and run install.bat again.
pause
exit /b 1

:fail
echo.
echo Installation did not complete. See messages above.
pause
exit /b 1

:end
endlocal
pause
