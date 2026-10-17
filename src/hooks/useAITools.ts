import type { SearchEngineId } from "./useSettings";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export interface AIToolset {
  definitions: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: {
        type: "object";
        properties: Record<string, unknown>;
        required?: string[];
      };
    };
  }>;
  execute: (call: ToolCall) => Promise<ToolResult> | ToolResult;
}

export interface ToolsetDeps {
  navigate: (url: string) => void;
  openInNewTab: (url: string) => void;
  search: (query: string) => void;
  newTab: () => void;
  closeCurrentTab: () => void;
  getOpenTabs: () => Array<{ title: string; url: string; active: boolean }>;
  getCurrentTab: () => { title: string; url: string };
  setSearchEngine: (id: SearchEngineId) => void;
  setAccentColor: (hex: string) => void;
  setHomepage: (url: string) => void;
}

const HEX_RE = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i;
const SEARCH_ENGINE_IDS: SearchEngineId[] = [
  "duckduckgo",
  "google",
  "bing",
  "brave",
  "startpage",
  "ecosia",
];

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "https://duckduckgo.com";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w-]+(\.[\w-]+)+/.test(trimmed) && !trimmed.includes(" ")) {
    return `https://${trimmed}`;
  }
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}

export function buildToolset(deps: ToolsetDeps): AIToolset {
  const definitions: AIToolset["definitions"] = [
    {
      type: "function",
      function: {
        name: "navigate",
        description:
          "Navigate the current tab to a URL. Use this when the user asks to open or go to a specific website.",
        parameters: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description:
                "The URL or domain to open, e.g. https://youtube.com or youtube.com.",
            },
          },
          required: ["url"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "open_in_new_tab",
        description:
          "Open a URL in a new tab, keeping the current tab unchanged. Prefer this when the user says 'in a new tab' or wants to keep the current page.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "The URL or domain to open." },
          },
          required: ["url"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search",
        description:
          "Run a web search using the user's configured search engine. Use this for questions, lookups, or anything the user wants to 'search for' or 'look up'.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query." },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "new_tab",
        description: "Open a blank new tab on the homepage.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "close_current_tab",
        description: "Close the currently active tab.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "list_tabs",
        description:
          "List all open tabs. Use this to answer questions about what is currently open or to reason about the user's browsing session.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "get_current_page",
        description:
          "Return the URL and title of the currently active tab. Use this to answer questions about what page the user is on.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "set_search_engine",
        description:
          "Change the default search engine. Use only when the user explicitly asks to change it.",
        parameters: {
          type: "object",
          properties: {
            engine: {
              type: "string",
              description:
                "One of: duckduckgo, google, bing, brave, startpage, ecosia.",
            },
          },
          required: ["engine"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "set_accent_color",
        description:
          "Change the browser's accent color. Use only when the user asks to change the theme color.",
        parameters: {
          type: "object",
          properties: {
            hex: {
              type: "string",
              description: "A hex color like #00e5ff.",
            },
          },
          required: ["hex"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "set_homepage",
        description:
          "Change the homepage URL opened by new tabs. Use only when the user explicitly asks to change it.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "The new homepage URL." },
          },
          required: ["url"],
        },
      },
    },
  ];

  const execute = (call: ToolCall): ToolResult => {
    const args = call.arguments ?? {};
    try {
      switch (call.name) {
        case "navigate": {
          const url = normalizeUrl(String(args.url ?? ""));
          deps.navigate(url);
          return { success: true, message: `Navigated to ${url}` };
        }
        case "open_in_new_tab": {
          const url = normalizeUrl(String(args.url ?? ""));
          deps.openInNewTab(url);
          return { success: true, message: `Opened ${url} in a new tab` };
        }
        case "search": {
          const q = String(args.query ?? "").trim();
          if (!q) return { success: false, message: "Empty search query." };
          deps.search(q);
          return { success: true, message: `Searched for "${q}"` };
        }
        case "new_tab": {
          deps.newTab();
          return { success: true, message: "Opened a new tab" };
        }
        case "close_current_tab": {
          deps.closeCurrentTab();
          return { success: true, message: "Closed the current tab" };
        }
        case "list_tabs": {
          const tabs = deps.getOpenTabs();
          return {
            success: true,
            message: `${tabs.length} tab${tabs.length === 1 ? "" : "s"} open`,
            data: { tabs },
          };
        }
        case "get_current_page": {
          const page = deps.getCurrentTab();
          return {
            success: true,
            message: `Current page: ${page.title} — ${page.url}`,
            data: page,
          };
        }
        case "set_search_engine": {
          const id = String(args.engine ?? "").toLowerCase() as SearchEngineId;
          if (!SEARCH_ENGINE_IDS.includes(id)) {
            return {
              success: false,
              message: `Unknown search engine "${args.engine}".`,
            };
          }
          deps.setSearchEngine(id);
          return {
            success: true,
            message: `Default search engine set to ${id}`,
          };
        }
        case "set_accent_color": {
          const hex = String(args.hex ?? "").trim();
          if (!HEX_RE.test(hex)) {
            return { success: false, message: `Invalid hex color "${hex}".` };
          }
          deps.setAccentColor(hex);
          return { success: true, message: `Accent color set to ${hex}` };
        }
        case "set_homepage": {
          const url = normalizeUrl(String(args.url ?? ""));
          deps.setHomepage(url);
          return { success: true, message: `Homepage set to ${url}` };
        }
        default:
          return { success: false, message: `Unknown tool "${call.name}".` };
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : "Tool execution failed.",
      };
    }
  };

  return { definitions, execute };
}