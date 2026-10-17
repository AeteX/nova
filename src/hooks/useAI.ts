import { useCallback, useRef, useState } from "react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { Settings } from "./useSettings";
import type { AIToolset, ToolCall, ToolResult } from "./useAITools";

export interface ToolCallRecord {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  state: "running" | "success" | "error";
  result?: ToolResult;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCallRecord[];
  toolCallId?: string;
  hidden?: boolean;
}

export interface AIStatus {
  state: "idle" | "connecting" | "streaming" | "tool" | "error";
  error: string | null;
}

const MAX_TOOL_ROUNDS = 6;

function toApiMessage(m: ChatMessage) {
  if (m.role === "tool") {
    return {
      role: "tool" as const,
      tool_call_id: m.toolCallId ?? "",
      content: m.content,
    };
  }
  if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
    return {
      role: "assistant" as const,
      content: m.content || null,
      tool_calls: m.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments ?? {}),
        },
      })),
    };
  }
  return { role: m.role, content: m.content };
}

export function useAI(settings: Settings, toolset: AIToolset) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<AIStatus>({
    state: "idle",
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus({ state: "idle", error: null });
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    setStatus({ state: "idle", error: null });
  }, []);

  const send = useCallback(
    async (userInput: string) => {
      const trimmed = userInput.trim();
      if (!trimmed) return;

      const userMessage: ChatMessage = { role: "user", content: trimmed };
      const snapshot: ChatMessage[] = [...messages, userMessage];
      setMessages(snapshot);
      setStatus({ state: "connecting", error: null });

      const controller = new AbortController();
      abortRef.current = controller;

      const conversation: ChatMessage[] = [...snapshot];

      try {
        const endpoint = `${settings.aiServerUrl.replace(
          /\/$/,
          ""
        )}/v1/chat/completions`;

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");

          const response = await tauriFetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: settings.aiModel,
              messages: [
                { role: "system", content: settings.aiSystemPrompt },
                ...conversation.map(toApiMessage),
              ],
              temperature: settings.aiTemperature,
              stream: true,
              tools: toolset.definitions,
              tool_choice: "auto",
            }),
            signal: controller.signal,
          });

          if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(
              `Server returned ${response.status}${
                text ? `: ${text.slice(0, 200)}` : ""
              }`
            );
          }
          if (!response.body) throw new Error("Response has no readable body.");

          // ── Stream this round ─────────────────────────────
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let assistantText = "";
          const toolAccum = new Map<
            number,
            { id: string; name: string; argsRaw: string }
          >();

          // Insert a fresh assistant placeholder for this round
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "", toolCalls: [] },
          ]);
          setStatus({ state: "streaming", error: null });

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const rawLine of lines) {
              const line = rawLine.trim();
              if (!line || !line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (payload === "[DONE]") continue;

              try {
                const parsed = JSON.parse(payload);
                const choice = parsed.choices?.[0];
                if (!choice) continue;

                const delta = choice.delta;
                if (delta?.content) {
                  assistantText += delta.content;
                  const text = assistantText;
                  setMessages((prev) => {
                    const copy = [...prev];
                    const last = copy[copy.length - 1];
                    if (last?.role === "assistant") {
                      copy[copy.length - 1] = { ...last, content: text };
                    }
                    return copy;
                  });
                }

                if (Array.isArray(delta?.tool_calls)) {
                  for (const tc of delta.tool_calls) {
                    const idx = typeof tc.index === "number" ? tc.index : 0;
                    const existing =
                      toolAccum.get(idx) ??
                      ({ id: "", name: "", argsRaw: "" } as {
                        id: string;
                        name: string;
                        argsRaw: string;
                      });
                    if (tc.id) existing.id = tc.id;
                    if (tc.function?.name) existing.name = tc.function.name;
                    if (tc.function?.arguments)
                      existing.argsRaw += tc.function.arguments;
                    toolAccum.set(idx, existing);
                  }
                }

              } catch {
                // Skip malformed chunks
              }
            }
          }

          // ── Decide: tools or done? ────────────────────────
          const hasTools = toolAccum.size > 0;

          if (!hasTools) {
            setStatus({ state: "idle", error: null });
            abortRef.current = null;
            return;
          }

          // Build the list of tool calls in index order
          const calls: ToolCall[] = [];
          const sortedEntries = [...toolAccum.entries()].sort(
            (a, b) => a[0] - b[0]
          );
          for (const [idx, tc] of sortedEntries) {
            let args: Record<string, unknown> = {};
            try {
              args = tc.argsRaw ? JSON.parse(tc.argsRaw) : {};
            } catch {
              args = {};
            }
            calls.push({
              id: tc.id || `call-${round}-${idx}`,
              name: tc.name,
              arguments: args,
            });
          }

          // Attach the tool call records to the assistant message
          const records: ToolCallRecord[] = calls.map((c) => ({
            id: c.id,
            name: c.name,
            arguments: c.arguments,
            state: "running",
          }));

          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant") {
              copy[copy.length - 1] = {
                ...last,
                content: assistantText,
                toolCalls: records,
              };
            }
            return copy;
          });
          setStatus({ state: "tool", error: null });

          // ── Execute tools sequentially ────────────────────
          const results: ToolResult[] = [];
          for (let i = 0; i < calls.length; i++) {
            if (controller.signal.aborted)
              throw new DOMException("Aborted", "AbortError");
            let result: ToolResult;
            try {
              result = await toolset.execute(calls[i]);
            } catch (err) {
              result = {
                success: false,
                message:
                  err instanceof Error ? err.message : "Tool execution failed.",
              };
            }
            results.push(result);

            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant" && last.toolCalls) {
                const updated = [...last.toolCalls];
                updated[i] = {
                  ...updated[i],
                  state: result.success ? "success" : "error",
                  result,
                };
                copy[copy.length - 1] = { ...last, toolCalls: updated };
              }
              return copy;
            });
          }

          // ── Feed results back into the conversation ──────
          conversation.push({
            role: "assistant",
            content: assistantText,
            toolCalls: records,
          });
          for (let i = 0; i < calls.length; i++) {
            conversation.push({
              role: "tool",
              toolCallId: calls[i].id,
              content: JSON.stringify(results[i]),
              hidden: true,
            });
          }

          // loop continues — the model gets another turn
        }

        // Max rounds reached without a clean stop
        setStatus({ state: "idle", error: null });
        abortRef.current = null;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          setStatus({ state: "idle", error: null });
          return;
        }
        const message =
          err instanceof Error ? err.message : "Unknown error occurred.";
        setStatus({ state: "error", error: message });
        abortRef.current = null;
      }
    },
    [messages, settings, toolset]
  );

  return { messages, status, send, stop, clear };
}