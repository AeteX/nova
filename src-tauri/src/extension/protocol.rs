use std::fs;
use std::path::PathBuf;
use tauri::http::{header, Request, Response, StatusCode};
use tauri::AppHandle;

use super::discovery::extensions_dir;

const SDK_BUNDLE: &str = include_str!("../../embedded/nova-ext-sdk.js");

pub fn handle_request(
    app: AppHandle,
    req: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let uri = req.uri().to_string();

    // Extract <id>/<path> from nova-ext://<id>/<path>
    // On Windows, Tauri rewrites to http://nova-ext.localhost/<id>/<path>
    let rest = uri
        .splitn(2, "nova-ext://")
        .nth(1)
        .or_else(|| uri.splitn(2, "nova-ext.localhost/").nth(1))
        .unwrap_or("");
    let mut parts = rest.splitn(2, '/');
    let id = parts.next().unwrap_or("");
    let rel = parts.next().unwrap_or("background.html");

    if id.is_empty() {
        return not_found("missing extension id");
    }

    // Serve the bundled SDK
    if id == "__sdk__" {
        if rel == "nova-ext-sdk.js" {
            return with_csp(SDK_BUNDLE.as_bytes().to_vec(), "application/javascript; charset=utf-8");
        }
        return not_found("unknown SDK file");
    }

    let root = match extensions_dir(&app) {
        Ok(p) => p,
        Err(e) => return not_found(&e),
    };
    let file_path: PathBuf = root.join(id).join(rel);

    // Path-traversal guard
    let canonical_root = match fs::canonicalize(&root) {
        Ok(p) => p,
        Err(e) => return not_found(&format!("root: {e}")),
    };
    let canonical_file = match fs::canonicalize(&file_path) {
        Ok(p) => p,
        Err(_) => return not_found("file not found"),
    };
    if !canonical_file.starts_with(&canonical_root) {
        return forbidden("path traversal detected");
    }

    let body = match fs::read(&canonical_file) {
        Ok(b) => b,
        Err(e) => return not_found(&format!("read: {e}")),
    };

    with_csp(body, guess_mime(&canonical_file))
}

fn with_csp(body: Vec<u8>, mime: &'static str) -> Response<Vec<u8>> {
    let csp = "default-src 'self' nova-ext: nova-ext.localhost; \
               script-src 'self' 'unsafe-inline' 'unsafe-eval' nova-ext: nova-ext.localhost; \
               style-src 'self' 'unsafe-inline' nova-ext: nova-ext.localhost; \
               img-src 'self' data: nova-ext: nova-ext.localhost; \
               connect-src 'self' nova-ext: nova-ext.localhost http://127.0.0.1:* http://localhost:*;";

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header("Content-Security-Policy", csp)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(body)
        .unwrap()
}

fn guess_mime(path: &PathBuf) -> &'static str {
    match path.extension().and_then(|s| s.to_str()).unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" => "application/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        _ => "application/octet-stream",
    }
}

fn not_found(msg: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .body(msg.as_bytes().to_vec())
        .unwrap()
}

fn forbidden(msg: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::FORBIDDEN)
        .body(msg.as_bytes().to_vec())
        .unwrap()
}