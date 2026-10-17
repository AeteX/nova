use serde::Serialize;
use tauri::AppHandle;

use super::discovery::{ensure_extensions_dir, extensions_dir, scan};
use super::manifest::LoadedExtension;
use super::permissions;

#[derive(Serialize)]
pub struct ExtensionsInfo {
    pub dir: String,
    pub extensions: Vec<LoadedExtension>,
}

#[tauri::command]
pub fn extensions_list(app: AppHandle) -> Result<ExtensionsInfo, String> {
    let dir = ensure_extensions_dir(&app)?;
    let extensions = scan(&app)?;
    Ok(ExtensionsInfo {
        dir: dir.to_string_lossy().into_owned(),
        extensions,
    })
}

#[tauri::command]
pub fn extensions_install(
    app: AppHandle,
    source_path: String,
) -> Result<LoadedExtension, String> {
    let src = std::path::PathBuf::from(&source_path);
    if !src.is_dir() {
        return Err(format!("source path is not a directory: {source_path}"));
    }

    let manifest_path = src.join("manifest.json");
    if !manifest_path.exists() {
        return Err("source has no manifest.json".into());
    }

    let raw =
        std::fs::read_to_string(&manifest_path).map_err(|e| format!("read manifest: {e}"))?;
    let manifest: super::manifest::Manifest =
        serde_json::from_str(&raw).map_err(|e| format!("parse manifest: {e}"))?;

    permissions::validate_declared(&manifest.permissions)?;

    let dest = extensions_dir(&app)?.join(&manifest.id);
    if dest.exists() {
        return Err(format!(
            "extension '{}' is already installed at {}",
            manifest.id,
            dest.display()
        ));
    }

    copy_dir_recursive(&src, &dest).map_err(|e| format!("copy failed: {e}"))?;

    Ok(LoadedExtension {
        manifest,
        root_path: dest.to_string_lossy().into_owned(),
        enabled: true,
    })
}

#[tauri::command]
pub fn extensions_uninstall(app: AppHandle, id: String) -> Result<(), String> {
    let dir = extensions_dir(&app)?.join(&id);
    if !dir.exists() {
        return Err(format!("extension '{id}' not found"));
    }
    std::fs::remove_dir_all(&dir).map_err(|e| format!("remove failed: {e}"))
}

#[tauri::command]
pub fn extensions_read_file(
    app: AppHandle,
    id: String,
    rel_path: String,
) -> Result<String, String> {
    let root = extensions_dir(&app)?.join(&id);
    let file = root.join(&rel_path);
    let canonical_root = std::fs::canonicalize(&root).map_err(|e| format!("root: {e}"))?;
    let canonical_file = std::fs::canonicalize(&file).map_err(|e| format!("file: {e}"))?;
    if !canonical_file.starts_with(&canonical_root) {
        return Err("path traversal detected".into());
    }
    std::fs::read_to_string(&canonical_file).map_err(|e| format!("read: {e}"))
}

fn copy_dir_recursive(
    src: &std::path::Path,
    dst: &std::path::Path,
) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let target = dst.join(entry.file_name());
        if path.is_dir() {
            copy_dir_recursive(&path, &target)?;
        } else {
            std::fs::copy(&path, &target)?;
        }
    }
    Ok(())
}