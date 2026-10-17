# Changelog

All notable changes to Nova are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Complete Windows ad blocker — see Known limitations for details
- macOS build validation and first successful compile
- Extension side panel and popup surfaces
- Command palette (`Ctrl+K`)
- History and bookmarks
- Session restore on restart
- Full EasyList → WebKit JSON converter for macOS filter coverage
- Extension signing (Ed25519)
- Auto-update via the Tauri updater

## [0.1.0] - 2026-10-17

Initial public release. Nova is a browser shell built on Tauri v2 and React 19,
currently validated on Windows only.

### ⚠️ Platform support

| Platform | Status |
|---|---|
| **Windows 10 / 11** | Tested and working. This is the only platform the developer has run the app on. |
| **macOS** | **Untested.** The code exists — Rust modules, capabilities, WebKit Content Rule List integration, build paths — but has never been compiled or run on macOS hardware because the developer does not own a Mac. It may fail to build out of the box, or build and misbehave in ways that have not been observed. Treat macOS as experimental until a release note says otherwise. |
| **Linux** | Not supported. Child webviews require X11 and do not work on Wayland, which is the default on every major distribution. Out of scope for 0.1.x. |
| **Android / iOS** | Not supported. Tauri's mobile platform does not expose child webviews, which Nova's tab model requires. |

### ⚠️ Feature status: ad blocker

The ad blocker is **in progress and not complete**. This is not a caveat about coverage — it is a statement that the feature does not currently do what a user would expect.

- The `adblock-rust` engine loads EasyList successfully. The diagnostic panel in Settings reports a rule count of ~82,000 rules.
- The engine correctly evaluates URLs when tested manually via the `diagnose_url` command. `pagead2.googlesyndication.com` returns `blocked: true` when tested directly.
- The request interception layer is not reliable in practice. On the adblocktester.com suite, Nova scores around 8–11% blocked, compared to 80–90% for Brave and uBlock Origin on the same suite. This indicates that the `WebResourceRequested` COM handler is not firing for most requests, or is firing with incomplete context.
- Pause, cancel, and download controls are unaffected.

Do not file "ad blocker doesn't work" as a bug — it is a known, tracked issue. If you can help debug why the `ICoreWebView2_22` handler is not intercepting, contributions are welcome.

### Added

#### Core browser
- Native tab model where each tab is a real child webview, not an iframe
- Tab strip with equal-width shrinking, horizontal scroll, and an overflow
  menu for hidden tabs
- Back / forward / reload with per-tab history stack and disabled-state
  indicators
- Address bar with search engine fallback, domain auto-detection, and
  loading-state glow
- Animated page-load progress bar driven by Rust `on_page_load` events
- macOS-style traffic-light window controls (close / minimize / maximize)
  that work cross-platform on Windows and macOS
- Persistent per-tab zoom via Ctrl+=, Ctrl+-, Ctrl+0, and Ctrl+scroll,
  plus a toolbar percentage button with preset menu

#### Custom homepage
- `nova://home` internal page with live clock, time-aware greeting, and
  animated perspective grid background
- Central search bar with `/` keyboard shortcut to focus and
  Ctrl+Enter to open in a new tab
- Customizable quick links with favicon fetching, gradient letter
  fallbacks, and an add-shortcut modal
- Recent downloads strip that appears when at least one download exists
- One-click access to settings, AI panel, and the full downloads page

#### Settings
- `nova://settings` internal page rendered as a dedicated tab
- Search engine picker: DuckDuckGo, Google, Bing, Brave, Startpage,
  Ecosia, and custom URL template
- Homepage configuration
- Accent color system with six presets and a custom color picker that
  propagates live to every surface via CSS variables
- Custom context menu toggle (off by default)
- AI assistant configuration: server URL, model name, system prompt, and
  temperature
- Ad blocker toggle with rule count display (see feature status above)
- Extensions manager UI
- Reset-to-defaults confirmation flow
- All settings persist to `localStorage` and survive restarts

#### AI assistant
- Slide-in sidebar (shrink-to-fit, not overlay) triggered from the toolbar
- Streaming chat completions against any llama.cpp server via the
  OpenAI-compatible `/v1/chat/completions` endpoint
- Tool calling loop with six rounds of follow-up: the model can navigate,
  open tabs, search the web, close tabs, list open tabs, read the current
  page URL, change search engine, change accent color, and change homepage
- Animated orb in the header with four states: idle, connecting, streaming,
  and error
- Per-tool-call cards with scanning-beam, success flash, and shake-on-error
  animations
- Stop generation button and clear conversation action
- Cyberpunk visual treatment: animated perspective grid, horizontal
  scanline, holographic message bubbles, and message-in slide animations

#### Extension system
- Manifest-based extension discovery from a per-user directory
- Two-tier architecture: built-in extensions in host context, installed
  extensions in sandboxed cross-origin iframes served over `nova-ext://`
- Two-layer permission enforcement: frontend router checks and Rust-side
  re-validation on every IPC call
- Path-traversal guards on both protocol and command handlers
- Typed SDK with `tabs`, `storage`, `runtime`, `contentScripts`, and `ui`
  namespaces
- Content script registration and URL glob matching
- Extensions manager UI in settings with permissions display, refresh,
  and uninstall
- Bundled SDK served from the Rust binary at `nova-ext://__sdk__/nova-ext-sdk.js`

#### Downloads
- Streaming downloads via `reqwest` with byte-count events emitted to the
  frontend
- Native popover window (`downloads-popover`) rendered as a separate React
  root with its own event loop, immune to page-level interference
- Compact popover showing the four most recent downloads with a
  "Show all" footer
- Full `nova://downloads` page listing every download with filename, status,
  size, source page URL, file URL, saved path, and per-item actions
- Pause / resume / cancel controls per download
- Open file and show-in-folder actions on completed downloads
- Automatic filename de-duplication and sanitization

#### Ad blocker (in progress)
- `adblock-rust` engine loaded with bundled EasyList at startup
- Engine evaluates URLs correctly when tested directly
- Windows: `WebResourceRequested` COM handler attached to every child
  webview via `ICoreWebView2_22` — **interception is incomplete, see the
  feature status section above**
- Diagnostic command (`diagnose_url`) for testing individual URLs against
  the engine
- macOS scaffolding via `WKContentRuleList` (compiled at startup, attached
  to every webview) — **untested, see Platform support**

#### Custom context menu (opt-in)
- Neon-styled right-click menu rendered as DOM inside the page, avoiding the
  native webview occlusion problem
- Context-sensitive items: navigation, clipboard, link actions, image
  actions, and page-wide commands
- Action routing via sentinel navigation, bypassing the IPC isolation on
  external-origin pages

#### Build & release
- Cross-platform build scripts (`scripts/build.ps1`, `scripts/build.sh`,
  `scripts/build.bat`) with `-Clean`, `-FrontendOnly`, `-NoBundle`,
  `-SkipInstall`, and `-NoPause` flags
- Prerequisite checking with actionable install hints
- Automatic artifact reporting with file sizes
- CI workflow that type-checks the frontend and runs `cargo check` on every
  push, and builds Windows installers on `main`

### Known limitations

- **macOS is untested.** No macOS binary has ever been produced by the
  developer. The code paths exist and compile in principle, but have not
  been validated. If you build on macOS and it works, please open an issue
  to say so.
- **The ad blocker does not currently block the majority of ad requests.**
  See the feature status section above. This is the single largest known
  gap in the 0.1.0 release.
- Requests from cross-origin iframes may not surface through the parent
  webview's handler, which is the suspected cause of the ad blocker's low
  coverage.
- The AI assistant requires a running llama.cpp server. It is disabled by
  default.
- Extensions cannot yet render a popup or side panel UI. The manifest
  fields exist but the UI surfaces are not implemented.
- Session state (open tabs, scroll positions) is not restored on restart.
- No history or bookmarks yet.

### Security

- Extension IPC calls are validated twice: once in the frontend router and
  once in Rust. Both must pass.
- The `nova-ext://` protocol blocks path traversal attempts.
- Extension iframes are cross-origin and cannot access the host DOM, cookies,
  or other extensions' data.
- The AI tool loop can only call the same functions the user can trigger
  from the toolbar; there is no privilege escalation.

## Version format

- **Added** for new features
- **Changed** for changes to existing behavior
- **Deprecated** for soon-to-be-removed features
- **Removed** for removed features
- **Fixed** for bug fixes
- **Security** for security-relevant changes

[Unreleased]: https://github.com/AeteX/nova/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/AeteX/nova/releases/tag/v0.1.0