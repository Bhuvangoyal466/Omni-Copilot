"use client";

import { cn } from "@/lib/utils";

export function AuroraOrbBackground({ className }: { className?: string }) {
  return <div className={cn("absolute inset-0 overflow-hidden pointer-events-none bg-muted/20", className)} aria-hidden="true" />;
}