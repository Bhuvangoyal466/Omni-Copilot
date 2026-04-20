"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    setIsLoading(true);
    await signIn("google", { callbackUrl: "/chat/new" });
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-background px-4 py-12 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-md items-center">
        <div className="w-full rounded-md border border-border bg-card p-6 sm:p-8">
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Sign in</p>
              <h1 className="mt-1 text-3xl font-semibold">Horizon Desk</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Use Google to access your connected tools and continue into the workspace.
              </p>
            </div>

            <Button onClick={handleSignIn} disabled={isLoading} className="h-11 w-full rounded-md">
              {isLoading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Connecting...
                </span>
              ) : (
                "Continue with Google"
              )}
            </Button>

            <p className="text-xs text-muted-foreground">
              By continuing, you allow Horizon Desk to request access to your connected tools.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}