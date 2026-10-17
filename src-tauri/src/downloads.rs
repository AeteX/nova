use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DownloadStatus {
    Pending,
    Downloading,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadEntry {
    pub id: String,
    pub url: String,
    pub source_page_url: Option<String>,
    pub filename: String,
    pub path: Option<String>,
    pub total_bytes: Option<u64>,
    pub downloaded_bytes: u64,
    pub status: DownloadStatus,
    pub error: Option<String>,
}

pub struct DownloadState {
    entries: Mutex<HashMap<String, DownloadEntry>>,
    controls: Mutex<HashMap<String, Arc<Mutex<Control>>>>,
}

#[derive(Default)]
struct Control {
    paused: bool,
    cancelled: bool,
}

impl DownloadState {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            controls: Mutex::new(HashMap::new()),
        }
    }
}

fn default_download_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .download_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
}

fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c => c,
        })
        .collect();
    if cleaned.trim().is_empty() {
        "download".to_string()
    } else {
        cleaned
    }
}

fn filename_from_url(url: &str, content_disposition: Option<&str>) -> String {
    if let Some(cd) = content_disposition {
        for token in cd.split(';') {
            let token = token.trim();
            if let Some(v) = token.strip_prefix("filename=") {
                let v = v.trim_matches('"').trim_matches('\'');
                if !v.is_empty() {
                    return sanitize_filename(v);
                }
            }
        }
    }
    let without_query = url.split('?').next().unwrap_or(url);
    let last = without_query.rsplit('/').next().unwrap_or("download");
    sanitize_filename(last)
}

fn unique_path(dir: &PathBuf, filename: &str) -> PathBuf {
    let candidate = dir.join(filename);
    if !candidate.exists() {
        return candidate;
    }
    let path = std::path::Path::new(filename);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("download");
    let ext = path.extension().and_then(|s| s.to_str());
    for i in 1..10000 {
        let name = match ext {
            Some(e) => format!("{stem} ({i}).{e}"),
            None => format!("{stem} ({i})"),
        };
        let candidate = dir.join(name);
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(format!("{stem} (copy)"))
}

#[tauri::command]
pub async fn start_download(
    app: AppHandle,
    url: String,
    suggested_filename: Option<String>,
    source_page_url: Option<String>,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let state = app.state::<DownloadState>();

    let provisional = suggested_filename
        .clone()
        .map(|s| sanitize_filename(&s))
        .unwrap_or_else(|| filename_from_url(&url, None));

    let entry = DownloadEntry {
        id: id.clone(),
        url: url.clone(),
        source_page_url: source_page_url.clone(),
        filename: provisional,
        path: None,
        total_bytes: None,
        downloaded_bytes: 0,
        status: DownloadStatus::Pending,
        error: None,
    };

    {
        let mut entries = state.entries.lock().await;
        entries.insert(id.clone(), entry.clone());
    }
    let _ = app.emit("download://updated", &entry);

    let control = Arc::new(Mutex::new(Control::default()));
    {
        let mut controls = state.controls.lock().await;
        controls.insert(id.clone(), control.clone());
    }

    let app_clone = app.clone();
    let id_clone = id.clone();
    let url_clone = url.clone();

    tauri::async_runtime::spawn(async move {
        let result = run_download(
            app_clone.clone(),
            id_clone.clone(),
            url_clone,
            control.clone(),
        )
        .await;
        if let Err(e) = result {
            let state = app_clone.state::<DownloadState>();
            let mut entries = state.entries.lock().await;
            if let Some(entry) = entries.get_mut(&id_clone) {
                let was_cancelled = entry.status == DownloadStatus::Cancelled;
                if !was_cancelled {
                    entry.status = DownloadStatus::Failed;
                    entry.error = Some(e);
                }
                let _ = app_clone.emit("download://updated", entry.clone());
            }
        }
        let state = app_clone.state::<DownloadState>();
        let mut controls = state.controls.lock().await;
        controls.remove(&id_clone);
    });

    Ok(id)
}

async fn run_download(
    app: AppHandle,
    id: String,
    url: String,
    control: Arc<Mutex<Control>>,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("Nova/0.1")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    let total = response.content_length();
    let content_disposition = response
        .headers()
        .get(reqwest::header::CONTENT_DISPOSITION)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let filename = filename_from_url(&url, content_disposition.as_deref());
    let dir = default_download_dir(&app);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| e.to_string())?;
    let path = unique_path(&dir, &filename);

    {
        let state = app.state::<DownloadState>();
        let mut entries = state.entries.lock().await;
        if let Some(entry) = entries.get_mut(&id) {
            entry.filename = filename.clone();
            entry.path = Some(path.to_string_lossy().into_owned());
            entry.total_bytes = total;
            entry.status = DownloadStatus::Downloading;
            let _ = app.emit("download://updated", entry.clone());
        }
    }

    let mut file = File::create(&path).await.map_err(|e| e.to_string())?;
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_emit: u64 = 0;

    while let Some(chunk) = stream.next().await {
        {
            let c = control.lock().await;
            if c.cancelled {
                drop(c);
                let _ = tokio::fs::remove_file(&path).await;
                let state = app.state::<DownloadState>();
                let mut entries = state.entries.lock().await;
                if let Some(entry) = entries.get_mut(&id) {
                    entry.status = DownloadStatus::Cancelled;
                    let _ = app.emit("download://updated", entry.clone());
                }
                return Ok(());
            }
        }
        loop {
            let is_paused = {
                let c = control.lock().await;
                c.paused
            };
            if !is_paused {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            let c = control.lock().await;
            if c.cancelled {
                drop(c);
                let _ = tokio::fs::remove_file(&path).await;
                let state = app.state::<DownloadState>();
                let mut entries = state.entries.lock().await;
                if let Some(entry) = entries.get_mut(&id) {
                    entry.status = DownloadStatus::Cancelled;
                    let _ = app.emit("download://updated", entry.clone());
                }
                return Ok(());
            }
        }

        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;

        if downloaded - last_emit >= 64 * 1024 {
            last_emit = downloaded;
            let state = app.state::<DownloadState>();
            let mut entries = state.entries.lock().await;
            if let Some(entry) = entries.get_mut(&id) {
                entry.downloaded_bytes = downloaded;
                let _ = app.emit("download://updated", entry.clone());
            }
        }
    }

    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);

    {
        let state = app.state::<DownloadState>();
        let mut entries = state.entries.lock().await;
        if let Some(entry) = entries.get_mut(&id) {
            entry.downloaded_bytes = downloaded;
            entry.status = DownloadStatus::Completed;
            if entry.total_bytes.is_none() {
                entry.total_bytes = Some(downloaded);
            }
            let _ = app.emit("download://updated", entry.clone());
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn pause_download(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<DownloadState>();
    let controls = state.controls.lock().await;
    let control = controls.get(&id).ok_or("download not active")?.clone();
    drop(controls);
    control.lock().await.paused = true;

    let mut entries = state.entries.lock().await;
    if let Some(entry) = entries.get_mut(&id) {
        entry.status = DownloadStatus::Paused;
        let _ = app.emit("download://updated", entry.clone());
    }
    Ok(())
}

#[tauri::command]
pub async fn resume_download(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<DownloadState>();
    let controls = state.controls.lock().await;
    let control = controls.get(&id).ok_or("download not active")?.clone();
    drop(controls);
    control.lock().await.paused = false;

    let mut entries = state.entries.lock().await;
    if let Some(entry) = entries.get_mut(&id) {
        entry.status = DownloadStatus::Downloading;
        let _ = app.emit("download://updated", entry.clone());
    }
    Ok(())
}

#[tauri::command]
pub async fn cancel_download(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<DownloadState>();
    let controls = state.controls.lock().await;
    if let Some(control) = controls.get(&id) {
        control.lock().await.cancelled = true;
    }
    Ok(())
}

#[tauri::command]
pub async fn list_downloads(app: AppHandle) -> Result<Vec<DownloadEntry>, String> {
    let state = app.state::<DownloadState>();
    let entries = state.entries.lock().await;
    let mut list: Vec<DownloadEntry> = entries.values().cloned().collect();
    list.sort_by(|a, b| b.id.cmp(&a.id));
    Ok(list)
}

#[tauri::command]
pub async fn clear_finished_downloads(app: AppHandle) -> Result<(), String> {
    let state = app.state::<DownloadState>();
    let mut entries = state.entries.lock().await;
    entries.retain(|_, e| {
        matches!(
            e.status,
            DownloadStatus::Downloading | DownloadStatus::Paused | DownloadStatus::Pending
        )
    });
    Ok(())
}

#[tauri::command]
pub async fn open_download_folder(app: AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let parent = std::path::Path::new(&path)
        .parent()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or(path);
    app.opener()
        .open_path(parent, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_downloaded_file(app: AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}