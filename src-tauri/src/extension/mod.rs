pub mod commands;
pub mod discovery;
pub mod injection;
pub mod manifest;
pub mod permissions;
pub mod protocol;

// The `#[tauri::command]` macro emits a hidden `__cmd__<name>` helper
// next to each command. `generate_handler![]` needs those helpers to be
// reachable via the same path as the command itself, so re-export them
// here. Without this, `extension::extensions_list` resolves for direct
// calls but `extension::__cmd__extensions_list` does not.
pub use commands::*;