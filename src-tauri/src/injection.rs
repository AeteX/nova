/// Base navigation script — always injected into every tab webview.
pub const NAVIGATION_INIT_SCRIPT: &str = r#"
(function () {
  if (window.__nova_nav_installed) return;
  window.__nova_nav_installed = true;

  function absolutize(href) {
    try { return new URL(href, document.baseURI).href; }
    catch (_) { return href; }
  }

  function requestOpenTab(url) {
    window.location.href = 'https://nova-action.local/open-tab?url=' + encodeURIComponent(absolutize(url));
  }

  function requestDownload(url, suggested) {
    var s = 'https://nova-action.local/download?url=' + encodeURIComponent(absolutize(url));
    if (suggested) s += '&filename=' + encodeURIComponent(suggested);
    s += '&source=' + encodeURIComponent(window.location.href);
    window.location.href = s;
  }

  function requestZoom(action) {
    window.location.href = 'https://nova-action.local/zoom?action=' + action;
  }

  var originalOpen = window.open;
  window.open = function (url, target, features) {
    if (url) {
      requestOpenTab(String(url));
      return null;
    }
    return originalOpen.apply(window, arguments);
  };

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented) return;
    var el = e.target;
    var anchor = el && el.closest ? el.closest('a[href]') : null;
    if (!anchor) return;
    var href = anchor.getAttribute('href') || '';
    if (!href || href.indexOf('javascript:') === 0 || href.charAt(0) === '#') return;

    if (anchor.hasAttribute('download')) {
      e.preventDefault();
      e.stopPropagation();
      requestDownload(anchor.href, anchor.getAttribute('download') || '');
      return;
    }

    var target = (anchor.getAttribute('target') || '').toLowerCase();
    var modifier = e.ctrlKey || e.metaKey || e.shiftKey;
    var isBlank = target === '_blank';
    if (!isBlank && !modifier) return;

    e.preventDefault();
    e.stopPropagation();
    requestOpenTab(anchor.href);
  }, true);

  document.addEventListener('auxclick', function (e) {
    if (e.button !== 1) return;
    var el = e.target;
    var anchor = el && el.closest ? el.closest('a[href]') : null;
    if (!anchor) return;
    var href = anchor.getAttribute('href') || '';
    if (!href || href.indexOf('javascript:') === 0 || href.charAt(0) === '#') return;
    e.preventDefault();
    e.stopPropagation();
    requestOpenTab(anchor.href);
  }, true);

  // ── Zoom controls ─────────────────────────────────────────
  var lastZoomAt = 0;

  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.altKey) return;
    var k = e.key;
    var action = null;
    if (k === '=' || k === '+') action = 'in';
    else if (k === '-' || k === '_') action = 'out';
    else if (k === '0') action = 'reset';
    if (action) {
      e.preventDefault();
      e.stopPropagation();
      requestZoom(action);
    }
  }, true);

  document.addEventListener('wheel', function (e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.deltaY === 0) return;
    e.preventDefault();
    e.stopPropagation();
    var now = Date.now();
    if (now - lastZoomAt < 80) return;
    lastZoomAt = now;
    requestZoom(e.deltaY < 0 ? 'in' : 'out');
  }, { passive: false, capture: true });
})();
"#;

/// Optional custom context menu script.
pub const CONTEXT_MENU_SCRIPT: &str = r#"
(function () {
  if (window.__nova_ctx_installed) return;
  window.__nova_ctx_installed = true;

  var menuEl = null;

  function hideMenu() {
    if (menuEl && menuEl.parentNode) menuEl.parentNode.removeChild(menuEl);
    menuEl = null;
  }

  function invoke(action, payload) {
    var url = 'https://nova-action.local/context-action?action=' + encodeURIComponent(action);
    if (payload) url += '&payload=' + encodeURIComponent(payload);
    window.location.href = url;
  }

  function makeItem(opts) {
    var btn = document.createElement('button');
    btn.type = 'button';
    var disabled = !!opts.disabled;
    btn.style.cssText = [
      'display:flex','align-items:center','gap:12px','width:100%',
      'padding:9px 12px','border:none','border-radius:8px',
      'background:transparent','color:#e8e8f0',
      'font-family:"Inter",system-ui,-apple-system,sans-serif',
      'font-size:13px','text-align:left','cursor:pointer',
      'white-space:nowrap','opacity:' + (disabled ? '0.3' : '1'),
      'pointer-events:' + (disabled ? 'none' : 'auto'),
      'transition:background 0.12s,color 0.12s'
    ].join(';');

    var iconEl = document.createElement('span');
    iconEl.textContent = opts.icon || '';
    iconEl.style.cssText = 'flex:0 0 16px;width:16px;text-align:center;color:#8888a8';
    btn.appendChild(iconEl);

    var labelEl = document.createElement('span');
    labelEl.textContent = opts.label;
    labelEl.style.cssText = 'flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis';
    btn.appendChild(labelEl);

    if (opts.shortcut) {
      var sEl = document.createElement('span');
      sEl.textContent = opts.shortcut;
      sEl.style.cssText = 'flex:0 0 auto;font-family:ui-monospace,monospace;font-size:10.5px;color:#8888a8;opacity:0.75';
      btn.appendChild(sEl);
    }

    btn.onmouseenter = function () {
      if (disabled) return;
      btn.style.background = 'linear-gradient(90deg,rgba(0,229,255,0.14),rgba(124,77,255,0.1))';
      btn.style.color = '#00e5ff';
    };
    btn.onmouseleave = function () {
      btn.style.background = 'transparent';
      btn.style.color = '#e8e8f0';
    };

    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      hideMenu();
      invoke(opts.action, opts.payload);
    };

    return btn;
  }

  function makeSeparator() {
    var sep = document.createElement('div');
    sep.style.cssText = 'height:1px;margin:5px 10px;background:linear-gradient(90deg,transparent,rgba(0,229,255,0.22),rgba(124,77,255,0.22),transparent)';
    return sep;
  }

  function buildMenu(ctx) {
    var menu = document.createElement('div');
    menu.setAttribute('data-nova-ctx', '1');
    menu.style.cssText = [
      'position:fixed','z-index:2147483647',
      'min-width:230px','max-width:320px','padding:6px',
      'background:linear-gradient(180deg,rgba(20,20,34,0.94) 0%,rgba(14,14,24,0.96) 100%)',
      'backdrop-filter:blur(22px) saturate(1.5)',
      '-webkit-backdrop-filter:blur(22px) saturate(1.5)',
      'border:1px solid rgba(0,229,255,0.28)','border-radius:12px',
      'box-shadow:0 0 0 1px rgba(255,255,255,0.04),0 0 40px rgba(0,229,255,0.14),0 24px 60px rgba(0,0,0,0.7)',
      'font-family:"Inter",system-ui,-apple-system,sans-serif',
      'font-size:13px','color:#e8e8f0','user-select:none','overflow:hidden',
      'animation:novaCtxIn 0.16s cubic-bezier(0.16,1,0.3,1)'
    ].join(';');

    menu.appendChild(makeItem({action:'back',icon:'\u25c0',label:'Back',shortcut:'Alt+\u2190'}));
    menu.appendChild(makeItem({action:'forward',icon:'\u25b6',label:'Forward',shortcut:'Alt+\u2192'}));
    menu.appendChild(makeItem({action:'reload',icon:'\u27f3',label:'Reload',shortcut:'Ctrl+R'}));

    if (ctx.text || ctx.editable) {
      menu.appendChild(makeSeparator());
      if (ctx.text) {
        menu.appendChild(makeItem({action:'copy',icon:'\u29c9',label:'Copy',shortcut:'Ctrl+C',payload:ctx.text}));
      }
      if (ctx.editable) {
        menu.appendChild(makeItem({action:'paste',icon:'\u21e9',label:'Paste',shortcut:'Ctrl+V'}));
      }
    }

    if (ctx.link) {
      menu.appendChild(makeSeparator());
      menu.appendChild(makeItem({action:'open-link-new-tab',icon:'\u2295',label:'Open link in new tab',payload:ctx.link}));
      menu.appendChild(makeItem({action:'copy-link',icon:'\u29c9',label:'Copy link address',payload:ctx.link}));
      menu.appendChild(makeItem({action:'save-link',icon:'\u21e9',label:'Save link as\u2026',payload:ctx.link}));
    }

    if (ctx.image) {
      menu.appendChild(makeSeparator());
      menu.appendChild(makeItem({action:'open-image-new-tab',icon:'\u2295',label:'Open image in new tab',payload:ctx.image}));
      menu.appendChild(makeItem({action:'copy-image-address',icon:'\u29c9',label:'Copy image address',payload:ctx.image}));
      menu.appendChild(makeItem({action:'save-image-as',icon:'\u21e9',label:'Save image as\u2026',payload:ctx.image}));
    }

    menu.appendChild(makeSeparator());
    menu.appendChild(makeItem({action:'select-all',icon:'\u25a6',label:'Select all',shortcut:'Ctrl+A'}));
    menu.appendChild(makeItem({action:'reload-frame',icon:'\u21bb',label:'Reload frame'}));

    return menu;
  }

  if (!document.getElementById('nova-ctx-style')) {
    var style = document.createElement('style');
    style.id = 'nova-ctx-style';
    style.textContent = '@keyframes novaCtxIn{from{opacity:0;transform:scale(0.94) translateY(-6px)}to{opacity:1;transform:scale(1) translateY(0)}}';
    (document.head || document.documentElement).appendChild(style);
  }

  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    e.stopPropagation();
    hideMenu();

    var el = e.target;

    var anchor = el && el.closest ? el.closest('a[href]') : null;
    var link = anchor ? anchor.href : '';

    var image = '';
    if (el && el.tagName === 'IMG' && el.src) {
      image = el.src;
    } else if (el && el.closest) {
      var parentImg = el.closest('img[src]');
      if (parentImg) image = parentImg.src;
    }

    var text = '';
    try {
      var sel = window.getSelection ? window.getSelection() : null;
      if (sel) text = String(sel.toString() || '');
    } catch (_) {}

    var editable = false;
    try {
      var node = el;
      while (node && node !== document.body) {
        if (node.isContentEditable ||
            node.tagName === 'INPUT' ||
            node.tagName === 'TEXTAREA') {
          editable = true;
          break;
        }
        node = node.parentNode;
      }
    } catch (_) {}

    menuEl = buildMenu({ link: link, image: image, text: text, editable: editable });
    document.documentElement.appendChild(menuEl);

    menuEl.style.left = '0px';
    menuEl.style.top = '0px';
    var rect = menuEl.getBoundingClientRect();
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var x = e.clientX;
    var y = e.clientY;
    if (x + rect.width + 8 > vw) x = Math.max(8, vw - rect.width - 8);
    if (y + rect.height + 8 > vh) y = Math.max(8, vh - rect.height - 8);
    menuEl.style.left = x + 'px';
    menuEl.style.top = y + 'px';
  }, true);

  document.addEventListener('mousedown', function (e) {
    if (menuEl && !menuEl.contains(e.target)) hideMenu();
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hideMenu();
  }, true);
  window.addEventListener('scroll', hideMenu, true);
  window.addEventListener('resize', hideMenu);
})();
"#;