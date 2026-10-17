#!/usr/bin/env bash
#
# scripts/build.sh — Nova production build pipeline.
#
# Automatically resolves the project root as the parent of this script's
# directory. Pauses at the end so you can read the log. Pass --no-pause
# to skip, or run under CI (auto-detected) and the pause is skipped too.
#
# Usage:
#   ./scripts/build.sh                 standard release build
#   ./scripts/build.sh --clean         wipe caches, then build
#   ./scripts/build.sh --frontend      frontend only
#   ./scripts/build.sh --no-bundle     raw executable, no installers
#   ./scripts/build.sh --skip-install  skip npm install (for CI)
#   ./scripts/build.sh --no-pause      skip the final Enter-to-exit pause
#
set -euo pipefail

# ── Colours (auto-disable if not a TTY) ─────────────────────────────
if [ -t 1 ]; then
  C_RESET=$'\033[0m'
  C_CYAN=$'\033[36m'
  C_GREEN=$'\033[32m'
  C_RED=$'\033[31m'
  C_YELLOW=$'\033[33m'
  C_DIM=$'\033[2m'
  C_BOLD=$'\033[1m'
else
  C_RESET=""; C_CYAN=""; C_GREEN=""; C_RED=""; C_YELLOW=""; C_DIM=""; C_BOLD=""
fi

step()    { printf "%s>%s %s\n" "$C_CYAN" "$C_RESET" "$1"; }
ok()      { printf "%s[OK]%s %s\n" "$C_GREEN" "$C_RESET" "$1"; }
fail()    { printf "%s[!!]%s %s\n" "$C_RED" "$C_RESET" "$1" >&2; }
warn()    { printf "%s[!]%s %s\n" "$C_YELLOW" "$C_RESET" "$1"; }
info()    { printf "     %s%s%s\n" "$C_DIM" "$1" "$C_RESET"; }
section() { printf "\n%s  %s%s\n\n" "$C_CYAN" "$1" "$C_RESET"; }

# ── Flags ────────────────────────────────────────────────────────────
CLEAN=0
FRONTEND_ONLY=0
NO_BUNDLE=0
SKIP_INSTALL=0
NO_PAUSE=0

for arg in "$@"; do
  case "$arg" in
    --clean)         CLEAN=1 ;;
    --frontend)      FRONTEND_ONLY=1 ;;
    --no-bundle)     NO_BUNDLE=1 ;;
    --skip-install)  SKIP_INSTALL=1 ;;
    --no-pause)      NO_PAUSE=1 ;;
    -h|--help)
      sed -n '2,16p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      fail "Unknown flag: $arg"
      exit 2
      ;;
  esac
done

# Auto-disable pause in CI environments
if [ -n "${CI:-}" ] || [ -n "${GITHUB_ACTIONS:-}" ] || [ -n "${CONTINUOUS_INTEGRATION:-}" ]; then
  NO_PAUSE=1
fi

# ── Final pause ──────────────────────────────────────────────────────
# Registered as an EXIT trap so it fires on success, on `exit N`, and
# on `set -e` early termination. It never alters the exit code because
# it returns 0 unconditionally.
pause_for_input() {
  if [ "$NO_PAUSE" -eq 1 ]; then return 0; fi
  if [ ! -t 0 ]; then return 0; fi
  printf "\n  Press Enter to exit…"
  read -r _ || true
  printf "\n"
  return 0
}
trap 'pause_for_input' EXIT

# ── Banner ───────────────────────────────────────────────────────────
clear 2>/dev/null || true
printf "\n"
printf "%s  ███  NOVA  ·  build pipeline%s\n" "$C_CYAN" "$C_RESET"
printf "  ────────────────────────────────\n\n"

# ── Resolve project root (parent of this script's directory) ─────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

if [ ! -f "package.json" ]; then
  fail "No package.json found in $ROOT."
  info "This script expects to live in <project-root>/scripts/."
  exit 1
fi
if [ ! -d "src-tauri" ]; then
  fail "No src-tauri directory found in $ROOT. Is this the Nova repo root?"
  exit 1
fi

START_TS=$(date +%s)
UNAME="$(uname -s 2>/dev/null || echo unknown)"

info "Script dir   : $SCRIPT_DIR"
info "Project root : $ROOT"
info "Platform     : $UNAME"
info "Shell        : $BASH_VERSION"
printf "\n"

# ── Prerequisites ────────────────────────────────────────────────────
section "Checking prerequisites"

missing=0
check_cmd() {
  local name="$1" hint="${2:-}"
  if ! command -v "$name" >/dev/null 2>&1; then
    fail "$name not found in PATH."
    [ -n "$hint" ] && info "Install: $hint"
    missing=1
    return 1
  fi
  ok "$name"
  return 0
}

check_cmd node  "https://nodejs.org" || true
check_cmd npm   "shipped with Node.js" || true
check_cmd cargo "https://rustup.rs" || true
check_cmd rustc "https://rustup.rs" || true

if [ "$missing" -ne 0 ]; then
  fail "Missing prerequisites. Install the tools above and re-run."
  exit 1
fi

# ── Optional clean ───────────────────────────────────────────────────
if [ "$CLEAN" -eq 1 ]; then
  section "Cleaning previous artifacts"
  if [ -d "dist" ]; then
    rm -rf "dist"
    ok "Removed dist/"
  else
    info "dist/ already absent"
  fi
  if [ -d "src-tauri/target" ]; then
    step "Removing src-tauri/target (this may take a moment)…"
    rm -rf "src-tauri/target"
    ok "Removed src-tauri/target/"
  else
    info "src-tauri/target already absent"
  fi
fi

# ── Dependencies ─────────────────────────────────────────────────────
if [ "$SKIP_INSTALL" -eq 0 ]; then
  section "Installing frontend dependencies"
  if [ -d "node_modules" ]; then
    info "node_modules present; running npm install to sync…"
  else
    info "First run — this will take a minute."
  fi
  npm install
  ok "Dependencies ready"
else
  info "Skipping npm install (--skip-install)"
fi

# ── Frontend-only ────────────────────────────────────────────────────
if [ "$FRONTEND_ONLY" -eq 1 ]; then
  section "Building frontend"
  npm run build
  ok "Frontend bundled to dist/"
  ELAPSED=$(( $(date +%s) - START_TS ))
  printf "\n  Finished in %ss\n\n" "$ELAPSED"
  exit 0
fi

# ── Full Tauri build ─────────────────────────────────────────────────
section "Building Nova (release)"

if [ "$NO_BUNDLE" -eq 1 ]; then
  info "Mode: no-bundle (raw executable only)"
  npm run tauri build -- --no-bundle
else
  info "Mode: full bundle (installers)"
  npm run tauri build
fi

# ── Report outputs ───────────────────────────────────────────────────
section "Build artifacts"

BUNDLE_DIR="src-tauri/target/release/bundle"
RAW_BIN="src-tauri/target/release/nova"

found_any=0
if [ -d "$BUNDLE_DIR" ]; then
  while IFS= read -r -d '' f; do
    found_any=1
    case "$(uname -s)" in
      Darwin) SIZE=$(stat -f%z "$f" 2>/dev/null || echo 0) ;;
      *)      SIZE=$(stat -c%s "$f" 2>/dev/null || echo 0) ;;
    esac
    SIZE_MB=$(awk -v b="$SIZE" 'BEGIN { printf "%.2f", b/1048576 }')
    printf "  %s\n" "$f"
    printf "     %s MB%s\n" "$SIZE_MB" "$C_RESET"
  done < <(find "$BUNDLE_DIR" -type f \( \
    -name "*.AppImage" -o -name "*.deb" -o -name "*.rpm" \
    -o -name "*.dmg" -o -name "*.msi" -o -name "*.exe" \) -print0 2>/dev/null)
fi

if [ "$found_any" -eq 0 ]; then
  warn "No installers found in bundle directory."
  info "Check that your tauri.conf.json has bundle.active = true."
fi

if [ -f "$RAW_BIN" ]; then
  case "$(uname -s)" in
    Darwin) SIZE=$(stat -f%z "$RAW_BIN" 2>/dev/null || echo 0) ;;
    *)      SIZE=$(stat -c%s "$RAW_BIN" 2>/dev/null || echo 0) ;;
  esac
  SIZE_MB=$(awk -v b="$SIZE" 'BEGIN { printf "%.2f", b/1048576 }')
  printf "\n  %sRaw executable:%s\n" "$C_CYAN" "$C_RESET"
  printf "  %s\n" "$RAW_BIN"
  printf "     %s MB%s\n" "$SIZE_MB" "$C_RESET"
fi

# ── Done ─────────────────────────────────────────────────────────────
ELAPSED=$(( $(date +%s) - START_TS ))
printf "\n  ────────────────────────────────\n"
printf "  %sBuild complete in %ss%s\n\n" "$C_GREEN" "$ELAPSED" "$C_RESET"

# Exit code 0. The EXIT trap fires next and shows the pause prompt.