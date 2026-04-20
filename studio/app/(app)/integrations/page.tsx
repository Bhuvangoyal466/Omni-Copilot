"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { ConnectorCard } from "@/components/tools/connector-card";
import { LinkPanel } from "@/components/tools/link-panel";
import { useTools } from "@/lib/hooks/use-tools";

export default function IntegrationsPage() {
  const { tools, connectTool, disconnectTool } = useTools();
  const searchParams = useSearchParams();
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const selectedTool = useMemo(() => tools.find((tool) => tool.id === selectedToolId) ?? null, [selectedToolId, tools]);

  const oauthStatus = searchParams.get("status");
  const oauthTool = searchParams.get("integration");
  const oauthReason = searchParams.get("reason");

  return (
    <div className="space-y-6">
      <div className="space-y-2 border-b border-border pb-4">
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Integrations</p>
        <h1 className="text-2xl font-semibold">Connected tools</h1>
        <p className="text-sm text-muted-foreground">Authorize providers and let Horizon route tasks across your workspace.</p>
        {oauthStatus && (
          <p className="text-xs text-muted-foreground">
            OAuth status: <span className="font-semibold text-foreground">{oauthStatus}</span>
            {oauthTool ? ` (${oauthTool})` : ""}
            {oauthReason ? ` - ${decodeURIComponent(oauthReason)}` : ""}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tools.map((tool) => (
          <ConnectorCard
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
        <LinkPanel
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