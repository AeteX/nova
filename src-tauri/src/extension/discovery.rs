use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use super::manifest::{LoadedExtension, Manifest};

/// Return the OS-specific extensions directory.
pub fn extensions_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?;
    Ok(base.join("extensions"))
}

pub fn ensure_extensions_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = extensions_dir(app)?;
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Cannot create extensions dir: {e}"))?;
    }
    Ok(dir)
}

pub fn scan(app: &AppHandle) -> Result<Vec<LoadedExtension>, String> {
    let dir = ensure_extensions_dir(app)?;
    let mut out = Vec::new();

    let entries = fs::read_dir(&dir)
        .map_err(|e| format!("Cannot read extensions dir: {e}"))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        match load_one(&path) {
            Ok(ext) => out.push(ext),
            Err(e) => eprintln!("[extensions] Skipping {}: {e}", path.display()),
        }
    }

    Ok(out)
}

fn load_one(dir: &Path) -> Result<LoadedExtension, String> {
    let manifest_path = dir.join("manifest.json");
    if !manifest_path.exists() {
        return Err("missing manifest.json".into());
    }

    let raw = fs::read_to_string(&manifest_path)
        .map_err(|e| format!("cannot read manifest: {e}"))?;
    let manifest: Manifest =
        serde_json::from_str(&raw).map_err(|e| format!("invalid manifest: {e}"))?;

    super::permissions::validate_declared(&manifest.permissions)?;

    let folder = dir
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("invalid folder name")?;
    if folder != manifest.id {
        return Err(format!(
            "manifest id '{}' does not match folder '{}'",
            manifest.id, folder
        ));
    }

    Ok(LoadedExtension {
        manifest,
        root_path: dir.to_string_lossy().into_owned(),
        enabled: true,
    })
}