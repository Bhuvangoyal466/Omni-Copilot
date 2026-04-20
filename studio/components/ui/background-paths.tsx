"use client";

import { Button } from "@/components/ui/button";

export function BackgroundPaths({
  title = "Background Paths",
  showContent = true
}: {
  title?: string;
  showContent?: boolean;
}) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      <div className="absolute inset-0 bg-muted/20" />
      {showContent && (
        <div className="relative z-10 flex min-h-screen items-center justify-center px-4 text-center">
          <div className="max-w-xl space-y-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
            <h1 className="text-4xl font-semibold sm:text-6xl">Simple workspace background</h1>
            <Button variant="outline" className="rounded-md px-5">
              Open workspace
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}