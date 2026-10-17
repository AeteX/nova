# Filter data

## `easylist.txt`

Provided by the [EasyList project](https://easylist.to/). Licensed under
**CC BY-SA 3.0** (and alternatively GPL-3.0). See https://easylist.to/pages/licence.html

This file is bundled into the Nova binary at compile time via
`include_str!` in `src/adblocker.rs` and is parsed by `adblock-rust` at
runtime.

The MIT license that covers Nova's source code does **not** apply to this
file. It remains under its original license, and any redistribution of
Nova must preserve this attribution.

## `webkit_rules.json`

WebKit Content Rule List JSON, used by the macOS ad blocker path via
`WKContentRuleListStore`. These rules are derived from EasyList and remain
under the same CC BY-SA 3.0 license as the source list.