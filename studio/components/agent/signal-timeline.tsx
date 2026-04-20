"use client";

import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";

import type { AgentStep } from "@/lib/api/client";

interface AgentTimelineProps {
  steps: AgentStep[];
}

const statusStyles: Record<AgentStep["status"], { icon: React.ReactNode; color: string }> = {
  running: { icon: <CircleDashed className="h-4 w-4" />, color: "text-foreground" },
  completed: { icon: <CheckCircle2 className="h-4 w-4" />, color: "text-foreground" },
  failed: { icon: <XCircle className="h-4 w-4" />, color: "text-foreground" }
};

export function SignalTimeline({ steps }: AgentTimelineProps) {
  return (
    <div className="space-y-3">
      {steps.length === 0 && <p className="text-sm text-muted-foreground">Waiting for the first orchestration step.</p>}

      {steps.map((step) => (
        <div key={step.id} className="rounded-md border border-border bg-background p-3">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{step.agent}</p>
              <p className="text-sm">{step.message}</p>
            </div>

            <span className={statusStyles[step.status].color}>{statusStyles[step.status].icon}</span>
          </div>

          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${step.status === "failed" ? "bg-rose-500" : step.status === "completed" ? "bg-emerald-500" : "bg-foreground"}`}
              style={{ width: step.status === "running" ? "65%" : "100%" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}