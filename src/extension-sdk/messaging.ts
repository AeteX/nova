import { invoke, on, off } from "./runtime";
import type { RuntimeMessage, MessageSender } from "./types";

export function sendMessage(
  message: RuntimeMessage,
  to?: { tabId?: string; frameId?: number }
): Promise<unknown> {
  return invoke("runtime_send_message", { message, to });
}

export type MessageListener = (
  message: RuntimeMessage,
  sender: MessageSender
) => void;

export interface MessageEmitter {
  addListener(fn: MessageListener): void;
  removeListener(fn: MessageListener): void;
}

interface MessageEventPayload {
  message: RuntimeMessage;
  sender: MessageSender;
}

const wrapped = new WeakMap<MessageListener, (v: unknown) => void>();

export const onMessage: MessageEmitter = {
  addListener(fn) {
    const wrapper = (v: unknown) => {
      const e = v as MessageEventPayload;
      fn(e.message, e.sender);
    };
    wrapped.set(fn, wrapper);
    on("runtime.onMessage", wrapper);
  },
  removeListener(fn) {
    const wrapper = wrapped.get(fn);
    if (wrapper) off("runtime.onMessage", wrapper);
  },
};