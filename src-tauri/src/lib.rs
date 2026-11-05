mod adblocker;
mod downloads;
mod extension;
mod injection;
mod popover;

#[cfg(windows)]
mod adblocker_windows;
#[cfg(target_os = "macos")]
mod adblocker_macos;

use serde_json::json;
use tauri::webview::PageLoadEvent;
use tauri::{Emitter, Manager, WebviewUrl};

#[tauri::command]
fn reload_webview(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Webview '{label}' not found."))?;
    webview
        .reload()
        .map_err(|e| format!("Failed to reload: {e}"))
}

#[tauri::command]
fn ext_build_init_script(
    app: tauri::AppHandle,
    url: String,
) -> Result<Option<String>, String> {
    extension::injection::build_init_script_for_url(&app, &url)
}

#[tauri::command]
fn open_new_tab(app: tauri::AppHandle, url: String) -> Result<(), String> {
    app.emit("browser://open-tab", json!({ "url": url }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn inject_js(app: tauri::AppHandle, label: String, js: String) -> Result<(), String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Webview '{label}' not found."))?;
    webview.eval(&js).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_context_menu_script() -> String {
    injection::CONTEXT_MENU_SCRIPT.to_string()
}

#[tauri::command]
fn set_webview_zoom(app: tauri::AppHandle, label: String, zoom: f64) -> Result<(), String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Webview '{label}' not found."))?;
    webview.set_zoom(zoom).map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_tab_webview(
    app: tauri::AppHandle,
    label: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    zoom: f64,
) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    if let Some(existing) = app.get_webview(&label) {
        let _ = existing.close();
    }

    let parsed: tauri::Url = url.parse().map_err(|e| format!("invalid url: {e}"))?;

    let app_for_nav = app.clone();
    let label_for_zoom = label.clone();

    let builder =
        tauri::webview::WebviewBuilder::new(&label, WebviewUrl::External(parsed))
            .initialization_script(injection::NAVIGATION_INIT_SCRIPT)
            .on_navigation(move |url| {
                if url.host_str() != Some("nova-action.local") {
                    return true;
                }

                let path = url.path().to_string();
                let mut target_url = String::new();
                let mut suggested = String::new();
                let mut action = String::new();
                let mut payload = String::new();
                let mut source = String::new();

                for (k, v) in url.query_pairs() {
                    match k.as_ref() {
                        "url" => target_url = v.into_owned(),
                        "filename" => suggested = v.into_owned(),
                        "action" => action = v.into_owned(),
                        "payload" => payload = v.into_owned(),
                        "source" => source = v.into_owned(),
                        _ => {}
                    }
                }

                match path.as_str() {
                    "/open-tab" => {
                        if !target_url.is_empty() {
                            let _ = app_for_nav.emit(
                                "browser://open-tab",
                                json!({ "url": target_url }),
                            );
                        }
                    }
                    "/download" => {
                        if !target_url.is_empty() {
                            let _ = app_for_nav.emit(
                                "browser://download",
                                json!({
                                    "url": target_url,
                                    "filename": if suggested.is_empty() {
                                        serde_json::Value::Null
                                    } else {
                                        serde_json::Value::String(suggested)
                                    },
                                    "source_page_url": if source.is_empty() {
                                        serde_json::Value::Null
                                    } else {
                                        serde_json::Value::String(source)
                                    },
                                }),
                            );
                        }
                    }
                    "/context-action" => {
                        if !action.is_empty() {
                            let _ = app_for_nav.emit(
                                "browser://context-action",
                                json!({
                                    "action": action,
                                    "payload": if payload.is_empty() {
                                        serde_json::Value::Null
                                    } else {
                                        serde_json::Value::String(payload)
                                    },
                                }),
                            );
                        }
                    }
                    "/zoom" => {
                        if !action.is_empty() {
                            let _ = app_for_nav.emit(
                                "browser://zoom",
                                json!({
                                    "label": label_for_zoom,
                                    "action": action,
                                }),
                            );
                        }
                    }
                    _ => {}
                }
                false
            })
            .on_download(|webview, event| {
                if let tauri::webview::DownloadEvent::Requested { url, destination } = event
                {
                    let app = webview.app_handle().clone();
                    let url_str = url.to_string();
                    let dest = destination.to_string_lossy().into_owned();
                    let _ = app.emit(
                        "browser://download",
                        json!({
                            "url": url_str,
                            "filename": std::path::Path::new(&dest)
                                .file_name()
                                .and_then(|s| s.to_str())
                                .map(|s| s.to_string()),
                            "source_page_url": serde_json::Value::Null,
                        }),
                    );
                    return false;
                }
                true
            });

    // ── Changed: Use Logical coordinates ───────────────────
    let position = tauri::Position::Logical(tauri::LogicalPosition { x, y });
    let size = tauri::Size::Logical(tauri::LogicalSize {
        width: width.max(1.0),
        height: height.max(1.0),
    });

    window
        .add_child(builder, position, size)
        .map_err(|e| format!("failed to create webview: {e}"))?;

    if (zoom - 1.0).abs() > 0.001 {
        if let Some(wv) = app.get_webview(&label) {
            let _ = wv.set_zoom(zoom);
        }
    }

    let label_clone = label.clone();
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(80)).await;
        let state = app_clone.state::<adblocker::AdBlockerState>();

        #[cfg(windows)]
        {
            if let Some(wv) = app_clone.get_webview(&label_clone) {
                let resources = adblocker_windows::HandlerResources {
                    engine: state.engine.clone(),
                    enabled: state.enabled.clone(),
                };
                if let Err(e) = adblocker_windows::attach(&wv, resources) {
                    eprintln!("[adblock] attach failed for {label_clone}: {e}");
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            if let Some(wv) = app_clone.get_webview(&label_clone) {
                if let Err(e) = adblocker_macos::attach(&wv) {
                    eprintln!("[adblock-mac] attach failed for {label_clone}: {e}");
                }
            }
        }

        #[cfg(not(any(windows, target_os = "macos")))]
        {
            let _ = (app_clone, label_clone, state);
        }
    });

    Ok(())
}

#[tauri::command]
async fn close_tab_webview(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Some(wv) = app.get_webview(&label) {
        wv.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(downloads::DownloadState::new())
        .manage(adblocker::AdBlockerState::new())
        .register_uri_scheme_protocol("nova-ext", |ctx, req| {
            let app = ctx.app_handle().clone();
            extension::protocol::handle_request(app, req)
        })
        .on_page_load(|webview, payload| {
            let label = webview.label().to_string();
            if !label.starts_with("tab-") {
                return;
            }
            let event = match payload.event() {
                PageLoadEvent::Started => "started",
                PageLoadEvent::Finished => "finished",
            };
            let _ = webview.app_handle().emit(
                "browser://load",
                json!({
                    "label": label,
                    "event": event,
                    "url": payload.url().to_string(),
                }),
            );
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let json = include_str!("../filters/webkit_rules.json");
                adblocker_macos::compile(json);
                let _ = app;
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = app;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            reload_webview,
            ext_build_init_script,
            open_new_tab,
            inject_js,
            get_context_menu_script,
            set_webview_zoom,
            create_tab_webview,
            close_tab_webview,
            popover::toggle_downloads_popover,
            popover::hide_downloads_popover,
            popover::open_downloads_page,
            adblocker::get_adblocker_settings,
            adblocker::set_adblocker_enabled,
            adblocker::load_bundled_easylist,
            adblocker::diagnose_url,
            downloads::start_download,
            downloads::pause_download,
            downloads::resume_download,
            downloads::cancel_download,
            downloads::list_downloads,
            downloads::clear_finished_downloads,
            downloads::open_download_folder,
            downloads::open_downloaded_file,
            extension::extensions_list,
            extension::extensions_install,
            extension::extensions_uninstall,
            extension::extensions_read_file,
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}