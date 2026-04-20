"use client";

import { useMemo } from "react";
import { useAppStore } from "@/lib/store/app-store";

export function useAgentStream() {
  const steps = useAppStore((s) => s.agentSteps);
  const clear = useAppStore((s) => s.clearAgentSteps);

  const inFlightCount = useMemo(
    () => steps.filter((step) => step.status === "running").length,
    [steps]
  );

  return {
    steps,
    inFlightCount,
    clear
  };
}
