"use client";

import { useCallback, useMemo, useState } from "react";
import { useAppStore } from "@/lib/store/app-store";

interface SendMessageOptions {
  chatId: string;
  message: string;
}

type SseEvent = {
  event: string;
  data: unknown;
};

function parseSseChunk(raw: string): SseEvent[] {
  const packets = raw.split("\n\n").filter(Boolean);
  const events: SseEvent[] = [];

  for (const packet of packets) {
    const lines = packet.split("\n");
    let event = "message";
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }

    const dataText = dataLines.join("\n");
    let data: unknown = dataText;
    try {
      data = JSON.parse(dataText);
    } catch {
      data = dataText;
    }
    events.push({ event, data });
  }

  return events;
}

export function useChat(chatId: string) {
  const messages = useAppStore((s) => s.messagesByChat[chatId] ?? []);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const addMessageText = useAppStore((s) => s.addMessageText);
  const updateMessageContent = useAppStore((s) => s.updateMessageContent);
  const pushAgentStep = useAppStore((s) => s.pushAgentStep);
  const pushAuditAction = useAppStore((s) => s.pushAuditAction);

  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async ({ chatId: targetChatId, message }: SendMessageOptions) => {
      if (!message.trim()) {
        return;
      }

      setError(null);
      setIsStreaming(true);
      addMessageText(targetChatId, "user", message);
      const assistantId = addMessageText(targetChatId, "assistant", "");
      pushAuditAction({
        label: `Sent chat message in ${targetChatId}`,
        undoable: false
      });

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            chatId: targetChatId,
            message,
            model: selectedModel
          })
        });

        if (!response.ok || !response.body) {
          let messageText = `Stream failed with status ${response.status}`;
          try {
            const payload = (await response.json()) as { error?: string };
            if (payload?.error) {
              messageText = payload.error;
            }
          } catch {
            // Keep the default status message when response body is not JSON.
          }
          throw new Error(messageText);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantText = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const boundary = buffer.lastIndexOf("\n\n");
          if (boundary === -1) {
            continue;
          }

          const packetText = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          const events = parseSseChunk(packetText);
          for (const evt of events) {
            if (evt.event === "token") {
              const token = typeof evt.data === "string" ? evt.data : "";
              assistantText += token;
              updateMessageContent(targetChatId, assistantId, assistantText);
            }

            if (evt.event === "status" && typeof evt.data === "object" && evt.data !== null) {
              const data = evt.data as { agent?: string; message?: string; status?: "running" | "completed" | "failed" };
              if (data.message && data.agent && data.status) {
                pushAgentStep({
                  agent: data.agent,
                  message: data.message,
                  status: data.status
                });
              }
            }

            if (evt.event === "error") {
              const msg = typeof evt.data === "string" ? evt.data : "Unknown streaming error";
              setError(msg);
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
        pushAuditAction({
          label: `Streaming error: ${msg}`,
          undoable: false
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [addMessageText, pushAgentStep, selectedModel, updateMessageContent]
  );

  return useMemo(
    () => ({
      messages,
      isStreaming,
      error,
      sendMessage
    }),
    [messages, isStreaming, error, sendMessage]
  );
}
