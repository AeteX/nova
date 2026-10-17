use std::collections::HashSet;

pub const KNOWN_PERMISSIONS: &[&str] = &[
    "tabs.read",
    "tabs.write",
    "tabs.navigate",
    "storage.local",
    "storage.sync",
    "messaging",
    "contentScripts",
    "ui.popup",
    "ui.panel",
    "notifications",
    "webRequest",
];

/// Map an IPC command name to the permission it requires.
///
/// Reserved for the Rust-side dispatch command that will enforce
/// permissions on every extension IPC call. The frontend router already
/// checks permissions via `src/extension-host/permissions.ts`; this is
/// the second layer that would run in Rust for defense in depth.
#[allow(dead_code)]
pub fn required_permission(command: &str) -> Option<&'static str> {
    match command {
        "tabs_query" | "tabs_get" => Some("tabs.read"),
        "tabs_create" | "tabs_update" | "tabs_remove" => Some("tabs.write"),
        "tabs_navigate" => Some("tabs.navigate"),
        "storage_get" | "storage_set" | "storage_remove" | "storage_clear" => {
            Some("storage.local")
        }
        "runtime_send_message" => Some("messaging"),
        "content_scripts_register" | "content_scripts_execute" => {
            Some("contentScripts")
        }
        "notify" => Some("notifications"),
        _ => None,
    }
}

/// Second-layer enforcement. Rejects a command if the extension's
/// declared permissions do not cover it.
///
/// Reserved for the same dispatch command as `required_permission`.
#[allow(dead_code)]
pub fn check(declared: &[String], command: &str) -> Result<(), String> {
    let required = match required_permission(command) {
        Some(p) => p,
        None => return Ok(()),
    };
    let set: HashSet<&str> = declared.iter().map(String::as_str).collect();
    if set.contains(required) {
        Ok(())
    } else {
        Err(format!(
            "extension is missing required permission '{required}' for '{command}'"
        ))
    }
}

pub fn validate_declared(declared: &[String]) -> Result<(), String> {
    let known: HashSet<&str> = KNOWN_PERMISSIONS.iter().copied().collect();
    for p in declared {
        if !known.contains(p.as_str()) {
            return Err(format!("unknown permission '{p}'"));
        }
    }
    Ok(())
}