use adblock::engine::Engine;
use adblock::lists::{FilterSet, ParseOptions};
use adblock::request::Request;
use parking_lot::Mutex;
use serde::Serialize;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::Arc;

#[derive(Debug, Serialize, Clone)]
pub struct AdBlockerSettings {
    pub enabled: bool,
    pub rule_count: usize,
}

pub struct AdBlockerState {
    pub engine: Arc<Mutex<Engine>>,
    pub enabled: Arc<Mutex<bool>>,
    pub rule_count: Arc<Mutex<usize>>,
}

impl AdBlockerState {
    pub fn new() -> Self {
        Self {
            engine: Arc::new(Mutex::new(Engine::default())),
            enabled: Arc::new(Mutex::new(false)),
            rule_count: Arc::new(Mutex::new(0)),
        }
    }

    pub fn load_rules(&self, rules: &[String]) {
        let mut filter_set = FilterSet::new(true);
        let combined: String = rules.join("\n");
        filter_set.add_filter_list(combined, ParseOptions::default());
        let new_engine = Engine::new_with_filter_set(filter_set);
        *self.engine.lock() = new_engine;
        *self.rule_count.lock() = rules.len();
    }

    #[allow(dead_code)]
    pub fn is_blocked(&self, url: &str, source_url: &str) -> bool {
        if !*self.enabled.lock() {
            return false;
        }
        let engine = self.engine.lock();
        match Request::new(url, source_url, "other", "GET") {
            Ok(req) => {
                let result = engine.check_network_request(&req);
                if result.important {
                    return true;
                }
                result.filter.is_some() && result.exception.is_none()
            }
            Err(_) => false,
        }
    }
}

#[tauri::command]
pub fn get_adblocker_settings(state: tauri::State<AdBlockerState>) -> AdBlockerSettings {
    AdBlockerSettings {
        enabled: *state.enabled.lock(),
        rule_count: *state.rule_count.lock(),
    }
}

#[tauri::command]
pub fn set_adblocker_enabled(
    state: tauri::State<AdBlockerState>,
    enabled: bool,
) -> Result<(), String> {
    *state.enabled.lock() = enabled;
    Ok(())
}

#[tauri::command]
pub fn load_bundled_easylist(state: tauri::State<AdBlockerState>) -> Result<usize, String> {
    let raw = include_str!("../filters/easylist.txt");
    let rules: Vec<String> = raw
        .lines()
        .filter(|l| {
            let l = l.trim();
            !l.is_empty() && !l.starts_with('!') && !l.starts_with('[')
        })
        .map(|s| s.to_string())
        .collect();
    let count = rules.len();
    state.load_rules(&rules);
    Ok(count)
}

#[derive(Serialize)]
pub struct DiagnoseResult {
    pub url: String,
    pub source_url: String,
    pub request_type: String,
    pub parse_error: Option<String>,
    pub has_filter: bool,
    pub has_exception: bool,
    pub important: bool,
    pub blocked: bool,
}

#[tauri::command]
pub fn diagnose_url(
    state: tauri::State<AdBlockerState>,
    url: String,
    source_url: String,
    request_type: String,
) -> DiagnoseResult {
    let engine_arc = state.engine.clone();

    let outcome = catch_unwind(AssertUnwindSafe(|| -> DiagnoseResult {
        let engine = engine_arc.lock();
        match Request::new(&url, &source_url, &request_type, "GET") {
            Ok(req) => {
                let result = engine.check_network_request(&req);
                let has_exception = result.exception.is_some();
                let important = result.important;
                let blocked = important || (result.filter.is_some() && !has_exception);
                DiagnoseResult {
                    url: url.clone(),
                    source_url: source_url.clone(),
                    request_type: request_type.clone(),
                    parse_error: None,
                    has_filter: result.filter.is_some(),
                    has_exception,
                    important,
                    blocked,
                }
            }
            Err(e) => DiagnoseResult {
                url: url.clone(),
                source_url: source_url.clone(),
                request_type: request_type.clone(),
                parse_error: Some(format!("{e:?}")),
                has_filter: false,
                has_exception: false,
                important: false,
                blocked: false,
            },
        }
    }));

    match outcome {
        Ok(res) => res,
        Err(payload) => {
            let msg = if let Some(s) = payload.downcast_ref::<&str>() {
                s.to_string()
            } else if let Some(s) = payload.downcast_ref::<String>() {
                s.clone()
            } else {
                "panic (unknown payload)".to_string()
            };
            DiagnoseResult {
                url,
                source_url,
                request_type,
                parse_error: Some(format!("panic: {msg}")),
                has_filter: false,
                has_exception: false,
                important: false,
                blocked: false,
            }
        }
    }
}