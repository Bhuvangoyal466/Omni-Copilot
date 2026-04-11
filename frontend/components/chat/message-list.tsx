"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";

import type { ChatMessage } from "@/lib/api/client";

interface MessageListProps {
  messages: ChatMessage[];
  onPlanAccept?: () => void;
  onPlanDecline?: () => void;
  onPlanEdit?: (instruction: string) => void;
  planActionsDisabled?: boolean;
}

interface ParsedPlan {
  goal: string;
  steps: string[];
  toolsNeeded: string;
  estimated: string;
  risk: string;
}

function parsePlan(content: string): ParsedPlan | null {
  if (!content.includes("Goal:") || !content.toLowerCase().includes("type \"go\" or \"yes\"")) {
    return null;
  }

  const normalized = content
    .replace(/[\u256d\u256e\u2570\u256f\u2502\u2500]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const goalMatch = normalized.match(/Goal:\s*(.+?)\s+Steps:/i);
  const toolsMatch = normalized.match(/Tools needed:\s*(.+?)\s+Estimated:/i);
  const estimatedMatch = normalized.match(/Estimated:\s*(.+?)\s+Risk:/i);
  const riskMatch = normalized.match(/Risk:\s*(.+?)(?:\s+Type\s+"go"|$)/i);

  const goal = goalMatch?.[1]?.trim() || "";
  const toolsNeeded = toolsMatch?.[1]?.trim() || "";
  const estimated = estimatedMatch?.[1]?.trim() || "";
  const risk = riskMatch?.[1]?.trim() || "";

  const steps = Array.from(normalized.matchAll(/\b\d+\.\s*(.+?)(?=\s+\d+\.\s*|\s+Tools needed:|$)/g)).map(
    (match) => match[1].trim()
  );

  if (!goal || steps.length === 0) {
    return null;
  }

  return {
    goal,
    steps,
    toolsNeeded,
    estimated,
    risk
  };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      onClick={onCopy}
      className="absolute right-2 top-2 rounded-md border border-border/70 bg-background/80 p-1 text-foreground/70 hover:text-foreground dark:border-white/20 dark:bg-black/40 dark:text-white/70 dark:hover:text-white"
      aria-label="Copy code"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function MessageList({
  messages,
  onPlanAccept,
  onPlanDecline,
  onPlanEdit,
  planActionsDisabled = false
}: MessageListProps) {
  const [editingPlanMessageId, setEditingPlanMessageId] = useState<string | null>(null);
  const [editInstructionDraft, setEditInstructionDraft] = useState("");

  return (
    <div className="space-y-4">
      {messages.map((message, index) => {
        const isUser = message.role === "user";
        const parsedPlan = !isUser ? parsePlan(message.content) : null;
        const isLatestMessage = index === messages.length - 1;
        const showPlanActions = Boolean(onPlanAccept && onPlanDecline && isLatestMessage);
        const canEditPlan = Boolean(onPlanEdit && isLatestMessage);
        const isEditingThisPlan = editingPlanMessageId === message.id;

        return (
          <div
            key={message.id}
            className={`rounded-2xl border p-4 shadow-lg backdrop-blur-xl ${
              isUser
                ? "ml-2 border-cyan-500/35 bg-cyan-500/10 sm:ml-8"
                : "mr-2 border-border/70 bg-background/75 sm:mr-8 dark:border-white/15 dark:bg-black/35"
            }`}
          >
            <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground dark:text-white/60">
              {isUser ? "You" : "Omni"}
            </div>

            {parsedPlan ? (
              <div className="space-y-4 rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 p-4 dark:border-cyan-300/25">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-200">Execution Plan</p>
                  <p className="mt-1 text-sm text-foreground dark:text-white">{parsedPlan.goal}</p>
                </div>

                <div>
                  <p className="mb-1 text-xs uppercase tracking-[0.12em] text-muted-foreground dark:text-white/65">Steps</p>
                  <ol className="space-y-1 text-sm text-foreground dark:text-white/90">
                    {parsedPlan.steps.map((step) => (
                      <li key={step} className="list-inside list-decimal">
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-border/70 bg-background/70 p-2 text-xs dark:border-white/10 dark:bg-black/35">
                    <p className="text-muted-foreground dark:text-white/55">Tools</p>
                    <p className="mt-1 text-foreground dark:text-white">{parsedPlan.toolsNeeded || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-background/70 p-2 text-xs dark:border-white/10 dark:bg-black/35">
                    <p className="text-muted-foreground dark:text-white/55">Estimated</p>
                    <p className="mt-1 text-foreground dark:text-white">{parsedPlan.estimated || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-background/70 p-2 text-xs dark:border-white/10 dark:bg-black/35">
                    <p className="text-muted-foreground dark:text-white/55">Risk</p>
                    <p className="mt-1 text-foreground dark:text-white">{parsedPlan.risk || "-"}</p>
                  </div>
                </div>

                {showPlanActions && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={onPlanAccept}
                      disabled={planActionsDisabled}
                      className="bg-blue-500 text-white hover:bg-blue-400"
                    >
                      Accept
                    </Button>
                    <Button
                      onClick={onPlanDecline}
                      disabled={planActionsDisabled}
                      className="bg-black text-white hover:bg-neutral-800"
                    >
                      Decline
                    </Button>
                    {canEditPlan && (
                      <Button
                        onClick={() => {
                          if (isEditingThisPlan) {
                            setEditingPlanMessageId(null);
                            setEditInstructionDraft("");
                            return;
                          }
                          setEditingPlanMessageId(message.id);
                          setEditInstructionDraft("");
                        }}
                        disabled={planActionsDisabled}
                        className="bg-white text-black hover:bg-white/90"
                      >
                        {isEditingThisPlan ? "Close Edit" : "Edit"}
                      </Button>
                    )}
                  </div>
                )}

                {canEditPlan && isEditingThisPlan && (
                  <div className="space-y-2 rounded-xl border border-cyan-400/25 bg-cyan-950/20 p-3">
                    <p className="text-xs text-cyan-100/85">Plan edit instruction</p>
                    <textarea
                      value={editInstructionDraft}
                      onChange={(event) => setEditInstructionDraft(event.target.value)}
                      placeholder="Example: message ko formal rakho and first verify contact name"
                      className="min-h-20 w-full rounded-lg border border-cyan-300/20 bg-black/35 p-2 text-sm text-cyan-50 outline-none placeholder:text-cyan-200/40"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        onClick={() => {
                          const trimmed = editInstructionDraft.trim();
                          if (!trimmed || !onPlanEdit) {
                            return;
                          }
                          onPlanEdit(trimmed);
                          setEditingPlanMessageId(null);
                          setEditInstructionDraft("");
                        }}
                        disabled={planActionsDisabled || !editInstructionDraft.trim()}
                        className="bg-emerald-500 text-black hover:bg-emerald-400"
                      >
                        Update Plan
                      </Button>
                      <Button
                        onClick={() => {
                          setEditingPlanMessageId(null);
                          setEditInstructionDraft("");
                        }}
                        disabled={planActionsDisabled}
                        className="bg-black text-white hover:bg-neutral-800"
                      >
                        Cancel Edit
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <article className="prose prose-sm max-w-none text-foreground dark:prose-invert">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code(props) {
                      const { children, className } = props;
                      const isInline = !className;
                      const value = String(children ?? "");

                      if (isInline) {
                        return <code className="rounded bg-muted px-1.5 py-0.5 text-cyan-700 dark:bg-black/40 dark:text-cyan-200">{children}</code>;
                      }

                      return (
                        <div className="relative">
                          <CopyButton text={value} />
                          <pre className="overflow-x-auto rounded-xl border border-border/70 bg-background/80 p-3 dark:border-white/10 dark:bg-black/50">
                            <code className={className}>{children}</code>
                          </pre>
                        </div>
                      );
                    }
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </article>
            )}
          </div>
        );
      })}
    </div>
  );
}
