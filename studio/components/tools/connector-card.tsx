"use client";

import { Clock3, Link2, Link2Off } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ToolConnection } from "@/lib/api/client";

interface ToolCardProps {
  tool: ToolConnection;
  onToggle: (toolId: string) => void;
}

export function ConnectorCard({ tool, onToggle }: ToolCardProps) {
  const statusText = tool.status === "connecting" ? "connecting" : tool.status;
  const isBusy = tool.status === "connecting";

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex h-full flex-col justify-between gap-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-lg font-semibold">{tool.label}</p>
            <Badge variant={tool.connected ? "default" : "outline"}>{statusText}</Badge>
          </div>

          <p className="text-sm text-muted-foreground">
            {tool.connected
              ? "Connected and available for orchestration"
              : tool.status === "pending"
                ? "Authorization started. Finish OAuth to complete connection"
                : "Authorize this tool to let Horizon perform actions"}
          </p>

          {tool.persona && <p className="text-xs text-muted-foreground">Persona: {tool.persona}</p>}
          {tool.error && <p className="text-xs text-rose-600">{tool.error}</p>}

          {tool.lastUsed && (
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" />
              Last used {new Date(tool.lastUsed).toLocaleString()}
            </p>
          )}
        </div>

        <Button onClick={() => onToggle(tool.id)} disabled={isBusy} variant={tool.connected ? "outline" : "default"} className="rounded-md">
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
    </div>
  );
}