"use client";

import { Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ConnectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolLabel: string;
  isLoading?: boolean;
  onConfirm: () => Promise<void>;
}

export function LinkPanel({ open, onOpenChange, toolLabel, isLoading = false, onConfirm }: ConnectionModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border border-border bg-background">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <ShieldCheck className="h-5 w-5" />
            Connect {toolLabel}
          </DialogTitle>
          <DialogDescription>
            You will be redirected to the provider OAuth screen. After permission is granted, you will return to Integrations.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading} className="rounded-md">
            Cancel
          </Button>
          <Button
            onClick={async () => {
              await onConfirm();
            }}
            disabled={isLoading}
            className="rounded-md"
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