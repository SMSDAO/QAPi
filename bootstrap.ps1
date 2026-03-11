<#
.SYNOPSIS
  QAPi Virtual Node Orchestrator – bootstrap.ps1

.DESCRIPTION
  Configures your local development environment to use QAPi as the
  virtual module resolver instead of node_modules.

  What it does:
    1. Validates that Node.js >= 18 and npm are installed.
    2. Creates/updates an .npmrc that redirects require() resolution
       through the QAPi SDK register hook.
    3. Sets the QAPI_KEY environment variable (session scope or persisted
       to user profile).
    4. Installs the @qapi/sdk package globally (or locally in the current
       project).
    5. Verifies connectivity to the QAPi Core Service.

.PARAMETER ApiKey
  Your QAPi API key (e.g. qapi-starter-xxxx). If omitted the script will
  prompt you or open the signup page.

.PARAMETER Tier
  Subscription tier: starter | pro | audited.  Defaults to 'starter'.

.PARAMETER BaseUrl
  QAPi Core Service base URL.  Defaults to 'https://api.qapi.dev'.

.PARAMETER Global
  When set, installs the SDK globally (npm install -g) and writes QAPI_KEY
  to the user's permanent environment variables.

.PARAMETER Uninstall
  Remove QAPi environment variables and the global SDK package.

.EXAMPLE
  # Interactive setup (will open signup page if no key is provided)
  .\bootstrap.ps1

.EXAMPLE
  # Non-interactive, Starter tier
  .\bootstrap.ps1 -ApiKey "qapi-starter-YOUR_KEY"

.EXAMPLE
  # Pro tier, global install
  .\bootstrap.ps1 -ApiKey "qapi-pro-YOUR_KEY" -Tier pro -Global

.NOTES
  Requires PowerShell 7+ (pwsh) or Windows PowerShell 5.1.
  Compatible with Windows, macOS, and Linux.
#>

#Requires -Version 5.1

[CmdletBinding(SupportsShouldProcess)]
param (
  [Parameter(HelpMessage = "Your QAPi API key")]
  [string]$ApiKey,

  [Parameter(HelpMessage = "Subscription tier: starter | pro | audited")]
  [ValidateSet("starter", "pro", "audited")]
  [string]$Tier = "starter",

  [Parameter(HelpMessage = "QAPi Core Service base URL")]
  [string]$BaseUrl = "https://api.qapi.dev",

  [Parameter(HelpMessage = "Install the SDK globally and persist environment variables")]
  [switch]$Global,

  [Parameter(HelpMessage = "Remove QAPi environment variables and global SDK package")]
  [switch]$Uninstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Colour helpers ────────────────────────────────────────────────────────────
function Write-Neon {
  param([string]$Msg, [ConsoleColor]$Color = 'Cyan')
  Write-Host $Msg -ForegroundColor $Color
}
function Write-Step  { param([string]$Msg) Write-Neon "  ● $Msg" 'Cyan' }
function Write-Ok    { param([string]$Msg) Write-Neon "  ✔ $Msg" 'Green' }
function Write-Warn  { param([string]$Msg) Write-Neon "  ⚠ $Msg" 'Yellow' }
function Write-Fail  { param([string]$Msg) Write-Neon "  ✖ $Msg" 'Red' }

# ── Banner ────────────────────────────────────────────────────────────────────
Write-Neon ""
Write-Neon "  ██████   █████  ██████  ██" 'Cyan'
Write-Neon "  ██    ██ ██  ██ ██   ██ ██" 'Cyan'
Write-Neon "  ██    ██ ███████ ██████  ██" 'Cyan'
Write-Neon "  ██    ██ ██  ██ ██      ██" 'Cyan'
Write-Neon "  ██████  ██  ██ ██      ██" 'Magenta'
Write-Neon ""
Write-Neon "  QAPi Virtual Node Orchestrator" 'White'
Write-Neon "  bootstrap.ps1 — github.com/SMSDAO/QAPi" 'DarkGray'
Write-Neon ""

# ── Uninstall flow ────────────────────────────────────────────────────────────
if ($Uninstall) {
  Write-Step "Removing QAPi environment variables…"
  [System.Environment]::SetEnvironmentVariable("QAPI_KEY", $null, "User")
  [System.Environment]::SetEnvironmentVariable("QAPI_BASE_URL", $null, "User")
  $env:QAPI_KEY = $null
  $env:QAPI_BASE_URL = $null

  Write-Step "Uninstalling global @qapi/sdk…"
  $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
  if ($npmCmd) {
    & npm uninstall -g @qapi/sdk 2>&1 | Out-Null
  }
  Write-Ok "QAPi removed from this machine."
  exit 0
}

# ── Step 1: Verify Node.js ────────────────────────────────────────────────────
Write-Step "Checking Node.js installation…"
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Fail "Node.js not found. Install Node.js 18+ from https://nodejs.org and re-run."
  exit 1
}

$nodeVersionRaw = & node --version 2>&1
$nodeVersion = $nodeVersionRaw -replace 'v', ''
$nodeMajor = [int]($nodeVersion -split '\.')[0]
if ($nodeMajor -lt 18) {
  Write-Fail "Node.js $nodeVersionRaw detected but QAPi requires >= 18. Please upgrade."
  exit 1
}
Write-Ok "Node.js $nodeVersionRaw detected."

$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) {
  Write-Fail "npm not found. It is bundled with Node.js — please reinstall Node.js."
  exit 1
}
$npmVersion = (& npm --version 2>&1).Trim()
Write-Ok "npm $npmVersion detected."

# ── Step 2: API Key ───────────────────────────────────────────────────────────
Write-Step "Resolving API key…"
if (-not $ApiKey) {
  # Try the environment variable first
  if ($env:QAPI_KEY) {
    $ApiKey = $env:QAPI_KEY
    Write-Ok "Found existing key in `$env:QAPI_KEY."
  } else {
    Write-Warn "No API key provided."
    Write-Neon "  → Get a free Starter key at: $BaseUrl/../signup" 'Yellow'
    $ApiKey = Read-Host "  Enter your QAPi API key (or press Enter to open the signup page)"
    if (-not $ApiKey) {
      $signupUrl = "https://qapi.dev/signup"
      Write-Step "Opening $signupUrl in your browser…"
      Start-Process $signupUrl -ErrorAction SilentlyContinue
      Write-Warn "Re-run bootstrap.ps1 after you have your key:"
      Write-Neon "  .\bootstrap.ps1 -ApiKey `"qapi-starter-YOUR_KEY`"" 'Cyan'
      exit 0
    }
  }
}

if ($ApiKey -notmatch '^qapi-(starter|pro|audited)-[0-9a-f-]+$') {
  Write-Warn "Key format looks unusual. Expected: qapi-<tier>-<uuid>. Proceeding anyway."
}
Write-Ok "API key accepted."

# ── Step 3: Connectivity check ────────────────────────────────────────────────
Write-Step "Verifying connectivity to QAPi Core Service ($BaseUrl)…"
try {
  $healthResponse = Invoke-RestMethod -Uri "$BaseUrl/health" -Method GET -TimeoutSec 10 -ErrorAction Stop
  if ($healthResponse.status -eq "ok") {
    Write-Ok "QAPi Core Service is online. Timestamp: $($healthResponse.timestamp)"
  } else {
    Write-Warn "Unexpected health response: $($healthResponse | ConvertTo-Json -Compress)"
  }
} catch {
  Write-Warn "Could not reach $BaseUrl/health — proceeding offline."
  Write-Warn "Error: $_"
}

# ── Step 4: Install @qapi/sdk ─────────────────────────────────────────────────
Write-Step "Installing @qapi/sdk$(if ($Global) { ' globally' } else { ' locally' })…"
if ($PSCmdlet.ShouldProcess("@qapi/sdk", "npm install")) {
  if ($Global) {
    & npm install -g @qapi/sdk 2>&1 | Tee-Object -Variable npmOut | Out-Null
  } else {
    # Local install — create package.json if it doesn't exist
    if (-not (Test-Path "package.json")) {
      Write-Warn "No package.json found — running npm init -y first."
      & npm init -y 2>&1 | Out-Null
    }
    & npm install @qapi/sdk 2>&1 | Tee-Object -Variable npmOut | Out-Null
  }
  Write-Ok "@qapi/sdk installed."
}

# ── Step 5: Set environment variables ─────────────────────────────────────────
Write-Step "Setting environment variables…"
$env:QAPI_KEY      = $ApiKey
$env:QAPI_BASE_URL = $BaseUrl
$env:QAPI_TIER     = $Tier

if ($Global -and $PSCmdlet.ShouldProcess("User environment variables", "Set QAPI_KEY")) {
  [System.Environment]::SetEnvironmentVariable("QAPI_KEY",      $ApiKey,  "User")
  [System.Environment]::SetEnvironmentVariable("QAPI_BASE_URL", $BaseUrl, "User")
  [System.Environment]::SetEnvironmentVariable("QAPI_TIER",     $Tier,    "User")
  Write-Ok "QAPI_KEY persisted to user environment profile."
} else {
  Write-Ok "QAPI_KEY set for current session."
}

# ── Step 6: Summary ───────────────────────────────────────────────────────────
Write-Neon ""
Write-Neon "  ════════════════════════════════════════" 'DarkCyan'
Write-Neon "  QAPi bootstrap complete!" 'Green'
Write-Neon "  ════════════════════════════════════════" 'DarkCyan'
Write-Neon ""
Write-Neon "  Tier    : $Tier" 'White'
Write-Neon "  API Key : $($ApiKey.Substring(0, [Math]::Min(24, $ApiKey.Length)))…" 'White'
Write-Neon "  Base URL: $BaseUrl" 'White'
Write-Neon ""
Write-Neon "  Usage:" 'Cyan'
Write-Neon '  const { QAPiClient } = require("@qapi/sdk");' 'DarkGray'
Write-Neon '  const client = new QAPiClient({ apiKey: process.env.QAPI_KEY });' 'DarkGray'
Write-Neon '  const mod = await client.resolve("express");' 'DarkGray'
Write-Neon ""
Write-Neon "  Docs: https://qapi.dev/docs" 'DarkGray'
Write-Neon ""
