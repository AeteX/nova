use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub url: String,
    pub title: String,
    pub visited_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bookmark {
    pub id: String,
    pub url: String,
    pub title: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchEntry {
    pub query: String,
    pub searched_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionTab {
    pub id: String,
    pub url: String,
    pub title: String,
    pub history: Vec<String>,
    pub history_index: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Session {
    pub tabs: Vec<SessionTab>,
    pub active_tab_id: Option<String>,
}

#[derive(Default, Serialize, Deserialize)]
struct AllData {
    history: Vec<HistoryEntry>,
    bookmarks: Vec<Bookmark>,
    searches: Vec<SearchEntry>,
    session: Session,
}

pub struct StorageState {
    data: Mutex<AllData>,
    dir: PathBuf,
}

const MAX_HISTORY: usize = 5000;
const MAX_SEARCHES: usize = 500;
const HISTORY_DEDUPE_MS: u64 = 30000;

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

impl StorageState {
    pub fn load(dir: PathBuf) -> Self {
        let _ = fs::create_dir_all(&dir);

        let read = |name: &str| -> Option<String> {
            fs::read_to_string(dir.join(name)).ok()
        };

        let history = read("history.json")
            .and_then(|s| serde_json::from_str::<Vec<HistoryEntry>>(&s).ok())
            .unwrap_or_default();
        let bookmarks = read("bookmarks.json")
            .and_then(|s| serde_json::from_str::<Vec<Bookmark>>(&s).ok())
            .unwrap_or_default();
        let searches = read("searches.json")
            .and_then(|s| serde_json::from_str::<Vec<SearchEntry>>(&s).ok())
            .unwrap_or_default();
        let session = read("session.json")
            .and_then(|s| serde_json::from_str::<Session>(&s).ok())
            .unwrap_or_default();

        Self {
            data: Mutex::new(AllData {
                history,
                bookmarks,
                searches,
                session,
            }),
            dir,
        }
    }

    fn persist(&self) {
        let data = self.data.lock().unwrap();
        let _ = fs::write(
            self.dir.join("history.json"),
            serde_json::to_string(&data.history).unwrap_or_default(),
        );
        let _ = fs::write(
            self.dir.join("bookmarks.json"),
            serde_json::to_string(&data.bookmarks).unwrap_or_default(),
        );
        let _ = fs::write(
            self.dir.join("searches.json"),
            serde_json::to_string(&data.searches).unwrap_or_default(),
        );
        let _ = fs::write(
            self.dir.join("session.json"),
            serde_json::to_string(&data.session).unwrap_or_default(),
        );
    }
}

// ── History commands ─────────────────────────────────────

#[tauri::command]
pub fn history_record(
    state: tauri::State<StorageState>,
    url: String,
    title: String,
) -> Result<(), String> {
    let now = now_ms();
    let mut data = state.data.lock().unwrap();
    if let Some(last) = data.history.last() {
        if last.url == url && now - last.visited_at < HISTORY_DEDUPE_MS {
            return Ok(());
        }
    }
    data.history.retain(|e| e.url != url);
    data.history.push(HistoryEntry {
        url,
        title,
        visited_at: now,
    });
    if data.history.len() > MAX_HISTORY {
        let excess = data.history.len() - MAX_HISTORY;
        data.history.drain(0..excess);
    }
    drop(data);
    state.persist();
    Ok(())
}

#[tauri::command]
pub fn history_list(
    state: tauri::State<StorageState>,
    limit: Option<usize>,
) -> Vec<HistoryEntry> {
    let data = state.data.lock().unwrap();
    let mut out: Vec<_> = data.history.clone();
    out.reverse();
    if let Some(n) = limit {
        out.truncate(n);
    }
    out
}

#[tauri::command]
pub fn history_search(
    state: tauri::State<StorageState>,
    query: String,
    limit: Option<usize>,
) -> Vec<HistoryEntry> {
    let q = query.to_lowercase();
    let data = state.data.lock().unwrap();
    let mut out: Vec<_> = data
        .history
        .iter()
        .filter(|e| {
            e.url.to_lowercase().contains(&q) || e.title.to_lowercase().contains(&q)
        })
        .cloned()
        .collect();
    out.reverse();
    if let Some(n) = limit {
        out.truncate(n);
    }
    out
}

#[tauri::command]
pub fn history_delete(state: tauri::State<StorageState>, url: String) -> Result<(), String> {
    let mut data = state.data.lock().unwrap();
    data.history.retain(|e| e.url != url);
    drop(data);
    state.persist();
    Ok(())
}

#[tauri::command]
pub fn history_clear(state: tauri::State<StorageState>) -> Result<(), String> {
    state.data.lock().unwrap().history.clear();
    state.persist();
    Ok(())
}

// ── Bookmark commands ────────────────────────────────────

#[tauri::command]
pub fn bookmarks_list(state: tauri::State<StorageState>) -> Vec<Bookmark> {
    state.data.lock().unwrap().bookmarks.clone()
}

#[tauri::command]
pub fn bookmarks_add(
    state: tauri::State<StorageState>,
    url: String,
    title: String,
) -> Result<Bookmark, String> {
    let mut data = state.data.lock().unwrap();
    if data.bookmarks.iter().any(|x| x.url == url) {
        return Err("already bookmarked".into());
    }
    let entry = Bookmark {
        id: format!("bm-{}", now_ms()),
        url,
        title,
        created_at: now_ms(),
    };
    data.bookmarks.push(entry.clone());
    drop(data);
    state.persist();
    Ok(entry)
}

#[tauri::command]
pub fn bookmarks_remove(state: tauri::State<StorageState>, id: String) -> Result<(), String> {
    let mut data = state.data.lock().unwrap();
    data.bookmarks.retain(|x| x.id != id);
    drop(data);
    state.persist();
    Ok(())
}

#[tauri::command]
pub fn bookmarks_is_bookmarked(state: tauri::State<StorageState>, url: String) -> bool {
    state.data.lock().unwrap().bookmarks.iter().any(|x| x.url == url)
}

// ── Search history ───────────────────────────────────────

#[tauri::command]
pub fn search_history_record(
    state: tauri::State<StorageState>,
    query: String,
) -> Result<(), String> {
    let q = query.trim().to_string();
    if q.is_empty() {
        return Ok(());
    }
    let now = now_ms();
    let mut data = state.data.lock().unwrap();
    data.searches.retain(|e| e.query.to_lowercase() != q.to_lowercase());
    data.searches.push(SearchEntry {
        query: q,
        searched_at: now,
    });
    if data.searches.len() > MAX_SEARCHES {
        let excess = data.searches.len() - MAX_SEARCHES;
        data.searches.drain(0..excess);
    }
    drop(data);
    state.persist();
    Ok(())
}

#[tauri::command]
pub fn search_history_list(
    state: tauri::State<StorageState>,
    limit: Option<usize>,
) -> Vec<SearchEntry> {
    let data = state.data.lock().unwrap();
    let mut out: Vec<_> = data.searches.clone();
    out.reverse();
    if let Some(n) = limit {
        out.truncate(n);
    }
    out
}

#[tauri::command]
pub fn search_history_clear(state: tauri::State<StorageState>) -> Result<(), String> {
    state.data.lock().unwrap().searches.clear();
    state.persist();
    Ok(())
}

// ── Session ──────────────────────────────────────────────

#[tauri::command]
pub fn session_get(state: tauri::State<StorageState>) -> Session {
    state.data.lock().unwrap().session.clone()
}

#[tauri::command]
pub fn session_save(state: tauri::State<StorageState>, session: Session) -> Result<(), String> {
    state.data.lock().unwrap().session = session;
    state.persist();
    Ok(())
}