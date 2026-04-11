"use client";

import { useEffect, useMemo } from "react";
import { connectIntegration, disconnectIntegration, fetchIntegrations } from "@/lib/api/client";
import { useAppStore } from "@/lib/store/app-store";

export function useTools() {
  const toolsMap = useAppStore((s) => s.connectedTools);
  const seedTools = useAppStore((s) => s.seedTools);
  const replaceTools = useAppStore((s) => s.replaceTools);
  const upsertTool = useAppStore((s) => s.upsertTool);
  const pushAuditAction = useAppStore((s) => s.pushAuditAction);

  useEffect(() => {
    seedTools();
  }, [seedTools]);

  useEffect(() => {
    let mounted = true;

    const syncIntegrations = async () => {
      try {
        const data = await fetchIntegrations();
        if (!mounted) {
          return;
        }
        replaceTools(data);
      } catch (error) {
        pushAuditAction({
          label: `Integration sync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          undoable: false
        });
      }
    };

    void syncIntegrations();
    return () => {
      mounted = false;
    };
  }, [replaceTools, pushAuditAction]);

  const tools = useMemo(() => Object.values(toolsMap), [toolsMap]);

  const connectTool = async (toolId: string) => {
    const current = toolsMap[toolId];
    if (!current) {
      return;
    }

    upsertTool({
      ...current,
      status: "connecting"
    });

    try {
      const callbackUrl = `${window.location.origin}/integrations`;
      const result = await connectIntegration(toolId, callbackUrl);
      upsertTool(result);

      if (result.authUrl) {
        window.location.href = result.authUrl;
        return;
      }

      pushAuditAction({
        label: `Connected ${result.label}`,
        undoable: true
      });
    } catch (error) {
      upsertTool({ ...current, status: "error" });
      pushAuditAction({
        label: `Connect failed for ${current.label}: ${error instanceof Error ? error.message : "Unknown error"}`,
        undoable: false
      });
    }
  };

  const disconnectTool = async (toolId: string) => {
    const current = toolsMap[toolId];
    if (!current) {
      return;
    }

    try {
      const result = await disconnectIntegration(toolId);
      upsertTool(result);
      pushAuditAction({
        label: `Disconnected ${result.label}`,
        undoable: true
      });
    } catch (error) {
      pushAuditAction({
        label: `Disconnect failed for ${current.label}: ${error instanceof Error ? error.message : "Unknown error"}`,
        undoable: false
      });
    }
  };

  return {
    tools,
    connectTool,
    disconnectTool
  };
}
