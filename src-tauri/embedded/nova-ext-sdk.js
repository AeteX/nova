/*
 * Nova Extension SDK — bundled runtime
 * Served by the host at nova-ext://__sdk__/nova-ext-sdk.js
 * Source of truth: src/extension-sdk/
 */
(function () {
  "use strict";

  var CHANNEL = "nova-ext-bridge";
  var extId = "";
  var seq = 0;
  var pending = new Map();
  var listeners = new Map();

  function setExtensionId(id) {
    extId = id;
  }

  function invoke(command, args) {
    args = args || {};
    var reqId = "req-" + ++seq + "-" + Date.now();
    return new Promise(function (resolve, reject) {
      pending.set(reqId, { resolve: resolve, reject: reject });
      var target = window.parent !== window ? window.parent : window;
      target.postMessage(
        {
          channel: CHANNEL,
          extId: extId,
          reqId: reqId,
          kind: "request",
          command: command,
          args: args,
        },
        "*"
      );
    });
  }

  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || d.channel !== CHANNEL) return;

    if (d.kind === "response") {
      var p = pending.get(d.reqId);
      if (!p) return;
      pending.delete(d.reqId);
      if (d.ok) p.resolve(d.value);
      else p.reject(new Error(d.error || "unknown error"));
    } else if (d.kind === "event") {
      var set = listeners.get(d.event);
      if (!set) return;
      set.forEach(function (fn) {
        try {
          fn(d.payload);
        } catch (err) {
          console.error("[nova-ext]", err);
        }
      });
    }
  });

  function on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
  }

  function off(event, fn) {
    var set = listeners.get(event);
    if (set) set.delete(fn);
  }

  function emitter(name) {
    return {
      addListener: function (fn) {
        on(name, fn);
      },
      removeListener: function (fn) {
        off(name, fn);
      },
    };
  }

  var nova = {
    tabs: {
      query: function (filter) {
        return invoke("tabs_query", filter || {});
      },
      get: function (tabId) {
        return invoke("tabs_get", { tabId: tabId });
      },
      create: function (url, active) {
        return invoke("tabs_create", { url: url, active: active !== false });
      },
      update: function (tabId, changes) {
        return invoke("tabs_update", { tabId: tabId, changes: changes });
      },
      remove: function (tabId) {
        return invoke("tabs_remove", { tabId: tabId });
      },
      navigate: function (tabId, url) {
        return invoke("tabs_navigate", { tabId: tabId, url: url });
      },
      onCreated: emitter("tabs.onCreated"),
      onRemoved: emitter("tabs.onRemoved"),
      onActivated: emitter("tabs.onActivated"),
      onUpdated: emitter("tabs.onUpdated"),
    },
    storage: {
      local: {
        get: function (key) {
          return invoke("storage_get", { scope: "local", key: key });
        },
        set: function (items) {
          return invoke("storage_set", { scope: "local", items: items });
        },
        remove: function (key) {
          return invoke("storage_remove", { scope: "local", key: key });
        },
        clear: function () {
          return invoke("storage_clear", { scope: "local" });
        },
      },
    },
    runtime: {
      sendMessage: function (message, to) {
        return invoke("runtime_send_message", { message: message, to: to });
      },
      onMessage: emitter("runtime.onMessage"),
    },
    contentScripts: {
      register: function (spec) {
        return invoke("content_scripts_register", spec);
      },
      execute: function (tabId, code, frameId) {
        return invoke("content_scripts_execute", {
          tabId: tabId,
          code: code,
          frameId: frameId || 0,
        });
      },
    },
    ui: {
      show: function (surface) {
        return invoke("ui_show", { surface: surface });
      },
      hide: function (surface) {
        return invoke("ui_hide", { surface: surface });
      },
      setBadgeText: function (text) {
        return invoke("ui_badge_text", { text: text });
      },
      setBadgeColor: function (color) {
        return invoke("ui_badge_color", { color: color });
      },
    },
  };

  window.nova = nova;

  window.defineExtension = function (id, setup) {
    setExtensionId(id);
    var target = window.parent !== window ? window.parent : window;
    target.postMessage(
      { channel: CHANNEL, extId: id, kind: "ready" },
      "*"
    );
    if (typeof setup === "function") {
      try {
        setup(nova);
      } catch (err) {
        console.error("[nova-ext] setup failed:", err);
      }
    }
  };
})();