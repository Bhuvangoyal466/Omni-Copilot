"use client";

import { useMemo, useState } from "react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Calendar, Github, Mail, NotepadText, PanelLeft, Settings, Slack } from "lucide-react";

import { RailSidebar } from "@/components/ui/rail-sidebar";
import { CommandBoard, type OmniItem, type OmniSource } from "@/components/ui/command-board";
import { createNewChatHref } from "@/lib/utils";

export function ShellChrome({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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
    <div className="min-h-screen bg-background text-foreground">
      <RailSidebar onSignOut={() => signOut({ callbackUrl: "/login" })} />

      <CommandBoard open={openPalette} onOpenChange={setOpenPalette} sources={paletteSources} />

      <div className="lg:pl-[240px]">
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-sm font-semibold">
                HD
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Workspace</p>
                <h2 className="text-sm font-medium">Horizon Desk</h2>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setOpenPalette(true)}
                className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
              >
                <PanelLeft className="h-4 w-4" />
                Search
              </button>
              <button
                onClick={() => router.push("/settings" as Route)}
                className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
              >
                <Settings className="h-4 w-4" />
                Settings
              </button>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <nav className="grid grid-cols-4 gap-2 border-b border-border px-4 py-3 text-xs sm:hidden">
          {[
            ["/chat/new", "Chat"],
            ["/integrations", "Tools"],
            ["/memory", "Memory"],
            ["/settings", "Settings"]
          ].map(([href, label]) => {
            const active = pathname.startsWith(href === "/chat/new" ? "/chat" : href);
            return (
              <button
                key={href}
                onClick={() => router.push(href as Route)}
                className={`rounded-md border px-2 py-2 text-center ${active ? "border-foreground bg-foreground text-background" : "border-border bg-card"}`}
              >
                {label}
              </button>
            );
          })}
        </nav>

        <main className="px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
