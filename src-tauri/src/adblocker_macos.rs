#![cfg(target_os = "macos")]

use block2::RcBlock;
use objc2::rc::Retained;
use objc2_foundation::{NSError, NSString};
use objc2_web_kit::{WKContentRuleList, WKContentRuleListStore, WKWebView};
use std::sync::Mutex;
use tauri::WebviewWindow;

static COMPILED_LIST: Mutex<Option<Retained<WKContentRuleList>>> = Mutex::new(None);

/// Compile WebKit content blocker JSON into a rule list. Call once at
/// startup. The compiled list is cached on disk by WebKit itself, so
/// subsequent launches are near-instant.
pub fn compile(json: &str) {
    unsafe {
        let store = WKContentRuleListStore::defaultStore();
        let identifier = NSString::from_str("nova-adblock");
        let encoded = NSString::from_str(json);

        let callback = RcBlock::new(
            move |list: *mut WKContentRuleList, error: *mut NSError| {
                if !error.is_null() {
                    eprintln!("[adblock-mac] compile error: {:?}", error);
                    return;
                }
                if list.is_null() {
                    eprintln!("[adblock-mac] compile returned null");
                    return;
                }
                match Retained::retain(list) {
                    Some(retained) => {
                        *COMPILED_LIST.lock().unwrap() = Some(retained);
                        eprintln!("[adblock-mac] rule list compiled");
                    }
                    None => eprintln!("[adblock-mac] retain failed"),
                }
            },
        );

        store.compileContentRuleListForIdentifier_encodedContentRuleList_completionHandler(
            &identifier,
            &encoded,
            Some(&callback),
        );
    }
}

/// Attach the compiled list to a webview's user content controller.
pub fn attach(webview: &WebviewWindow) -> Result<(), String> {
    let guard = COMPILED_LIST.lock().unwrap();
    let rule_list = guard
        .as_ref()
        .ok_or_else(|| "rule list not yet compiled".to_string())?;

    // Clone the Retained so the closure owns a reference.
    let rule_list_clone = rule_list.clone();

    webview
        .with_webview(move |platform_webview| unsafe {
            let wk_ptr = platform_webview.inner();
            if wk_ptr.is_null() {
                eprintln!("[adblock-mac] null WKWebView pointer");
                return;
            }
            let wk = &*(wk_ptr as *const WKWebView);
            let config = wk.configuration();
            let controller = config.userContentController();
            controller.addContentRuleList(&rule_list_clone);
            eprintln!("[adblock-mac] rule list attached");
        })
        .map_err(|e| e.to_string())
}