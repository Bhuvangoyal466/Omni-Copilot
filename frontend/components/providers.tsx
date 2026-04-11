"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { SessionProvider } from "next-auth/react";
import { useEffect, useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 30_000
          }
        }
      })
  );

  useEffect(() => {
    const isMetaMaskNoise = (text: string) => {
      const normalized = text.toLowerCase();
      return normalized.includes("metamask") || normalized.includes("chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn");
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      let serializedReason = "";
      if (typeof reason !== "string" && !(reason instanceof Error)) {
        try {
          serializedReason = JSON.stringify(reason ?? "");
        } catch {
          serializedReason = String(reason ?? "");
        }
      }
      const reasonMessage =
        typeof reason === "string"
          ? reason
          : reason instanceof Error
            ? `${reason.message} ${reason.stack || ""}`
            : serializedReason;

      if (isMetaMaskNoise(reasonMessage)) {
        event.preventDefault();
      }
    };

    const onWindowError = (event: ErrorEvent) => {
      const composed = `${event.message || ""} ${event.filename || ""}`;
      if (isMetaMaskNoise(composed)) {
        event.preventDefault();
      }
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onWindowError);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onWindowError);
    };
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <SessionProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
