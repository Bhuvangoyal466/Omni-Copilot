"use client";

import { Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

interface ConnectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolLabel: string;
  isLoading?: boolean;
  onConfirm: () => Promise<void>;
}

export function ConnectionModal({
  open,
  onOpenChange,
  toolLabel,
  isLoading = false,
  onConfirm
}: ConnectionModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border border-border/70 bg-background/90 dark:border-white/15 dark:bg-black/70">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground dark:text-white">
            <ShieldCheck className="h-5 w-5 text-cyan-500" />
            Connect {toolLabel}
          </DialogTitle>
          <DialogDescription>
            We will redirect you to the provider OAuth screen. After permission grant, you will return to Integrations automatically.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            className="bg-cyan-300 text-black hover:bg-cyan-200"
            onClick={async () => {
              await onConfirm();
            }}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting...
              </span>
            ) : (
              "Continue to OAuth"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
