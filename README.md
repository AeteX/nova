<div align="center">

# Nova

**A futuristic, extensible desktop browser built with Tauri and React.**

[![Release](https://img.shields.io/github/v/release/AeteX/nova?style=flat-square&color=00e5ff)](https://github.com/AeteX/nova/releases)
[![Build](https://img.shields.io/github/actions/workflow/status/AeteX/nova/build.yml?style=flat-square&label=build)](https://github.com/AeteX/nova/actions)
[![License](https://img.shields.io/github/license/AeteX/nova?style=flat-square&color=7c4dff)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-windows-00e5ff?style=flat-square)](https://github.com/AeteX/nova/releases)
[![Tauri](https://img.shields.io/badge/tauri-2.x-24c8db?style=flat-square&logo=tauri)](https://tauri.app)

[Download](#installation) · [Screenshots](#screenshots) · [Features](#features) · [Extensions](#extension-sdk) · [Development](#development) · [Changelog](CHANGELOG.md)

</div>

---

> [!WARNING]
> **Windows only, and the ad blocker is incomplete.**
>
> Nova has only been built and run on Windows. A macOS build path exists
> in the code, but the developer does not own a Mac, so **macOS has never
> been compiled or tested**. If you build Nova on macOS and it works,
> please open an issue to say so — it would be the first confirmation.
>
> The **ad blocker is a work in progress**. EasyList loads and the engine
> evaluates URLs correctly when tested directly, but request interception
> in the live browser is not reliable. On the adblocktester.com suite, Nova
> scores around 8–11% blocked versus 80–90% for Brave and uBlock Origin.
> Do not file "ad blocker doesn't work" as a bug — see
> [CHANGELOG.md](CHANGELOG.md#️-feature-status-ad-blocker) for the current
> state of the feature.

---

Nova is a native browser shell built on **Tauri v2** and **React 19**. It
ships with a local-first AI assistant, a native extension system, a custom
homepage, and a cyberpunk-inspired UI.

## Screenshots

<img src="docs/screenshots/main.png" alt="Nova main window with tabs and address bar" width="900" />

*The main window — custom toolbar, tab strip, per-tab webviews, and the address bar with search fallback.*

<br />

| Homepage | Settings |
|---|---|
| <img src="docs/screenshots/home.png" alt="Nova custom homepage" width="440" /> | <img src="docs/screenshots/settings.png" alt="Nova settings page" width="440" /> |
| `nova://home` — live clock, quick links, recent downloads | `nova://settings` — rendered as a dedicated tab |

## Platform support

| Platform | Status |
|---|---|
| **Windows 10 / 11** | ✅ Tested and working |
| **macOS** | ⚠️ Untested — code exists, never compiled or run |
| **Linux** | ❌ Not supported (Wayland incompatibility) |
| **Mobile** | ❌ Not supported (Tauri lacks child webviews on mobile) |

## Features

- **Native child webviews** — each tab is a real OS-level webview, not an iframe
- **Custom homepage** (`nova://home`) — live clock, central search bar, customizable quick links, recent downloads
- **AI assistant** — streaming from any llama.cpp server, with tool calling for navigation, tabs, downloads, and settings
- **Extension system** — sandboxed iframes, typed SDK, two-layer permission enforcement
- **Downloads manager** — native popover window, per-download progress, pause/resume/cancel, detailed `nova://downloads` page
- **Per-tab zoom** — Ctrl+= / Ctrl+- / Ctrl+0 / Ctrl+scroll, persisted across tab switches
- **Custom context menu** — optional neon-styled menu rendered as DOM inside the page
- **Ad blocker (in progress)** — EasyList-based, currently partial — see the warning above
- **Working tab strip** — shrinking tabs, horizontal scroll, overflow menu

## Installation

Download the latest release from the [Releases page](https://github.com/AeteX/nova/releases).

| Platform | File | Notes |
|---|---|---|
| Windows | `Nova_x.x.x_x64-setup.exe` or `.msi` | Tested and working |
| macOS | `Nova_x.x.x_x64.dmg` | ⚠️ Not available until the code is validated on macOS |

### First launch

The Windows installer isn't code-signed, so Defender SmartScreen will warn you.
Click **More info → Run anyway**. This warning appears because signing
certificates cost money, not because the installer is unsafe — you can inspect
the source in this repository.

### Enabling the AI assistant

1. Download `llama-server` from the [llama.cpp releases page](https://github.com/ggml-org/llama.cpp/releases)
2. Download a GGUF model — Llama 3.2 3B or Qwen 2.5 7B are good starting points
3. Run `./llama-server -m your-model.gguf -c 4096 --host 127.0.0.1 --port 8080`
4. In Nova, open **Settings → AI Assistant** and toggle **Enable**

## Development

### Prerequisites

| Dependency | Version | Install |
|---|---|---|
| Rust | 1.77+ | [rustup.rs](https://rustup.rs) |
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| Platform toolchain | — | See below |

**Windows:** Microsoft C++ Build Tools (check "Desktop development with C++")
and WebView2 Runtime (pre-installed on Windows 11,
[download for Windows 10](https://developer.microsoft.com/microsoft-edge/webview2/)).

**macOS:** `xcode-select --install`. Note that no successful macOS build
has been reported yet — expect to fix some compile issues if you try.

### Setup

```bash
git clone https://github.com/AeteX/nova.git
cd nova
npm install
```

### Development build

```bash
npm run tauri dev
```

### Production build

**Windows:**
```powershell
.\scripts\build.ps1
```
Or double-click `scripts\build.bat` — it handles execution policy automatically.

**macOS (untested):**
```bash
chmod +x scripts/build.sh
./scripts/build.sh
```

**Build flags:**

| PowerShell | Shell | Effect |
|---|---|---|
| `-Clean` | `--clean` | Wipe `dist/` and `src-tauri/target/` first |
| `-FrontendOnly` | `--frontend` | Skip Rust compile |
| `-NoBundle` | `--no-bundle` | Raw executable, no installers |
| `-SkipInstall` | `--skip-install` | Skip `npm install` (CI) |
| `-NoPause` | `--no-pause` | Skip end-of-run pause |

## Extension SDK

```js
defineExtension("com.example.my-ext", (nova) => {
  nova.runtime.onMessage.addListener((msg) => {
    if (msg.type === "ping") return { type: "pong" };
  });
});
```

Extensions install by dropping a folder into the directory shown in
**Settings → Extensions**. See [docs/EXTENSIONS.md](docs/EXTENSIONS.md) for
the full manifest reference.

## Architecture

Three layers: **React frontend**, **Rust core (Tauri)**,
**sandboxed extension runtime**. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Project structure

```
nova/
├── src/                        React frontend
│   ├── components/             UI (Browser, Settings, HomePage, AIPanel, …)
│   ├── hooks/                  Settings, extensions, downloads, AI
│   ├── extension-sdk/          SDK shipped to extension authors
│   └── extension-host/         Host-side extension runtime
├── src-tauri/                  Rust backend
│   ├── src/                    lib.rs, downloads, adblocker, extensions
│   ├── filters/                EasyList and WebKit rule JSON
│   └── embedded/               Bundled extension SDK
├── scripts/                    Build scripts
├── docs/
│   ├── screenshots/            README images
│   ├── ARCHITECTURE.md
│   └── EXTENSIONS.md
└── CHANGELOG.md
```

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Styling | Plain CSS with custom properties |
| Native shell | Tauri 2 + Wry |
| Backend | Rust 2021, tokio, reqwest |
| Ad blocking | adblock-rust 0.13 |
| AI | llama.cpp (OpenAI-compatible HTTP API) |

## Contributing

Contributions are especially welcome for:

- **macOS validation** — if you have a Mac, try building and open an issue
  with the errors or the good news
- **Windows ad blocker interception** — the handler is not firing for most
  requests, and any insight into `ICoreWebView2_22` behavior on child
  webviews would help
- **EasyList → WebKit JSON conversion** — the macOS blocker needs a proper
  converter to reach meaningful coverage

See [CHANGELOG.md](CHANGELOG.md) for the full list of known limitations.

## License

MIT — see [LICENSE](LICENSE). Bundled filter lists are licensed separately;
see `src-tauri/filters/README.md`.

---

<div align="center">Built by <strong>AeteX</strong></div>