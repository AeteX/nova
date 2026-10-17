#![cfg(windows)]

use adblock::engine::Engine;
use adblock::request::Request;
use parking_lot::Mutex;
use std::sync::Arc;
use tauri::Webview;
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2,
    ICoreWebView2_2,
    ICoreWebView2_22,
    ICoreWebView2Environment,
    ICoreWebView2WebResourceRequestedEventArgs,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FONT,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_IMAGE,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_MEDIA,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_SCRIPT,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_STYLESHEET,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_XML_HTTP_REQUEST,
    COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL,
};
use webview2_com::take_pwstr;
use webview2_com::WebResourceRequestedEventHandler;
use windows::core::{Interface, HSTRING, PWSTR};

pub struct HandlerResources {
    pub engine: Arc<Mutex<Engine>>,
    pub enabled: Arc<Mutex<bool>>,
}

fn map_context(ctx: i32) -> &'static str {
    match ctx {
        x if x == COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT.0 => "document",
        x if x == COREWEBVIEW2_WEB_RESOURCE_CONTEXT_STYLESHEET.0 => "stylesheet",
        x if x == COREWEBVIEW2_WEB_RESOURCE_CONTEXT_IMAGE.0 => "image",
        x if x == COREWEBVIEW2_WEB_RESOURCE_CONTEXT_MEDIA.0 => "media",
        x if x == COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FONT.0 => "font",
        x if x == COREWEBVIEW2_WEB_RESOURCE_CONTEXT_SCRIPT.0 => "script",
        x if x == COREWEBVIEW2_WEB_RESOURCE_CONTEXT_XML_HTTP_REQUEST.0 => "xmlhttprequest",
        _ => "other",
    }
}

pub fn attach(webview: &Webview, resources: HandlerResources) -> Result<(), String> {
    webview
        .with_webview(move |platform_webview| unsafe {
            let controller = platform_webview.controller();
            let core = match controller.CoreWebView2() {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("[adblock] CoreWebView2 unavailable: {e}");
                    return;
                }
            };

            // ICoreWebView2_22 exposes
            // AddWebResourceRequestedFilterWithRequestSourceKinds, which is
            // the only overload that reliably intercepts child webviews
            // and out-of-process iframes.
            let core22: ICoreWebView2_22 = match core.cast() {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("[adblock] ICoreWebView2_22 cast failed: {e}");
                    eprintln!("[adblock] update WebView2 Runtime to a recent version");
                    return;
                }
            };

            let core2: ICoreWebView2_2 = match core.cast() {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("[adblock] ICoreWebView2_2 cast failed: {e}");
                    return;
                }
            };
            let env: ICoreWebView2Environment = match core2.Environment() {
                Ok(e) => e,
                Err(e) => {
                    eprintln!("[adblock] Environment() failed: {e}");
                    return;
                }
            };

            let core_for_handler: ICoreWebView2 = match core.cast() {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("[adblock] core recast failed: {e}");
                    return;
                }
            };

            // Wildcard URI + ALL resource contexts + ALL source kinds.
            // The source-kinds argument is what makes this work for
            // child webviews and sandboxed iframes.
            let filter = HSTRING::from("*");
            if let Err(e) = core22.AddWebResourceRequestedFilterWithRequestSourceKinds(
                &filter,
                COREWEBVIEW2_WEB_RESOURCE_CONTEXT(0), // overridden below
                COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL,
            ) {
                eprintln!("[adblock] AddWebResourceRequestedFilterWithRequestSourceKinds failed: {e}");
                return;
            }

            let engine = resources.engine.clone();
            let enabled = resources.enabled.clone();
            let env_for_handler = env.clone();

            let handler = WebResourceRequestedEventHandler::create(Box::new(
                move |_sender, args| {
                    let result =
                        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                            process_request(
                                &engine,
                                &enabled,
                                args.as_ref(),
                                &env_for_handler,
                                &core_for_handler,
                            );
                        }));
                    if result.is_err() {
                        eprintln!("[adblock] request handler panicked; allowing");
                    }
                    Ok(())
                },
            ));

            let mut token: i64 = 0;
            if let Err(e) = core22.add_WebResourceRequested(&handler, &mut token) {
                eprintln!("[adblock] add_WebResourceRequested failed: {e}");
            } else {
                eprintln!("[adblock] handler attached on child webview (token {token})");
            }
        })
        .map_err(|e| e.to_string())
}

fn process_request(
    engine: &Arc<Mutex<Engine>>,
    enabled: &Arc<Mutex<bool>>,
    args: Option<&ICoreWebView2WebResourceRequestedEventArgs>,
    env: &ICoreWebView2Environment,
    core: &ICoreWebView2,
) {
    let args = match args {
        Some(a) => a,
        None => return,
    };

    if !*enabled.lock() {
        return;
    }

    let request = match unsafe { args.Request() } {
        Ok(r) => r,
        Err(_) => return,
    };

    let mut uri_ptr = PWSTR::null();
    if unsafe { request.Uri(&mut uri_ptr) }.is_err() {
        return;
    }
    let uri = take_pwstr(uri_ptr);

    if !uri.starts_with("http://") && !uri.starts_with("https://") {
        return;
    }

    let source_url = {
        let mut src_ptr = PWSTR::null();
        match unsafe { core.Source(&mut src_ptr) } {
            Ok(_) => take_pwstr(src_ptr),
            Err(_) => String::new(),
        }
    };

    let request_type = {
        let mut ctx = COREWEBVIEW2_WEB_RESOURCE_CONTEXT(0);
        match unsafe { args.ResourceContext(&mut ctx) } {
            Ok(_) => map_context(ctx.0),
            Err(_) => "other",
        }
    };

    let blocked = {
        let engine = engine.lock();
        let req = match Request::new(&uri, &source_url, request_type, "GET") {
            Ok(r) => r,
            Err(_) => return,
        };
        let eval = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            engine.check_network_request(&req)
        }));
        match eval {
            Ok(result) => {
                if result.important {
                    true
                } else {
                    result.filter.is_some() && result.exception.is_none()
                }
            }
            Err(_) => {
                eprintln!("[adblock] engine panicked on {uri}; allowing");
                false
            }
        }
    };

    if !blocked {
        return;
    }

    // ReasonPhrase must be non-empty or the request stays pending forever.
    // See WebView2Feedback#568.
    let headers = HSTRING::from("Content-Type: text/plain");
    let reason = HSTRING::from("Blocked");
    if let Ok(response) =
        unsafe { env.CreateWebResourceResponse(None, 200, &reason, &headers) }
    {
        let _ = unsafe { args.SetResponse(&response) };
    }
}