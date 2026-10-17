use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const POPOVER_LABEL: &str = "downloads-popover";
pub const POPOVER_WIDTH: f64 = 320.0;
pub const POPOVER_HEIGHT: f64 = 360.0;

#[tauri::command]
pub async fn toggle_downloads_popover(
    app: AppHandle,
    x: f64,
    y: f64,
) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(POPOVER_LABEL) {
        let visible = win.is_visible().unwrap_or(false);
        if visible {
            win.hide().map_err(|e| e.to_string())?;
            let _ = app.emit("downloads-popover-closed", ());
            return Ok(());
        }
        win.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }))
            .map_err(|e| e.to_string())?;
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        let _ = app.emit("downloads-popover-opened", ());
        return Ok(());
    }

    let win = WebviewWindowBuilder::new(
        &app,
        POPOVER_LABEL,
        WebviewUrl::App("index.html?nova-window=downloads".into()),
    )
    .title("Downloads")
    .inner_size(POPOVER_WIDTH, POPOVER_HEIGHT)
    .position(x, y)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .shadow(false)
    .focused(true)
    .visible(false)
    .build()
    .map_err(|e| e.to_string())?;

    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?;
    let _ = app.emit("downloads-popover-opened", ());

    Ok(())
}

#[tauri::command]
pub async fn hide_downloads_popover(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(POPOVER_LABEL) {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
            let _ = app.emit("downloads-popover-closed", ());
        }
    }
    Ok(())
}

/// Hide the popover and ask the main window to open nova://downloads.
#[tauri::command]
pub async fn open_downloads_page(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(POPOVER_LABEL) {
        let _ = win.hide();
    }
    let _ = app.emit("downloads-popover-closed", ());
    let _ = app.emit("browser://open-tab", json!({ "url": "nova://downloads" }));
    Ok(())
}