"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { ToolCard } from "@/components/tools/tool-card";
import { ConnectionModal } from "@/components/tools/connection-modal";
import { useTools } from "@/lib/hooks/use-tools";

export default function IntegrationsPage() {
  const { tools, connectTool, disconnectTool } = useTools();
  const searchParams = useSearchParams();
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const selectedTool = useMemo(
    () => tools.find((tool) => tool.id === selectedToolId) ?? null,
    [selectedToolId, tools]
  );

  const oauthStatus = searchParams.get("status");
  const oauthTool = searchParams.get("integration");
  const oauthReason = searchParams.get("reason");

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-200/70">Integrations</p>
        <h1 className="text-2xl font-semibold text-foreground dark:text-white">Connect your tools</h1>
        <p className="text-sm text-muted-foreground dark:text-white/65">
          Authorize providers and let Omni orchestrate tasks across your workspace.
        </p>
        {oauthStatus && (
          <p className="mt-2 text-xs text-muted-foreground dark:text-white/60">
            OAuth status: <span className="font-semibold text-foreground dark:text-white">{oauthStatus}</span>
            {oauthTool ? ` (${oauthTool})` : ""}
            {oauthReason ? ` - ${decodeURIComponent(oauthReason)}` : ""}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tools.map((tool) => (
          <ToolCard
            key={tool.id}
            tool={tool}
            onToggle={(toolId) => {
              const current = tools.find((item) => item.id === toolId);
              if (!current) {
                return;
              }

              if (current.connected) {
                void disconnectTool(toolId);
              } else {
                setSelectedToolId(toolId);
              }
            }}
          />
        ))}
      </div>

      {selectedTool && (
        <ConnectionModal
          open={Boolean(selectedTool)}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedToolId(null);
            }
          }}
          toolLabel={selectedTool.label}
          isLoading={isConnecting}
          onConfirm={async () => {
            setIsConnecting(true);
            try {
              await connectTool(selectedTool.id);
              setSelectedToolId(null);
            } finally {
              setIsConnecting(false);
            }
          }}
        />
      )}
    </div>
  );
}
