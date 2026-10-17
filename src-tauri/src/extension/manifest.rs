use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub manifest_version: u32,
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub background: Option<BackgroundSpec>,
    #[serde(default)]
    pub content_scripts: Vec<ContentScriptSpec>,
    #[serde(default)]
    pub ui: Option<UiSpec>,
    #[serde(default)]
    pub commands: Vec<CommandSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackgroundSpec {
    /// Path to an HTML file that boots the extension's background logic.
    /// The HTML file must load the SDK from
    /// `nova-ext://__sdk__/nova-ext-sdk.js` before any of its own scripts.
    pub page: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentScriptSpec {
    pub matches: Vec<String>,
    pub js: Vec<String>,
    #[serde(default = "default_run_at")]
    pub run_at: String,
}

fn default_run_at() -> String {
    "document_idle".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiSpec {
    #[serde(default)]
    pub popup: Option<String>,
    #[serde(default)]
    pub panel: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandSpec {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub shortcut: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LoadedExtension {
    pub manifest: Manifest,
    pub root_path: String,
    pub enabled: bool,
}