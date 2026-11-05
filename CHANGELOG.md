# Changelog

All notable changes to Nova are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Complete Windows ad blocker — see Known limitations for details
- macOS build validation and first successful compile
- Extension popup surface (side panel is implemented, popup is not)
- History and bookmarks export / import
- Tab groups
- Custom new-tab layout editor
- Extension signing (Ed25519)
- Auto-update via the Tauri updater

## [0.1.1] - 2026-11-05

Second release. Focused on completing the browser feature set — history,
bookmarks, session restore, command palette, extension panels, and a full
keyboard shortcut layer — plus a UI redesign that trades the "demo" aesthetic
for something closer to a professional product.

### ⚠️ Platform support

| Platform | Status |
|---|---|
| **Windows 10 / 11** | Tested and working. |
| **macOS** | **Untested.** Code exists but has never been compiled or run. |
| **Linux** | Not supported. |
| **Android / iOS** | Not supported. |

### ⚠️ Feature status: ad blocker

Unchanged from 0.1.0. The engine loads EasyList correctly (~82,000 rules) and
evaluates URLs when tested via the diagnostic panel, but request interception
in the live browser is not reliable. On the adblocktester.com suite Nova
scores around 8–11% blocked, versus 80–90% for Brave and uBlock Origin. This
remains a known, tracked issue.

### Added

#### History and bookmarks
- Browsing history is recorded automatically on every successful page load
  with the page title and visit timestamp
- `nova://history` page with date-grouped entries, live search, per-entry
  removal, and clear-all
- Bookmarks with a star toggle in the address bar
- `Ctrl+D` keyboard shortcut for bookmark toggle, works from both the address
  bar and any focused page
- Optional bookmarks bar below the tab strip, off by default, toggleable in
  Settings or via `Ctrl+Shift+B`
- `nova://bookmarks` page with search and per-entry removal
- "Bookmark this page" action appears as the first row in the command palette
  when the query mentions bookmark or is empty

#### Search history
- Queries typed into the address bar that aren't URLs are recorded to a
  separate search history
- Recent searches surface in the command palette and on the history page
- Search history is cleared independently from browsing history

#### Session restore
- Open tabs, active tab, per-tab history stack, and history position are all
  saved on shutdown and restored on launch
- Toggle in Settings → Behavior to disable, which also clears the saved
  session immediately
- Restore is debounced by 500 ms so rapid tab changes don't thrash the disk

#### Command palette
- `Ctrl+K` opens from anywhere, including from a focused page
- Unified search across history, bookmarks, recent searches, and browser
  actions
- URL detection — typing a domain offers "Go to" as the top result
- Search fallback — anything else offers "Search for" as the top result
- `Ctrl+Enter` opens any URL result in a new tab; the current tab stays put
- Arrow-key navigation, Enter to select, Escape to close
- Selected row is highlighted with an accent bar; a `⌘↵ new tab` hint appears
  on the right when the result supports it

#### Extension side panels
- Extensions that declare `"ui": { "panel": "panel.html" }` in their manifest
  now get a toolbar entry
- Clicking a panel entry opens the extension's HTML in the right sidebar
  (sharing the slot with the AI assistant)
- Extension panels and the AI sidebar are mutually exclusive — opening one
  closes the other
- Extensions with only a `"ui": { "popup": "popup.html" }` field are also
  surfaced, rendered in the same panel slot as a fallback

#### Customizable UI
- **Window controls style** setting: choose between macOS traffic lights
  (default) or Windows-style minimize / maximize / close buttons
- **Reorderable toolbar**: eleven items — navigation cluster, address bar,
  command palette, history, bookmarks list, extensions, AI, downloads, new
  tab, settings — can be moved up or down in Settings → Toolbar
- Items that depend on state (AI when disabled, extensions when none have UI,
  bookmark star on internal pages) render nothing when inapplicable, so the
  layout doesn't break
- Reset-to-default button appears in the layout editor when the current
  layout differs from the default

#### Keyboard shortcuts
Full shortcut layer that works whether the page or the chrome has focus. The
listener in `injection.rs` routes page-level keydowns through the same
`nova-action.local` sentinel-navigation mechanism already used for downloads
and context menus.

| Shortcut | Action |
|---|---|
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close active tab |
| `Ctrl+Shift+T` | Reopen last closed tab (up to 20) |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Cycle tabs forward / backward |
| `Ctrl+1` … `Ctrl+8` | Jump to tab N |
| `Ctrl+9` | Jump to last tab |
| `Ctrl+L` / `F6` | Focus address bar (selects text) |
| `Ctrl+R` / `F5` | Reload |
| `Alt+←` / `Alt+→` | Back / forward |
| `Ctrl+D` | Toggle bookmark |
| `Ctrl+K` | Open command palette |
| `Ctrl+Shift+B` | Toggle bookmarks bar |
| `Escape` | Close topmost overlay, or revert address bar to current URL |

#### Tab management
- Middle-click a tab in the strip to close it
- Middle-click a tab in the overflow menu to close it
- Closing a background tab doesn't activate it first — the middle-click
  handler runs on `mousedown` so the tab closes without a visible flicker
- Closed tabs are pushed onto a session-scoped stack that `Ctrl+Shift+T` pops

### Changed

#### Visual redesign
The previous build used a heavily glassmorphic style — backdrop-filter on
every surface, cyan glow shadows on hover, animated backgrounds, drifting
grids — which read as "demo app" rather than "product". The redesign keeps
the cyberpunk identity (dark palette, cyan and violet accents, ambient
spotlight, orb animation) but moves the depth and motion to where they'll look good.

- **Solid surfaces** with three distinct elevation levels instead of
  translucent glass everywhere. Glass is now reserved for floating elements:
  command palette, tabs overflow menu, downloads popover.
- **Real shadows** for elevation instead of glow halos. Buttons lift 0.5 px
  on hover and press down 0.5 px on click — the tactile physics that
  professional UI uses.
- **One accent color, used sparingly** — the accent now appears only on
  focus rings, the active AI button, the current tab indicator, the loading
  bar, and primary buttons. Before, it was on every border and every hover
  state.
- **Choreographed entrance animations** on every modal, panel, and page —
  scale + translate + blur resolving simultaneously over 260–320 ms instead
  of appearing instantly. Motion happens on state change, not perpetually.
- **AI orb retained** as the single ambient animation — two rings rotating
  slowly in opposite directions with a breathing core. This is the "the
  assistant is alive" signal; everything else is static.
- **Reduced motion respected** — `prefers-reduced-motion` collapses all
  animations to instant.
- **The accent color setting now actually works.** The `--nv-accent` CSS
  variable reads from `--nova-accent`, which `useSettings.ts` writes when
  the user picks a color. Earlier builds hardcoded cyan and silently ignored
  the setting.

#### Address bar
- The bookmark star moved into the address bar (right side) instead of being
  a separate toolbar button. This mirrors how Safari and Arc handle it, and
  frees a toolbar slot for the customizable layout.
- `Escape` in the address bar now blurs the input and reverts the text to
  the current URL, matching Chrome and Firefox.

#### Toolbar
- The bookmarks list button icon changed from `★` to `☰` to distinguish it
  from the bookmark toggle star. Previously there were two star-shaped
  buttons with different functions, which was confusing.

#### Downloads page
- `nova://downloads` was rendering unstyled after a CSS consolidation that
  accidentally removed the `.nova-dlp-*` rules. All downloads page styles
  restored and restyled to match the new theme.

### Fixed

- **Address bar not updating on navigation**: clicking a link or being
  redirected now updates the address bar and tab title correctly. The tab
  state and the webview URL stay in sync via a shared `requestedUrlRef` that
  records the URL each webview is actually showing, so the mount effect
  doesn't destroy and recreate the webview on webview-initiated navigation.
- **Reload loaded the wrong URL**: fixed as a side effect of the address bar
  sync bug. Reload now targets the URL the tab is actually on.
- **DPI scaling**: child webviews were rendering at the wrong size on
  high-DPI Windows displays after a WebView2 update. Fixed by switching
  from `PhysicalPosition` / `PhysicalSize` to `LogicalPosition` /
  `LogicalSize` in both `create_tab_webview` and the resize loop, letting
  Tauri and WebView2 handle the scale factor.
- **`Ctrl+D` and `Ctrl+K` didn't work when a page had focus**: they were
  only attached to the host window. Now they're captured in the injected
  nav script (which runs inside the child webview) and routed through the
  sentinel mechanism, so they fire regardless of which webview has focus.
- **`on_web_resource_request` was not the right API for ad blocking**:
  documented in 0.1.0's known limitations. No change to that in 0.1.1.

### Removed

- **Zoom feature**: `Ctrl+=`, `Ctrl+-`, `Ctrl+0`, and `Ctrl+scroll` were
  unreliable and have been removed entirely. Those key combinations now pass
  through to the page's own handlers. The ZoomMenu component, the
  `set_webview_zoom` Rust command, and the zoom-related injection handlers
  are gone.

### Security

- Extension IPC calls are validated twice: once in the frontend router and
  once in Rust. Both must pass.
- The `nova-ext://` protocol blocks path traversal attempts.
- Extension iframes are cross-origin and cannot access the host DOM, cookies,
  or other extensions' data.
- The AI tool loop can only call the same functions the user can trigger from
  the toolbar; there is no privilege escalation.

## [0.1.0] - 2026-10-17

Initial public release. Nova is a browser shell built on Tauri v2 and React
19, currently validated on Windows only.

### ⚠️ Platform support

| Platform | Status |
|---|---|
| **Windows 10 / 11** | Tested and working. |
| **macOS** | Untested — code exists, never compiled or run. |
| **Linux** | Not supported (Wayland incompatibility). |
| **Android / iOS** | Not supported (Tauri lacks child webviews on mobile). |

### ⚠️ Feature status: ad blocker

The ad blocker is in progress and not complete. The engine loads EasyList
correctly (~82,000 rules) and evaluates URLs when tested directly, but
request interception in the live browser is not reliable. On
adblocktester.com Nova scores around 8–11% blocked, versus 80–90% for
Brave and uBlock Origin. This is a known, tracked issue.

### Added

- Native tab model where each tab is a real child webview
- Tab strip with equal-width shrinking, horizontal scroll, and overflow menu
- Back / forward / reload with per-tab history stack
- Address bar with search engine fallback and loading-state glow
- Animated page-load progress bar driven by Rust `on_page_load` events
- macOS-style traffic-light window controls
- Custom homepage at `nova://home` with live clock, quick links, recent
  downloads strip
- `nova://settings` internal page with search engine picker, homepage,
  accent color, AI config, ad blocker toggle, extensions manager
- AI assistant with streaming chat, tool calling (navigate, open tabs,
  search, close tabs, list tabs, read page URL, change settings), animated
  orb, tool call cards
- Extension system with manifest discovery, sandboxed iframes over
  `nova-ext://`, typed SDK, two-layer permission enforcement
- Downloads manager with native popover window, per-download progress,
  pause / resume / cancel, `nova://downloads` page with source page URLs
  and saved paths
- Ad blocker with `adblock-rust` engine and EasyList, diagnostic panel
- Optional custom context menu rendered as DOM inside the page
- Cross-platform build scripts (`scripts/build.ps1`, `scripts/build.sh`,
  `scripts/build.bat`) with flags for clean, frontend-only, no-bundle,
  skip-install, no-pause
- CI workflow that type-checks the frontend and runs `cargo check` on
  every push, builds Windows installers on main

### Known limitations

- macOS is untested.
- The ad blocker does not currently block the majority of ad requests.
- The AI assistant requires a running llama.cpp server.
- Extensions cannot yet render a popup or side panel UI. The manifest fields
  exist but the UI surfaces are not implemented. (Fixed in 0.1.1 for
  side panels.)
- Session state is not restored on restart. (Fixed in 0.1.1.)
- No history or bookmarks. (Fixed in 0.1.1.)

### Security

- Extension IPC calls are validated twice.
- The `nova-ext://` protocol blocks path traversal.
- Extension iframes are cross-origin.
- The AI tool loop has no privilege escalation.

## Version format

- **Added** for new features
- **Changed** for changes to existing behavior
- **Deprecated** for soon-to-be-removed features
- **Removed** for removed features
- **Fixed** for bug fixes
- **Security** for security-relevant changes

[Unreleased]: https://github.com/Aetex/nova/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/Aetex/nova/releases/tag/v0.1.1
[0.1.0]: https://github.com/Aetex/nova/releases/tag/v0.1.0