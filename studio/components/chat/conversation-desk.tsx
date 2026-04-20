"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Files, Plus, UploadCloud } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";

import { AI_Prompt } from "@/components/ui/animated-ai-input";
import { FileUploadCard, type UploadedFile } from "@/components/ui/file-upload-card";
import { DriveUploadToast, type UploadItem } from "@/components/ui/google-drive-uploader-toast";
import { ThreadFeed } from "@/components/chat/thread-feed";
import { PulseDot } from "@/components/chat/pulse-dot";
import { SignalTimeline } from "@/components/agent/signal-timeline";
import { useChat } from "@/lib/hooks/use-chat";
import { useAgentStream } from "@/lib/hooks/use-agent-stream";
import { useAppStore } from "@/lib/store/app-store";
import { createId, createNewChatHref } from "@/lib/utils";

interface ChatWorkspaceProps {
  chatId: string;
  initialPrompt?: string;
}

function normalizeFileType(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName) {
    return fromName;
  }

  if (file.type.includes("pdf")) return "pdf";
  if (file.type.includes("image")) return "jpg";
  if (file.type.includes("video")) return "mp4";
  if (file.type.includes("audio")) return "mp3";
  return "file";
}

export function ConversationDesk({ chatId, initialPrompt = "" }: ChatWorkspaceProps) {
  const router = useRouter();
  const [showDropzone, setShowDropzone] = useState(false);
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  const [toastItems, setToastItems] = useState<UploadItem[]>([]);
  const hasAutoPromptSentRef = useRef(false);

  const setActiveChat = useAppStore((s) => s.setActiveChat);
  const { messages, isStreaming, error, sendMessage } = useChat(chatId);
  const { steps } = useAgentStream();

  useEffect(() => {
    setActiveChat(chatId);
  }, [chatId, setActiveChat]);

  useEffect(() => {
    hasAutoPromptSentRef.current = false;
  }, [chatId]);

  useEffect(() => {
    const promptText = initialPrompt.trim();
    if (!promptText || hasAutoPromptSentRef.current || isStreaming || messages.length > 0) {
      return;
    }

    hasAutoPromptSentRef.current = true;
    void sendMessage({ chatId, message: promptText });
  }, [chatId, initialPrompt, isStreaming, messages.length, sendMessage]);

  const startUploadSimulation = (id: string) => {
    let progress = 0;

    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 18) + 10;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
      }

      setUploads((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                progress,
                status: progress === 100 ? "completed" : "uploading"
              }
            : item
        )
      );

      setToastItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                progress,
                status: progress === 100 ? "SUCCESS" : "UPLOADING"
              }
            : item
        )
      );
    }, 260);
  };

  const onFilesChange = (files: File[]) => {
    files.forEach((file) => {
      const id = createId("upload");

      setUploads((prev) => [...prev, { id, file, progress: 0, status: "uploading" }]);
      setToastItems((prev) => [
        ...prev,
        {
          id,
          fileName: file.name,
          fileType: normalizeFileType(file),
          status: "UPLOADING",
          progress: 0
        }
      ]);

      startUploadSimulation(id);
    });
  };

  const onRemoveUpload = (id: string) => {
    setUploads((prev) => prev.filter((item) => item.id !== id));
    setToastItems((prev) => prev.filter((item) => item.id !== id));
  };

  const sortedMessages = useMemo(() => messages, [messages]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="space-y-4">
        <div className="rounded-md border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Conversation</p>
              <h1 className="mt-1 text-lg font-semibold">Session {chatId}</h1>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => router.push(createNewChatHref() as Route)}
                className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
              >
                <Plus className="h-4 w-4" />
                New chat
              </button>

              <button
                onClick={() => setShowDropzone((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
              >
                {showDropzone ? <Files className="h-4 w-4" /> : <UploadCloud className="h-4 w-4" />}
                {showDropzone ? "Hide uploads" : "Upload files"}
              </button>
            </div>
          </div>

          {showDropzone && (
            <div className="mt-4">
              <FileUploadCard
                files={uploads}
                onFilesChange={onFilesChange}
                onFileRemove={onRemoveUpload}
                onClose={() => setShowDropzone(false)}
                className="max-w-full border-border bg-background"
              />
            </div>
          )}

          <div className="mt-4 space-y-4">
            <ThreadFeed
              messages={sortedMessages}
              planActionsDisabled={isStreaming}
              onPlanAccept={() => {
                void sendMessage({ chatId, message: "yes" });
              }}
              onPlanDecline={() => {
                void sendMessage({ chatId, message: "cancel" });
              }}
              onPlanEdit={(instruction) => {
                void sendMessage({ chatId, message: `change: ${instruction}` });
              }}
            />
            {isStreaming && <PulseDot />}
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>
        </div>

        <AI_Prompt
          disabled={isStreaming}
          placeholder="Ask Omni to search your tools, draft, plan, or execute actions"
          onSubmit={(message, options) =>
            sendMessage({
              chatId,
              message,
              voiceMode: Boolean(options?.voiceMode)
            })
          }
        />
      </section>

      <aside className="space-y-4">
        <div className="rounded-md border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Activity</p>
          <SignalTimeline steps={steps.slice(-8)} />
        </div>
      </aside>

      <DriveUploadToast
        items={toastItems}
        onRemoveItem={onRemoveUpload}
        onClearAll={() => {
          setToastItems([]);
          setUploads([]);
        }}
      />
    </div>
  );
}