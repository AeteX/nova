# Nova Extension SDK

Extensions let you add functionality to Nova without touching the browser source. They run in sandboxed iframes, communicate with the host over a `postMessage` bridge, and can only use capabilities they've declared in their manifest.

## Quick Start

An extension is a folder with a `manifest.json` and at least one HTML file:

```
com.example.my-ext/
├── manifest.json
├── background.html
├── background.js
├── content.js
└── icon.png
```

Drop the folder into Nova's extensions directory (visible in Settings → Extensions) and click the refresh button.

## Manifest

```json
{
  "manifest_version": 1,
  "id": "com.example.my-ext",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "Does something useful.",
  "author": "Your Name",
  "homepage": "https://example.com",
  "icon": "icon.png",
  "permissions": ["tabs.read", "storage.local", "messaging"],
  "background": {
    "page": "background.html"
  },
  "content_scripts": [
    {
      "matches": ["https://*.github.com/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "ui": {
    "popup": "popup.html",
    "panel": "panel.html"
  },
  "commands": [
    { "id": "do-thing", "title": "Do the thing", "shortcut": "Ctrl+Shift+Y" }
  ]
}
```

### Field reference

| Field | Required | Notes |
|---|---|---|
| `manifest_version` | Yes | Must be `1` |
| `id` | Yes | Reverse-DNS. Must match folder name. |
| `name` | Yes | Display name |
| `version` | Yes | Semver |
| `description` | No | Shown in the extensions panel |
| `author` | No | Display only |
| `homepage` | No | Display only |
| `icon` | No | Relative path. PNG or SVG. |
| `permissions` | No | Array of permission strings |
| `background.page` | No | HTML file that boots the extension |
| `content_scripts` | No | Array of content script specs |
| `ui.popup` | No | HTML file for a toolbar popup |
| `ui.panel` | No | HTML file for a side panel |
| `commands` | No | Named commands |

## Permissions

| Permission | Unlocks |
|---|---|
| `tabs.read` | `nova.tabs.query`, `nova.tabs.get`, `tabs.on*` events |
| `tabs.write` | `nova.tabs.create`, `nova.tabs.update`, `nova.tabs.remove` |
| `tabs.navigate` | `nova.tabs.navigate` |
| `storage.local` | `nova.storage.local.*` |
| `storage.sync` | Reserved |
| `messaging` | `nova.runtime.sendMessage`, `nova.runtime.onMessage` |
| `contentScripts` | `nova.contentScripts.register` and `execute` |
| `ui.popup` | Render a popup |
| `ui.panel` | Render a side panel |
| `notifications` | Native notifications |
| `webRequest` | Observe network requests |

Permissions are enforced twice: once in the frontend router and once in the Rust core. Both checks must pass.

## Background Page

The extension's background page is an HTML file loaded in a sandboxed iframe. It runs continuously while the extension is enabled. It must load the SDK before any of its own scripts:

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body>
<script src="nova-ext://__sdk__/nova-ext-sdk.js"></script>
<script src="background.js"></script>
</body>
</html>
```

Then in `background.js`:

```js
defineExtension("com.example.my-ext", function (nova) {
  console.log("Extension booted");

  nova.runtime.onMessage.addListener(function (msg, sender) {
    if (msg.type === "ping") return { type: "pong" };
  });

  nova.tabs.onUpdated.addListener(function (payload) {
    if (payload.changes.status === "complete") {
      console.log("Tab finished:", payload.tabId);
    }
  });
});
```

## SDK Reference

### `nova.tabs`

```ts
query(filter?: Partial<Tab>): Promise<Tab[]>
get(tabId: string): Promise<Tab | null>
create(url: string, active?: boolean): Promise<Tab>
update(tabId: string, changes: { url?: string; active?: boolean }): Promise<Tab>
remove(tabId: string): Promise<void>
navigate(tabId: string, url: string): Promise<Tab>

onCreated: EventEmitter<Tab>
onRemoved: EventEmitter<string>
onActivated: EventEmitter<string>
onUpdated: EventEmitter<{ tabId: string; changes: TabChangeInfo }>
```

### `nova.storage.local`

```ts
get<T = unknown>(key: string | string[]): Promise<Record<string, T>>
set(items: Record<string, unknown>): Promise<void>
remove(key: string | string[]): Promise<void>
clear(): Promise<void>
```

Storage is per-extension and persists across sessions.

### `nova.runtime`

```ts
sendMessage(message: RuntimeMessage, to?: { tabId?: string; frameId?: number }): Promise<unknown>
onMessage: EventEmitter<{ message: RuntimeMessage; sender: MessageSender }>
```

### `nova.contentScripts`

```ts
register(spec: ContentScriptSpec): Promise<void>
execute(tabId: string, code: string, frameId?: number): Promise<unknown>
```

### `nova.ui`

```ts
show(surface: "popup" | "panel"): Promise<void>
hide(surface: "popup" | "panel"): Promise<void>
setBadgeText(text: string): Promise<void>
setBadgeColor(color: string): Promise<void>
```

## Content Scripts

Content scripts are injected into matching pages. They run in the page's context and can access `window.nova` to send messages back to the extension's background page.

```js
// content.js
(function () {
  // Access the DOM
  const links = document.querySelectorAll("a");

  // Report back to the background page
  window.nova.runtime.sendMessage({
    type: "page-scanned",
    payload: { linkCount: links.length, url: location.href },
  });
})();
```

### URL match patterns

| Pattern | Matches |
|---|---|
| `*://*/*` | Every URL |
| `<all_urls>` | Every URL |
| `https://github.com/*` | Any github.com page |
| `https://*.github.com/*` | github.com and any subdomain |
| `https://example.com/path/*` | Any path under `/path/` |

`*` matches any sequence of characters. `?` matches a single character.

### `run_at`

- `document_idle` (default) — runs after DOMContentLoaded
- `document_end` — same as idle for now
- `document_start` — reserved, currently behaves like `document_end`

## Security

Extensions run in cross-origin sandboxed iframes. This means:

- They cannot access Nova's DOM
- They cannot read the content of browser tabs directly
- They cannot see each other's data
- They can only use the permissions declared in their manifest

Every IPC call is validated against the manifest. The Rust core rejects any command that isn't covered by a declared permission — even if the frontend check is bypassed.

## Examples

A minimal extension needs only three files.

**`manifest.json`**
```json
{
  "manifest_version": 1,
  "id": "com.example.minimal",
  "name": "Minimal",
  "version": "1.0.0",
  "permissions": ["messaging"],
  "background": { "page": "background.html" }
}
```

**`background.html`**
```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body>
<script src="nova-ext://__sdk__/nova-ext-sdk.js"></script>
<script>
  defineExtension("com.example.minimal", function (nova) {
    console.log("Minimal extension booted.");
  });
</script>
</body>
</html>
```

## Publishing

There is no central registry yet. To share an extension, publish it as a GitHub repository or a zip file. Users install it by dropping the folder into their extensions directory.

An npm package for the TypeScript SDK and a registry service are planned.