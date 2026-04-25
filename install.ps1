#Requires -Version 5.1
# =============================================================================
# OpenClaw Character Dashboard — Installer (Windows PowerShell)
# =============================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$REQUIRED_NODE_MAJOR = 22
$PROJECT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

# ── Helpers ───────────────────────────────────────────────────────────────────
function Write-Info    { param($Msg) Write-Host "[info]  $Msg" -ForegroundColor Cyan }
function Write-Ok      { param($Msg) Write-Host "[ok]    $Msg" -ForegroundColor Green }
function Write-Warn    { param($Msg) Write-Host "[warn]  $Msg" -ForegroundColor Yellow }
function Write-Err     { param($Msg) Write-Host "[error] $Msg" -ForegroundColor Red }
function Write-Header  { param($Msg) Write-Host "`n$Msg" -ForegroundColor White }

function Ask-YesNo {
  param([string]$Prompt)
  while ($true) {
    $answer = Read-Host "$Prompt [Y/n]"
    if ($answer -eq '' -or $answer -imatch '^y') { return $true }
    if ($answer -imatch '^n') { return $false }
    Write-Warn "Please answer Y or n."
  }
}

function Get-NodeMajor {
  try {
    $ver = & node --version 2>$null   # e.g. "v22.4.0"
    if ($ver -match '^v(\d+)') { return [int]$Matches[1] }
  } catch {}
  return $null
}

# ── Node.js install via winget ────────────────────────────────────────────────
function Install-NodeWinget {
  Write-Info "Attempting to install Node.js v$REQUIRED_NODE_MAJOR via winget..."
  try {
    winget install OpenJS.NodeJS.LTS `
      --accept-package-agreements --accept-source-agreements `
      --silent 2>$null
    Write-Ok "Node.js installed via winget."
    Write-Warn "PATH was updated. Please close this window, open a new PowerShell session, and re-run install.ps1."
    Write-Host "Press any key to exit..." -NoNewline
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    exit 0
  } catch {
    Write-Warn "winget install failed: $_"
  }
}

function Install-NodeFallback {
  # Try Chocolatey
  if (Get-Command choco -ErrorAction SilentlyContinue) {
    Write-Info "Installing Node.js via Chocolatey..."
    choco install nodejs-lts --version "$REQUIRED_NODE_MAJOR" -y
    return
  }
  # Try Scoop
  if (Get-Command scoop -ErrorAction SilentlyContinue) {
    Write-Info "Installing Node.js via Scoop..."
    scoop install nodejs-lts
    return
  }
  Write-Warn "winget, Chocolatey, and Scoop are all unavailable."
  Write-Host ""
  Write-Host "  Please install Node.js v$REQUIRED_NODE_MAJOR+ manually:" -ForegroundColor Yellow
  Write-Host "  https://nodejs.org/en/download" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "  After installing, open a new PowerShell window and re-run install.ps1."
  throw "Node.js could not be installed automatically."
}

# ── Ensure Node.js ────────────────────────────────────────────────────────────
function Ensure-Node {
  Write-Header "Checking Node.js..."

  $nodeMajor = Get-NodeMajor
  if ($null -ne $nodeMajor -and $nodeMajor -ge $REQUIRED_NODE_MAJOR) {
    Write-Ok "Node.js $(& node --version) found — meets requirement (>= v$REQUIRED_NODE_MAJOR)."
    return
  }

  if ($null -ne $nodeMajor) {
    Write-Warn "Node.js v$nodeMajor is installed but v$REQUIRED_NODE_MAJOR+ is required."
    $upgrade = Ask-YesNo "Upgrade Node.js to v${REQUIRED_NODE_MAJOR}?"
    if (-not $upgrade) { throw "Node.js upgrade skipped. Cannot continue." }
  } else {
    Write-Warn "Node.js is not installed."
    $install = Ask-YesNo "Install Node.js v${REQUIRED_NODE_MAJOR}?"
    if (-not $install) { throw "Node.js installation skipped. Cannot continue." }
  }

  Install-NodeWinget   # exits process if successful (PATH refresh needed)
  Install-NodeFallback # only reached if winget failed

  # Re-check
  $nodeMajor = Get-NodeMajor
  if ($null -eq $nodeMajor -or $nodeMajor -lt $REQUIRED_NODE_MAJOR) {
    throw "Node.js v$REQUIRED_NODE_MAJOR+ still not detected. Please reopen PowerShell and retry."
  }
  Write-Ok "Node.js $(& node --version) ready."
}

# ── Ensure npm ────────────────────────────────────────────────────────────────
function Ensure-Npm {
  Write-Header "Checking npm..."
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm not found. Reinstall Node.js from https://nodejs.org"
  }
  Write-Ok "npm $(& npm --version) found."
}

# ── .env setup ────────────────────────────────────────────────────────────────
function Setup-Env {
  Write-Header "Setting up environment file..."
  $env1 = Join-Path $PROJECT_DIR '.env'
  $env2 = Join-Path $PROJECT_DIR '.env.local'
  $example = Join-Path $PROJECT_DIR '.env.example'

  if (-not (Test-Path $env1) -and -not (Test-Path $env2)) {
    if (Test-Path $example) {
      Copy-Item $example $env2
      Write-Ok "Created .env.local from .env.example — edit it to customise settings."
    }
  } else {
    Write-Info ".env / .env.local already exists — skipping."
  }
}

# ── npm install ───────────────────────────────────────────────────────────────
function Run-NpmInstall {
  Write-Header "Installing dependencies..."
  Push-Location $PROJECT_DIR
  try {
    & npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install exited with code $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
  Write-Ok "Dependencies installed."
}

# ── Create runner ─────────────────────────────────────────────────────────────
function Create-Runners {
  Write-Header "Creating runner scripts..."

  # run.ps1
  $runPs1 = Join-Path $PROJECT_DIR 'run.ps1'
  @'
#Requires -Version 5.1
$PROJECT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "Starting OpenClaw Character Dashboard (frontend + API server)..."
Write-Host "Frontend:  http://localhost:5173"
Write-Host "Press Ctrl+C to stop."
Set-Location $PROJECT_DIR
npm run dev:all
'@ | Set-Content -Encoding UTF8 $runPs1
  Write-Ok "Created run.ps1"

  # run.bat (convenience double-click shortcut)
  $runBat = Join-Path $PROJECT_DIR 'run.bat'
  if (-not (Test-Path $runBat)) {
    @'
@echo off
setlocal
set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
echo Starting OpenClaw Character Dashboard (frontend + API server)...
echo Frontend:  http://localhost:5173
echo Press Ctrl+C to stop.
pushd "%PROJECT_DIR%"
call npm run dev:all
popd
'@ | Set-Content -Encoding ASCII $runBat
    Write-Ok "Created run.bat (double-click shortcut)"
  }
}

# ── Summary ───────────────────────────────────────────────────────────────────
function Print-Summary {
  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Green
  Write-Host "  OpenClaw Character Dashboard — Ready to launch!" -ForegroundColor Green
  Write-Host "============================================================" -ForegroundColor Green
  Write-Host ""
  Write-Host "  To start the dashboard, run ONE of the following:" -ForegroundColor White
  Write-Host ""
  Write-Host "    .\run.ps1          " -ForegroundColor Cyan -NoNewline
  Write-Host "(PowerShell — recommended)"
  Write-Host "    .\run.bat          " -ForegroundColor Cyan -NoNewline
  Write-Host "(CMD / double-click)"
  Write-Host "    npm run dev        " -ForegroundColor Cyan -NoNewline
  Write-Host "(frontend only)"
  Write-Host "    npm run dev:all    " -ForegroundColor Cyan -NoNewline
  Write-Host "(frontend + API server)"
  Write-Host ""
  Write-Host "  Then open your browser at: " -NoNewline
  Write-Host "http://localhost:5173" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "  Optional: edit .env.local to point at your OpenClaw data."
  Write-Host ""
}

# ── Execution policy note ─────────────────────────────────────────────────────
function Check-ExecutionPolicy {
  $policy = Get-ExecutionPolicy -Scope CurrentUser
  if ($policy -eq 'Restricted' -or $policy -eq 'AllSigned') {
    Write-Warn "PowerShell execution policy is '$policy'."
    $fix = Ask-YesNo "Set execution policy to RemoteSigned for the current user?"
    if ($fix) {
      Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
      Write-Ok "Execution policy set to RemoteSigned."
    } else {
      Write-Warn "Execution policy not changed. You may need to run scripts manually."
    }
  }
}

# ── Main ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "OpenClaw Character Dashboard — Installer (PowerShell)" -ForegroundColor White
Write-Host "Platform: Windows" -ForegroundColor Gray
Write-Host ""

try {
  Check-ExecutionPolicy
  Ensure-Node
  Ensure-Npm
  Setup-Env
  Run-NpmInstall
  Create-Runners
  Print-Summary
} catch {
  Write-Err "$_"
  Write-Host ""
  Write-Host "Installation did not complete. See messages above." -ForegroundColor Red
  Write-Host "Press any key to exit..." -NoNewline
  $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
  exit 1
}

Write-Host "Press any key to exit..." -NoNewline
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
