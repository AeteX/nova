import { useEffect, useRef, useState } from "react";
import { useAI } from "../hooks/useAI";
import type { AIToolset } from "../hooks/useAITools";
import type { Settings } from "../hooks/useSettings";
import ToolCard from "./ToolCard";

interface AIPanelProps {
  settings: Settings;
  tools: AIToolset;
  onClose: () => void;
}

export default function AIPanel({ settings, tools, onClose }: AIPanelProps) {
  const { messages, status, send, stop, clear } = useAI(settings, tools);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wasVisibleRef = useRef(false);

  useEffect(() => {
    const isVisible =
      window.getComputedStyle(
        scrollRef.current?.closest(".nova-ai-sidebar") ?? document.body
      ).width !== "0px";
    if (isVisible && !wasVisibleRef.current) {
      inputRef.current?.focus();
    }
    wasVisibleRef.current = isVisible;
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = () => {
    if (status.state === "streaming" || status.state === "connecting") return;
    const text = input.trim();
    if (!text) return;
    setInput("");
    send(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isBusy =
    status.state === "streaming" ||
    status.state === "connecting" ||
    status.state === "tool";

  return (
    <div className="nova-ai">
      <div className="nova-ai-grid" aria-hidden="true" />
      <div className="nova-ai-scanline" aria-hidden="true" />

      <header className="nova-ai-header">
        <div className="nova-ai-brand">
          <div className="nova-ai-orb">
            <span
              className={`nova-ai-orb-core nova-ai-orb-core--${status.state}`}
            />
            <span className="nova-ai-orb-ring nova-ai-orb-ring--1" />
            <span className="nova-ai-orb-ring nova-ai-orb-ring--2" />
          </div>
          <div>
            <div className="nova-ai-eyebrow">AeteX Intelligence</div>
            <h1 className="nova-ai-title">Assistant</h1>
          </div>
        </div>
        <div className="nova-ai-header-actions">
          {messages.length > 0 && (
            <button
              className="nova-ai-icon-btn"
              onClick={clear}
              title="Clear conversation"
              aria-label="Clear conversation"
            >
              ⟲
            </button>
          )}
          <button
            className="nova-ai-icon-btn"
            onClick={onClose}
            title="Close"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </header>

      <div className="nova-ai-body" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="nova-ai-empty">
            <div className="nova-ai-empty-glyph">◈</div>
            <div className="nova-ai-empty-title">Neural link established</div>
            <div className="nova-ai-empty-sub">
              Ask me anything — or tell me to{" "}
              <span className="nova-ai-empty-emph">open YouTube</span>,{" "}
              <span className="nova-ai-empty-emph">search for cats</span>, or{" "}
              <span className="nova-ai-empty-emph">close this tab</span>.
            </div>
          </div>
        )}

        {messages.map((msg, idx) => {
          if (msg.hidden) return null;
          if (msg.role === "user") {
            return (
              <div key={idx} className="nova-ai-msg nova-ai-msg--user">
                <div className="nova-ai-msg-role">YOU</div>
                <div className="nova-ai-msg-content">{msg.content}</div>
              </div>
            );
          }
          if (msg.role === "assistant") {
            return (
              <div key={idx} className="nova-ai-msg nova-ai-msg--assistant">
                <div className="nova-ai-msg-role">NOVA</div>
                {(msg.content || !msg.toolCalls?.length) && (
                  <div className="nova-ai-msg-content">
                    {msg.content || (
                      <span className="nova-ai-cursor-blink">▋</span>
                    )}
                  </div>
                )}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="nova-tool-stack">
                    {msg.toolCalls.map((tc) => (
                      <ToolCard key={tc.id} record={tc} />
                    ))}
                  </div>
                )}
              </div>
            );
          }
          return null;
        })}

        {status.state === "connecting" && (
          <div className="nova-ai-thinking">
            <span className="nova-ai-thinking-dot" />
            <span className="nova-ai-thinking-dot" />
            <span className="nova-ai-thinking-dot" />
            <span className="nova-ai-thinking-text">Establishing link…</span>
          </div>
        )}

        {status.state === "error" && status.error && (
          <div className="nova-ai-error">
            <div className="nova-ai-error-title">Connection fault</div>
            <div className="nova-ai-error-body">{status.error}</div>
            <div className="nova-ai-error-hint">
              Ensure llama.cpp is running at {settings.aiServerUrl}
            </div>
          </div>
        )}
      </div>

      <footer className="nova-ai-footer">
        <textarea
          ref={inputRef}
          className="nova-ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isBusy ? "Working…" : "Transmit a message…"}
          disabled={isBusy}
          rows={1}
        />
        {isBusy ? (
          <button
            className="nova-ai-send nova-ai-send--stop"
            onClick={stop}
            title="Stop generation"
            aria-label="Stop generation"
          >
            ■
          </button>
        ) : (
          <button
            className="nova-ai-send"
            onClick={handleSubmit}
            disabled={!input.trim()}
            title="Send"
            aria-label="Send"
          >
            ➤
          </button>
        )}
      </footer>
    </div>
  );
}