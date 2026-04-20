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

  const normalized = content.replace(/[\u256d\u256e\u2570\u256f\u2502\u2500]/g, " ").replace(/\s+/g, " ").trim();
  const goalMatch = normalized.match(/Goal:\s*(.+?)\s+Steps:/i);
  const toolsMatch = normalized.match(/Tools needed:\s*(.+?)\s+Estimated:/i);
  const estimatedMatch = normalized.match(/Estimated:\s*(.+?)\s+Risk:/i);
  const riskMatch = normalized.match(/Risk:\s*(.+?)(?:\s+Type\s+"go"|$)/i);

  const goal = goalMatch?.[1]?.trim() || "";
  const toolsNeeded = toolsMatch?.[1]?.trim() || "";
  const estimated = estimatedMatch?.[1]?.trim() || "";
  const risk = riskMatch?.[1]?.trim() || "";
  const steps = Array.from(normalized.matchAll(/\b\d+\.\s*(.+?)(?=\s+\d+\.\s*|\s+Tools needed:|$)/g)).map((match) => match[1].trim());

  if (!goal || steps.length === 0) {
    return null;
  }

  return { goal, steps, toolsNeeded, estimated, risk };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button onClick={onCopy} className="absolute right-2 top-2 rounded-md border border-border bg-background p-1 text-foreground/70 hover:bg-secondary" aria-label="Copy code">
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function ThreadFeed({ messages, onPlanAccept, onPlanDecline, onPlanEdit, planActionsDisabled = false }: MessageListProps) {
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
          <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
            <div className={`w-full max-w-3xl rounded-md border px-4 py-3 ${isUser ? "border-border bg-secondary/40" : "border-border bg-card"}`}>
              <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{isUser ? "You" : "Horizon"}</div>

              {parsedPlan ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Execution plan</p>
                    <p className="mt-1 text-sm">{parsedPlan.goal}</p>
                  </div>

                  <div>
                    <p className="mb-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">Steps</p>
                    <ol className="space-y-1 text-sm text-foreground">
                      {parsedPlan.steps.map((step) => (
                        <li key={step} className="list-inside list-decimal">
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-md border border-border bg-background p-2 text-xs">
                      <p className="text-muted-foreground">Tools</p>
                      <p className="mt-1">{parsedPlan.toolsNeeded || "-"}</p>
                    </div>
                    <div className="rounded-md border border-border bg-background p-2 text-xs">
                      <p className="text-muted-foreground">Estimated</p>
                      <p className="mt-1">{parsedPlan.estimated || "-"}</p>
                    </div>
                    <div className="rounded-md border border-border bg-background p-2 text-xs">
                      <p className="text-muted-foreground">Risk</p>
                      <p className="mt-1">{parsedPlan.risk || "-"}</p>
                    </div>
                  </div>

                  {showPlanActions && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button onClick={onPlanAccept} disabled={planActionsDisabled} variant="outline" className="rounded-md">
                        Accept
                      </Button>
                      <Button onClick={onPlanDecline} disabled={planActionsDisabled} variant="outline" className="rounded-md">
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
                          variant="outline"
                          className="rounded-md"
                        >
                          {isEditingThisPlan ? "Close edit" : "Edit"}
                        </Button>
                      )}
                    </div>
                  )}

                  {canEditPlan && isEditingThisPlan && (
                    <div className="space-y-2 rounded-md border border-border bg-background p-3">
                      <p className="text-xs text-muted-foreground">Plan edit instruction</p>
                      <textarea
                        value={editInstructionDraft}
                        onChange={(event) => setEditInstructionDraft(event.target.value)}
                        placeholder="Example: make it formal and verify the contact name"
                        className="min-h-20 w-full rounded-md border border-border bg-background p-2 text-sm outline-none"
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
                          className="rounded-md"
                        >
                          Update plan
                        </Button>
                        <Button
                          onClick={() => {
                            setEditingPlanMessageId(null);
                            setEditInstructionDraft("");
                          }}
                          disabled={planActionsDisabled}
                          variant="outline"
                          className="rounded-md"
                        >
                          Cancel
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
                          return <code className="rounded bg-muted px-1.5 py-0.5">{children}</code>;
                        }

                        return (
                          <div className="relative">
                            <CopyButton text={value} />
                            <pre className="overflow-x-auto rounded-md border border-border bg-background p-3">
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
          </div>
        );
      })}
    </div>
  );
}