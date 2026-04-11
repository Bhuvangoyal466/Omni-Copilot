"use client";

import { Clock3, Link2, Link2Off } from "lucide-react";

import { GlowCard } from "@/components/ui/spotlight-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ToolConnection } from "@/lib/api/client";

interface ToolCardProps {
  tool: ToolConnection;
  onToggle: (toolId: string) => void;
}

export function ToolCard({ tool, onToggle }: ToolCardProps) {
  const statusText = tool.status === "connecting" ? "connecting" : tool.status;
  const isBusy = tool.status === "connecting";

  return (
    <GlowCard
      glowColor={tool.connected ? "green" : "blue"}
      customSize
      className="min-h-[230px] rounded-2xl border border-border/70 bg-background/70 p-5 backdrop-blur-xl dark:border-white/15 dark:bg-black/35"
    >
      <div className="flex h-full flex-col justify-between">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-lg font-semibold text-foreground dark:text-white">{tool.label}</p>
            <Badge
              variant={tool.connected ? "default" : "outline"}
              className={tool.connected ? "bg-emerald-400 text-black" : "text-foreground/80 dark:text-white/80"}
            >
              {statusText}
            </Badge>
          </div>

          <p className="text-sm text-muted-foreground dark:text-white/65">
            {tool.connected
              ? "Connected and available for orchestration"
              : tool.status === "pending"
                ? "Authorization started. Finish OAuth to complete connection"
                : "Authorize this tool to let Omni perform actions"}
          </p>

          {tool.persona && (
            <p className="text-xs text-muted-foreground/90 dark:text-white/55">Persona: {tool.persona}</p>
          )}

          {tool.error && <p className="text-xs text-rose-600 dark:text-rose-300">{tool.error}</p>}

          {tool.lastUsed && (
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground dark:text-white/50">
              <Clock3 className="h-3.5 w-3.5" />
              Last used {new Date(tool.lastUsed).toLocaleString()}
            </p>
          )}
        </div>

        <Button
          onClick={() => onToggle(tool.id)}
          disabled={isBusy}
          variant={tool.connected ? "secondary" : "default"}
          className={tool.connected ? "bg-secondary/80 text-secondary-foreground hover:bg-secondary" : "bg-cyan-300 text-black hover:bg-cyan-200"}
        >
          {isBusy ? (
            <span className="inline-flex items-center gap-2">Connecting...</span>
          ) : tool.connected ? (
            <span className="inline-flex items-center gap-2">
              <Link2Off className="h-4 w-4" />
              Disconnect
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Connect
            </span>
          )}
        </Button>
      </div>
    </GlowCard>
  );
}
