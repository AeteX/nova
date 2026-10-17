use std::fs;
use tauri::AppHandle;

use super::discovery::extensions_dir;

/// Returns the concatenated JS of every content script whose `matches`
/// pattern matches the given URL, in extension install order.
pub fn build_init_script_for_url(
    app: &AppHandle,
    url: &str,
) -> Result<Option<String>, String> {
    let root = extensions_dir(app)?;
    let mut scripts = String::new();

    let extensions = super::discovery::scan(app)?;
    for ext in extensions.iter().filter(|e| e.enabled) {
        for spec in &ext.manifest.content_scripts {
            if spec.matches.iter().any(|m| url_matches(m, url)) {
                for rel in &spec.js {
                    let path = root.join(&ext.manifest.id).join(rel);
                    if let Ok(code) = fs::read_to_string(&path) {
                        scripts.push_str(&format!(
                            "\n;/* {} - {} */\n{}\n",
                            ext.manifest.id, rel, code
                        ));
                    }
                }
            }
        }
    }

    if scripts.is_empty() {
        Ok(None)
    } else {
        Ok(Some(scripts))
    }
}

/// Glob matcher for URL patterns. Supports `*` (any sequence) and `?`
/// (any single char). `*://*/*` and `<all_urls>` match everything.
fn url_matches(pattern: &str, url: &str) -> bool {
    if pattern == "<all_urls>" || pattern == "*" || pattern == "*://*/*" {
        return true;
    }
    let p: Vec<char> = pattern.chars().collect();
    let t: Vec<char> = url.chars().collect();
    glob(&p, &t)
}

fn glob(p: &[char], t: &[char]) -> bool {
    if p.is_empty() {
        return t.is_empty();
    }
    if p[0] == '*' {
        for i in 0..=t.len() {
            if glob(&p[1..], &t[i..]) {
                return true;
            }
        }
        return false;
    }
    if t.is_empty() {
        return false;
    }
    if p[0] == '?' || p[0] == t[0] {
        return glob(&p[1..], &t[1..]);
    }
    false
}