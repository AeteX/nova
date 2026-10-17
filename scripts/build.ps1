#!/usr/bin/env pwsh
#Requires -Version 5.1
<#
.SYNOPSIS
    Builds Nova in release mode and reports output locations.

.DESCRIPTION
    Runs the full Tauri production pipeline: type-checks the frontend,
    bundles it with Vite, compiles the Rust backend in release mode, and
    produces platform installers.

    The script pauses before exiting so you can read the log. Pass
    -NoPause to skip this, or run under CI (detected automatically) and
    the pause is skipped too.

.PARAMETER Clean
    Remove previous build artifacts (frontend dist and Rust target) first.

.PARAMETER FrontendOnly
    Only build the frontend. Skips the Tauri bundle step entirely.

.PARAMETER SkipInstall
    Skip the automatic `npm install` step. Use this in CI where deps
    are already cached.

.PARAMETER NoBundle
    Build the raw executable without producing installers.

.PARAMETER NoPause
    Skip the final "Press Enter to exit" prompt. Useful for CI.

.EXAMPLE
    .\scripts\build.ps1
    Standard release build. Pauses at the end.

.EXAMPLE
    .\scripts\build.ps1 -Clean
    Wipe caches, then build from scratch.

.EXAMPLE
    .\scripts\build.ps1 -NoPause
    Build without the exit pause (for automation).
#>

[CmdletBinding()]
param(
    [switch]$Clean,
    [switch]$FrontendOnly,
    [switch]$SkipInstall,
    [switch]$NoBundle,
    [switch]$NoPause
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# ── Colours ───────────────────────────────────────────────────────────
function Write-Step    { param([string]$m) Write-Host "> " -ForegroundColor Cyan   -NoNewline; Write-Host $m -ForegroundColor White }
function Write-Ok      { param([string]$m) Write-Host "[OK] "  -ForegroundColor Green  -NoNewline; Write-Host $m -ForegroundColor Gray }
function Write-Fail    { param([string]$m) Write-Host "[!!] "  -ForegroundColor Red    -NoNewline; Write-Host $m -ForegroundColor Red }
function Write-Warn    { param([string]$m) Write-Host "[!] "   -ForegroundColor Yellow -NoNewline; Write-Host $m -ForegroundColor Yellow }
function Write-Info    { param([string]$m) Write-Host "     $m" -ForegroundColor DarkGray }
function Write-Section { param([string]$m) Write-Host ""; Write-Host "  $m" -ForegroundColor Cyan -BackgroundColor Black; Write-Host "" }

# ── Final pause ───────────────────────────────────────────────────────
function Wait-ForInput {
    if ($NoPause) { return }
    if ($env:CI -or $env:GITHUB_ACTIONS -or $env:CONTINUOUS_INTEGRATION) { return }
    try {
        if ([Console]::IsInputRedirected) { return }
    } catch {
        return
    }
    Write-Host ""
    Write-Host "  Press Enter to exit…" -ForegroundColor DarkGray -NoNewline
    try { [void](Read-Host) } catch { }
    Write-Host ""
}

# ── Banner ────────────────────────────────────────────────────────────
Clear-Host
Write-Host ""
Write-Host "  ███  NOVA  ·  build pipeline" -ForegroundColor Cyan
Write-Host "  ────────────────────────────────" -ForegroundColor DarkCyan
Write-Host ""

# ── Resolve project root (parent of the scripts folder) ───────────────
$scriptDir = $PSScriptRoot
if (-not $scriptDir) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
}
$root = Split-Path -Parent $scriptDir

if (-not (Test-Path (Join-Path $root "package.json"))) {
    Write-Fail "No package.json found in $root."
    Write-Info "This script expects to live in <project-root>/scripts/."
    Wait-ForInput
    exit 1
}

if (-not (Test-Path (Join-Path $root "src-tauri"))) {
    Write-Fail "No src-tauri directory found in $root. Is this the Nova repo root?"
    Wait-ForInput
    exit 1
}

Push-Location $root

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$osName = if ($PSVersionTable.PSVersion.Major -ge 6) {
    if ($IsWindows) { "Windows" } elseif ($IsMacOS) { "macOS" } else { "Linux" }
} else {
    if ($env:OS -eq "Windows_NT") { "Windows" } else { "Unix" }
}

Write-Info "Script dir   : $scriptDir"
Write-Info "Project root : $root"
Write-Info "Platform     : $osName"
Write-Info "PowerShell   : $($PSVersionTable.PSVersion)"
Write-Host ""

# ── Everything from here down runs inside try/finally ─────────────────
# Any `exit N` inside the try block triggers the finally, which pops the
# working directory and shows the pause prompt, then exits with N.
try {

    # ── Prerequisite checks ───────────────────────────────────────────
    Write-Section "Checking prerequisites"

    function Test-Command {
        param([string]$Name, [string]$Hint)
        $cmd = Get-Command $Name -ErrorAction SilentlyContinue
        if (-not $cmd) {
            Write-Fail "$Name not found in PATH."
            if ($Hint) { Write-Info "Install: $Hint" }
            return $false
        }
        Write-Ok "$Name"
        return $true
    }

    $missing = $false
    if (-not (Test-Command "node"   "https://nodejs.org"))    { $missing = $true }
    if (-not (Test-Command "npm"    "shipped with Node.js"))  { $missing = $true }
    if (-not (Test-Command "cargo"  "https://rustup.rs"))     { $missing = $true }
    if (-not (Test-Command "rustc"  "https://rustup.rs"))     { $missing = $true }

    if ($missing) {
        Write-Fail "Missing prerequisites. Install the tools above and re-run."
        exit 1
    }

    # ── Optional clean ────────────────────────────────────────────────
    if ($Clean) {
        Write-Section "Cleaning previous artifacts"

        $dist = Join-Path $root "dist"
        if (Test-Path $dist) {
            Remove-Item -Recurse -Force $dist
            Write-Ok "Removed dist/"
        } else {
            Write-Info "dist/ already absent"
        }

        $target = Join-Path $root "src-tauri\target"
        if (Test-Path $target) {
            Write-Step "Removing src-tauri/target (this may take a moment)…"
            Remove-Item -Recurse -Force $target
            Write-Ok "Removed src-tauri/target/"
        } else {
            Write-Info "src-tauri/target already absent"
        }
    }

    # ── Dependencies ──────────────────────────────────────────────────
    if (-not $SkipInstall) {
        Write-Section "Installing frontend dependencies"

        $nodeModules = Join-Path $root "node_modules"
        if (Test-Path $nodeModules) {
            Write-Info "node_modules present; running npm install to sync…"
        } else {
            Write-Info "First run — this will take a minute."
        }

        & npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "npm install failed (exit $LASTEXITCODE)."
            exit $LASTEXITCODE
        }
        Write-Ok "Dependencies ready"
    } else {
        Write-Info "Skipping npm install (-SkipInstall)"
    }

    # ── Frontend-only path ────────────────────────────────────────────
    if ($FrontendOnly) {
        Write-Section "Building frontend"

        & npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Frontend build failed (exit $LASTEXITCODE)."
            exit $LASTEXITCODE
        }

        Write-Ok "Frontend bundled to dist/"
        $sw.Stop()
        Write-Host ""
        Write-Host "  Finished in $([math]::Round($sw.Elapsed.TotalSeconds, 1))s" -ForegroundColor Cyan
        Write-Host ""
        exit 0
    }

    # ── Full Tauri build ──────────────────────────────────────────────
    Write-Section "Building Nova (release)"

    if ($NoBundle) {
        Write-Info "Mode: no-bundle (raw executable only)"
        & npm run tauri build -- --no-bundle
    } else {
        Write-Info "Mode: full bundle (installers)"
        & npm run tauri build
    }

    $code = $LASTEXITCODE
    if ($code -ne 0) {
        Write-Fail "Build failed (exit $code)."
        exit $code
    }

    # ── Report outputs ────────────────────────────────────────────────
    Write-Section "Build artifacts"

    $bundleDir = Join-Path $root "src-tauri\target\release\bundle"
    $rawExe    = Join-Path $root "src-tauri\target\release\nova.exe"

    $found = @()
    if (Test-Path $bundleDir) {
        $found += Get-ChildItem -Path $bundleDir -Recurse -File |
            Where-Object { $_.Extension -in ".msi", ".exe", ".dmg", ".deb", ".AppImage", ".rpm" }
    }

    if ($found.Count -gt 0) {
        foreach ($f in $found) {
            $sizeMb = [math]::Round($f.Length / 1MB, 2)
            Write-Host "  $($f.FullName)" -ForegroundColor White
            Write-Host "     $sizeMb MB" -ForegroundColor DarkGray
        }
    } else {
        Write-Warn "No installers found in bundle directory."
        Write-Info "Check that your tauri.conf.json has bundle.active = true."
    }

    if (Test-Path $rawExe) {
        $sizeMb = [math]::Round((Get-Item $rawExe).Length / 1MB, 2)
        Write-Host ""
        Write-Host "  Raw executable:" -ForegroundColor Cyan
        Write-Host "  $rawExe" -ForegroundColor White
        Write-Host "     $sizeMb MB" -ForegroundColor DarkGray
    }

    # ── Done ──────────────────────────────────────────────────────────
    $sw.Stop()
    $elapsed = [math]::Round($sw.Elapsed.TotalSeconds, 1)

    Write-Host ""
    Write-Host "  ────────────────────────────────" -ForegroundColor DarkCyan
    Write-Host "  Build complete in $elapsed s" -ForegroundColor Green
    Write-Host ""

    exit 0
}
finally {
    # Always restore the working directory and pause before exiting,
    # whether the build succeeded, failed, or bailed out early.
    Pop-Location -ErrorAction SilentlyContinue
    Wait-ForInput
}