"use client";

import React, { useMemo } from "react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { BookUser, Brain, LogOut, MessageSquareText, PlugZap, PlusCircle, Settings } from "lucide-react";

import { useAppStore } from "@/lib/store/app-store";
import { createNewChatHref } from "@/lib/utils";

interface NavigationItem {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  badge?: string;
}

interface SidebarProps {
  className?: string;
  onSignOut?: () => void;
}

const navigationItems: NavigationItem[] = [
  { id: "chat", name: "Chat", icon: MessageSquareText, href: "/chat/new" },
  { id: "integrations", name: "Integrations", icon: PlugZap, href: "/integrations", badge: "9" },
  { id: "memory", name: "Memory", icon: Brain, href: "/memory" },
  { id: "history", name: "History", icon: BookUser, href: "/settings#audit" },
  { id: "settings", name: "Settings", icon: Settings, href: "/settings" }
];

export function RailSidebar({ className = "", onSignOut }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const messagesByChat = useAppStore((s) => s.messagesByChat);

  const activeItem = useMemo(() => {
    if (pathname.startsWith("/integrations")) return "integrations";
    if (pathname.startsWith("/memory")) return "memory";
    if (pathname.startsWith("/settings")) return "settings";
    return "chat";
  }, [pathname]);

  const recentChats = useMemo(() => {
    return Object.entries(messagesByChat)
      .map(([chatId, messages]) => {
        const lastMessage = messages[messages.length - 1];
        const firstUser = messages.find((msg) => msg.role === "user")?.content || "New chat";
        const title = firstUser.length > 38 ? `${firstUser.slice(0, 38)}...` : firstUser;
        return {
          id: chatId,
          title,
          updatedAt: lastMessage?.createdAt || ""
        };
      })
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .slice(0, 8);
  }, [messagesByChat]);

  return (
    <aside className={`fixed inset-y-0 left-0 z-30 hidden w-[240px] flex-col border-r border-border bg-card lg:flex ${className}`}>
      <div className="border-b border-border p-4">
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Navigation</p>
        <p className="mt-1 text-sm text-foreground">Horizon Desk</p>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;

          return (
            <button
              key={item.id}
              onClick={() => {
                const targetHref = item.id === "chat" ? createNewChatHref() : item.href;
                router.push(targetHref as Route);
              }}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${isActive ? "bg-foreground text-background" : "text-foreground hover:bg-secondary"}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.name}</span>
              {item.badge && <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold">{item.badge}</span>}
            </button>
          );
        })}

        <div className="mt-4 border-t border-border pt-4">
          <div className="flex items-center justify-between px-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Recent chats</p>
            <button
              className="inline-flex items-center gap-1 text-xs hover:underline"
              onClick={() => router.push(createNewChatHref() as Route)}
            >
              <PlusCircle className="h-3.5 w-3.5" />
              New
            </button>
          </div>

          <div className="mt-2 space-y-1">
            {recentChats.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">No chats yet</p>}

            {recentChats.map((chat) => {
              const isActiveChat = pathname === `/chat/${chat.id}`;
              return (
                <button
                  key={chat.id}
                  onClick={() => router.push(`/chat/${chat.id}` as Route)}
                  className={`w-full rounded-md px-2 py-1.5 text-left text-xs ${isActiveChat ? "bg-secondary font-medium" : "hover:bg-secondary"}`}
                  title={chat.title}
                >
                  <p className="truncate">{chat.title}</p>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <div className="border-t border-border p-3">
        <button
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-secondary"
          onClick={() => router.push("/chat/new")}
        >
          <MessageSquareText className="h-4 w-4" />
          New chat
        </button>

        <button
          className="mt-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-secondary"
          onClick={onSignOut}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}