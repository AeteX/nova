# Nova Architecture

## Overview

Nova is a Tauri v2 application with a React frontend, a Rust backend, and an extension system that isolates third-party code in sandboxed iframes.

```
┌─────────────────────────────────────────────────────────────────────┐
│ TAURI PROCESS                                                       │
│                                                                     │
│  ┌──────────────────────────────┐  ┌─────────────────────────────┐ │
│  │ MAIN WEBVIEW                 │  │ CHILD WEBVIEWS              │ │
│  │ (React UI)                   │  │ (one per browser tab)       │ │
│  │                              │  │                             │ │
│  │  Toolbar · Tabs · Settings   │  │  Rendered page content      │ │
│  │  AI panel · Extension mgr    │  │  Content scripts injected   │ │
│  └────────────┬─────────────────┘  └─────────────────────────────┘ │
│               │                                                    │
│               │ postMessage / Tauri IPC                            │
│               ▼                                                    │
│  ┌────────────────────────────────────────────────────────────────┐│
│  │ RUST CORE                                                       ││
│  │                                                                 ││
│  │  Webview lifecycle · URI scheme (nova-ext://) · File I/O        ││
│  │  Extension discovery · Permission enforcement                   ││
│  └────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐│
│  │ EXTENSION IFRAMES (sandboxed, cross-origin)                     ││
│  │                                                                 ││
│  │  Loaded from nova-ext://<ext-id>/background.html                ││
│  │  Talk to host via postMessage on the nova-ext-bridge channel    ││
│  └────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

## Frontend

The React app is the browser chrome. It has no access to the page content of tabs — that lives in native child webviews. Communication between the UI and each tab flows through Tauri commands.

Key modules:

- `components/Browser.tsx` — orchestrates the layout, tab state, and webview lifecycle
- `components/Settings.tsx` — settings modal
- `components/AIPanel.tsx` — AI assistant sidebar
- `hooks/useSettings.ts` — persisted user preferences
- `hooks/useAI.ts` — streaming client for llama.cpp
- `hooks/useExtensions.ts` — extension list and IPC router bootstrap
- `extension-host/*` — the runtime side of the extension system
- `extension-sdk/*` — the SDK shipped to extension authors

## Rust core

The Rust side handles three things the frontend cannot:

1. **Native webview creation.** Tabs are real OS-level webviews, not iframes. This is what makes Nova feel like a browser rather than a web app.
2. **Custom URI scheme.** The `nova-ext://` protocol serves extension files from disk with proper MIME types and a per-response CSP.
3. **Extension lifecycle.** Filesystem scanning, manifest validation, path-traversal protection, and the second layer of permission enforcement.

Key modules:

- `src/extension/discovery.rs` — filesystem scan and manifest parsing
- `src/extension/manifest.rs` — typed manifest schema
- `src/extension/permissions.rs` — Rust-side permission registry
- `src/extension/protocol.rs` — custom URI scheme handler
- `src/extension/commands.rs` — `extensions_list`, `extensions_install`, `extensions_uninstall`, `extensions_read_file`
- `src/extension/injection.rs` — content script assembly

## Extension system

See [EXTENSIONS.md](EXTENSIONS.md) for the extension API. The design follows three principles:

1. **Isolation by origin.** Every extension runs in a cross-origin iframe loaded from `nova-ext://<ext-id>/`. It cannot access the parent DOM, cookies, or any other extension's iframe.
2. **Two-layer permission enforcement.** Every IPC call is checked once in the frontend router (`checkPermission`) and once in Rust (`permissions::check`). Both layers must pass.
3. **Manifest-first.** The manifest declares everything the extension can do. Nothing it does at runtime can broaden this.

## IPC bridge

The extension-to-host channel is `window.postMessage`, filtered on the `nova-ext-bridge` string. Message shapes:

**Request (extension → host):**
```json
{
  "channel": "nova-ext-bridge",
  "extId": "com.example.ext",
  "reqId": "req-1",
  "kind": "request",
  "command": "tabs_query",
  "args": { "active": true }
}
```

**Response (host → extension):**
```json
{
  "channel": "nova-ext-bridge",
  "reqId": "req-1",
  "kind": "response",
  "ok": true,
  "value": [ ... ]
}
```

**Event (host → extension):**
```json
{
  "channel": "nova-ext-bridge",
  "kind": "event",
  "event": "tabs.onUpdated",
  "payload": { "tabId": "tab-3", "changes": { "status": "complete" } }
}
```

The `ExtensionIpcRouter` on the host side receives requests, checks permissions, and dispatches to the appropriate handler. Handlers either resolve locally (against React state) or call into Rust via Tauri's `invoke`.

## AI tool-calling loop

The AI assistant uses an iterative tool loop. On every user message:

1. Send the conversation plus the tool definitions to llama.cpp's `/v1/chat/completions`
2. Parse the SSE stream, accumulating text deltas and any `tool_calls` deltas
3. If no tool calls, render the assistant text and stop
4. If tool calls, execute them sequentially through `AIToolset.execute`, append results to the conversation, and loop
5. Repeat up to 6 rounds

Each tool call is a function on `AIToolset` — a thin adapter over the same functions used by the toolbar (navigate, addTab, closeTab, update settings). There's no privilege escalation: the AI can only do what the user can do.

## Security model

| Boundary | Enforcement |
|---|---|
| Extension → host | Two-layer permission check |
| Host → webview content | WebView2 / WKWebView sandbox |
| Extension → filesystem | Path-traversal guard in `protocol.rs` and `commands.rs` |
| AI → host | Same functions as the toolbar; no privileged API |
| Extension → network | Restricted by the CSP in `protocol.rs` |

## Build pipeline

1. `npm run build` — Vite bundles the React app into `dist/`
2. `cargo build --release` — compiles the Rust backend and embeds `dist/` plus `embedded/nova-ext-sdk.js`
3. `tauri build` — packages everything into platform-specific installers

The SDK bundle is embedded at compile time via `include_str!`, so the released binary is fully self-contained.

## Features

- **Ad blocker**: WebView2 `WebResourceRequested` COM handler on Windows,
  `WKContentRuleList` on macOS. Rules from `adblock-rust` on Windows,
  WebKit JSON on macOS.
- **Zoom**: per-tab zoom level, stored in tab state, applied on webview
  creation and via `set_webview_zoom` during interaction.
- **Homepage**: rendered as a `nova://home` internal page in the host
  webview. Quick links persist via `useSettings`.
- **Downloads popover**: separate Tauri window with its own React root,
  identified by `?nova-window=downloads` in the main.tsx entry point.