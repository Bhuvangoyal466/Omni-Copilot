"use client";

import { useMemo, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Command, Github, Mail, NotepadText, Slack, Calendar } from "lucide-react";

import { Sidebar } from "@/components/ui/modern-side-bar";
import { BackgroundPaths } from "@/components/ui/background-paths";
import { OmniCommandPalette, type OmniItem, type OmniSource } from "@/components/ui/omni-command-palette";
import { OmniVoiceLauncher } from "@/components/voice";
import { createNewChatHref } from "@/lib/utils";

export function AppChrome({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [openPalette, setOpenPalette] = useState(false);

  const paletteSources = useMemo<OmniSource[]>(
    () => [
      {
        id: "navigation",
        label: "Navigation",
        fetch: async () => {
          const items: OmniItem[] = [
            {
              id: "nav-chat",
              groupId: "navigation",
              label: "Open Chat",
              subtitle: "Start a new universal agent conversation",
              href: createNewChatHref() as Route,
              shortcut: ["G", "C"],
              pinned: true
            },
            {
              id: "nav-integrations",
              groupId: "navigation",
              label: "Open Integrations",
              subtitle: "Connect Gmail, Notion, GitHub, Slack and more",
              href: "/integrations",
              shortcut: ["G", "I"],
              pinned: true
            },
            {
              id: "nav-memory",
              groupId: "navigation",
              label: "Open Memory",
              subtitle: "View and edit what Omni remembers",
              href: "/memory",
              shortcut: ["G", "M"]
            },
            {
              id: "nav-settings",
              groupId: "navigation",
              label: "Open Settings",
              subtitle: "Configure model, streaming and profile",
              href: "/settings",
              shortcut: ["G", "S"]
            }
          ];

          return items;
        }
      },
      {
        id: "tools",
        label: "Quick Tool Actions",
        fetch: async () => {
          const items: OmniItem[] = [
            {
              id: "tool-gmail",
              groupId: "tools",
              label: "Search Gmail",
              subtitle: "Find unread emails from today",
              icon: <Mail className="h-4 w-4" />,
              onAction: () => router.push(createNewChatHref("Search my unread Gmail messages") as Route)
            },
            {
              id: "tool-calendar",
              groupId: "tools",
              label: "Plan Today",
              subtitle: "Summarize my meetings and prep notes",
              icon: <Calendar className="h-4 w-4" />,
              onAction: () => router.push(createNewChatHref("Summarize my calendar for today") as Route)
            },
            {
              id: "tool-github",
              groupId: "tools",
              label: "Review GitHub PRs",
              subtitle: "Check open pull requests assigned to me",
              icon: <Github className="h-4 w-4" />,
              onAction: () => router.push(createNewChatHref("List my assigned open GitHub PRs") as Route)
            },
            {
              id: "tool-notion",
              groupId: "tools",
              label: "Summarize Notion Notes",
              subtitle: "Generate action items from meeting notes",
              icon: <NotepadText className="h-4 w-4" />,
              onAction: () => router.push(createNewChatHref("Summarize my Notion meeting notes") as Route)
            },
            {
              id: "tool-slack",
              groupId: "tools",
              label: "Digest Slack",
              subtitle: "Provide key updates from #team channel",
              icon: <Slack className="h-4 w-4" />,
              onAction: () => router.push(createNewChatHref("Create a digest from Slack team channel") as Route)
            }
          ];

          return items;
        }
      }
    ],
    [router]
  );

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-55">
        <BackgroundPaths title="Omni" showContent={false} />
      </div>

      <Sidebar
        onSignOut={() => signOut({ callbackUrl: "/login" })}
        className="shadow-2xl shadow-cyan-950/20"
      />

      <OmniCommandPalette
        open={openPalette}
        onOpenChange={setOpenPalette}
        sources={paletteSources}
      />

      <OmniVoiceLauncher />

      <div className="relative z-10 lg:pl-[280px]">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/70 bg-background/75 px-4 py-3 backdrop-blur-xl sm:px-6 dark:border-white/10 dark:bg-black/35">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-200/70">Omni Workspace</p>
            <h2 className="text-sm font-medium text-foreground dark:text-white">Universal AI Operations</h2>
          </div>

          <button
            onClick={() => setOpenPalette(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-2.5 py-2 text-sm text-foreground/80 transition hover:bg-accent sm:px-3 dark:border-white/20 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10"
          >
            <Command className="h-4 w-4" />
            <span className="hidden sm:inline">Cmd+K</span>
            <span className="sm:hidden">⌘K</span>
          </button>
        </header>

        <main className="px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
