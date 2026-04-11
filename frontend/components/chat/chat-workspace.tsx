"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Files, Plus, UploadCloud } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";

import { AI_Prompt } from "@/components/ui/animated-ai-input";
import { FileUploadCard, type UploadedFile } from "@/components/ui/file-upload-card";
import { DriveUploadToast, type UploadItem } from "@/components/ui/google-drive-uploader-toast";
import { MessageList } from "@/components/chat/message-list";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { AgentTimeline } from "@/components/agent/agent-timeline";
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

export function ChatWorkspace({ chatId, initialPrompt = "" }: ChatWorkspaceProps) {
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

      setUploads((prev) => [
        ...prev,
        {
          id,
          file,
          progress: 0,
          status: "uploading"
        }
      ]);

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
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <section className="space-y-4">
        <div className="rounded-3xl border border-border/70 bg-background/75 p-4 shadow-2xl backdrop-blur-xl dark:border-white/15 dark:bg-black/35 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-200/70">Conversation</p>
              <h1 className="text-lg font-semibold text-foreground dark:text-white">Session: {chatId}</h1>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push(createNewChatHref() as Route)}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-black transition hover:bg-cyan-400"
              >
                <Plus className="h-4 w-4" />
                New Chat
              </button>

              <button
                onClick={() => setShowDropzone((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-sm text-foreground/80 transition hover:bg-accent dark:border-white/20 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10"
              >
                {showDropzone ? <Files className="h-4 w-4" /> : <UploadCloud className="h-4 w-4" />}
                {showDropzone ? "Hide Uploads" : "Upload Files"}
              </button>
            </div>
          </div>

          {showDropzone && (
            <div className="mb-4">
              <FileUploadCard
                files={uploads}
                onFilesChange={onFilesChange}
                onFileRemove={onRemoveUpload}
                onClose={() => setShowDropzone(false)}
                className="max-w-full border-border/70 bg-background/70 dark:border-white/20 dark:bg-black/20"
              />
            </div>
          )}

          <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1 sm:max-h-[56vh]">
            <MessageList
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
            {isStreaming && <TypingIndicator />}
            {error && <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>}
          </div>
        </div>

        <div className="rounded-3xl border border-border/70 bg-background/75 p-3 backdrop-blur-xl dark:border-white/15 dark:bg-black/30">
          <AI_Prompt
            disabled={isStreaming}
            placeholder="Ask Omni to search your tools, draft, plan, or execute actions"
            onSubmit={(message) => sendMessage({ chatId, message })}
          />
        </div>
      </section>

      <aside className="space-y-4">
        <AgentTimeline steps={steps.slice(-8)} />
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
