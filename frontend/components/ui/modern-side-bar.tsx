"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Route } from "next";
import {
  BookUser,
  Brain,
  ChevronLeft,
  ChevronRight,
  Command,
  LogOut,
  Menu,
  MessageSquareText,
  PlugZap,
  Settings,
  Sparkles,
  X
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

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

export function Sidebar({ className = "", onSignOut }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const messagesByChat = useAppStore((s) => s.messagesByChat);
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const onResize = () => setIsOpen(window.innerWidth >= 1024);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
      .slice(0, 12);
  }, [messagesByChat]);

  return (
    <>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed left-4 top-4 z-50 rounded-xl border border-border/70 bg-background/85 p-2 text-foreground backdrop-blur-xl lg:hidden dark:border-white/20 dark:bg-black/60 dark:text-white"
        aria-label="Toggle navigation"
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{
          width: isCollapsed ? 84 : 280,
          x: isOpen ? 0 : -320
        }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className={`fixed inset-y-0 left-0 z-40 flex h-full flex-col border-r border-border/70 bg-background/80 backdrop-blur-2xl dark:border-white/10 dark:bg-black/50 lg:translate-x-0 ${className}`}
      >
        <div className="flex items-center justify-between border-b border-border/70 p-4 dark:border-white/10">
          <AnimatePresence mode="wait">
            {!isCollapsed ? (
              <motion.div
                key="brand-full"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-center gap-3"
              >
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 text-black shadow-lg shadow-cyan-900/40">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground dark:text-white">Omni Copilot</p>
                  <p className="text-xs text-muted-foreground dark:text-white/60">Universal agent</p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="brand-compact"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 text-black"
              >
                <Sparkles className="h-5 w-5" />
              </motion.div>
            )}
          </AnimatePresence>

          <button
            className="hidden rounded-lg p-1 text-foreground/70 transition hover:bg-accent hover:text-foreground dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white lg:block"
            onClick={() => setIsCollapsed((prev) => !prev)}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
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
                  if (window.innerWidth < 1024) {
                    setIsOpen(false);
                  }
                }}
                className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                  isActive
                    ? "bg-foreground text-background shadow-md"
                    : "text-foreground/80 hover:bg-accent hover:text-foreground dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white"
                } ${isCollapsed ? "justify-center" : ""}`}
                title={isCollapsed ? item.name : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!isCollapsed && <span className="truncate">{item.name}</span>}
                {!isCollapsed && item.badge && (
                  <span className="ml-auto rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-semibold text-inherit">
                    {item.badge}
                  </span>
                )}

                {isCollapsed && (
                  <span className="pointer-events-none absolute left-full ml-2 hidden whitespace-nowrap rounded-md border border-border/70 bg-background/95 px-2 py-1 text-xs text-foreground shadow-md group-hover:block dark:border-white/10 dark:bg-black/90 dark:text-white">
                    {item.name}
                  </span>
                )}
              </button>
            );
          })}

          {!isCollapsed && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between px-2">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground dark:text-white/55">
                  Recent Chats
                </p>
                <button
                  className="text-xs text-cyan-600 hover:underline dark:text-cyan-300"
                  onClick={() => {
                    router.push(createNewChatHref() as Route);
                  }}
                >
                  New
                </button>
              </div>

              <div className="space-y-1">
                {recentChats.length === 0 && (
                  <p className="px-2 py-1 text-xs text-muted-foreground dark:text-white/45">No chats yet</p>
                )}

                {recentChats.map((chat) => {
                  const isActiveChat = pathname === `/chat/${chat.id}`;
                  return (
                    <button
                      key={chat.id}
                      onClick={() => {
                        router.push(`/chat/${chat.id}` as Route);
                        if (window.innerWidth < 1024) {
                          setIsOpen(false);
                        }
                      }}
                      className={`w-full rounded-lg px-2 py-1.5 text-left text-xs transition ${
                        isActiveChat
                          ? "bg-cyan-500/20 text-cyan-700 dark:text-cyan-200"
                          : "text-foreground/75 hover:bg-accent dark:text-white/70 dark:hover:bg-white/10"
                      }`}
                      title={chat.title}
                    >
                      <p className="truncate">{chat.title}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        <div className="space-y-2 border-t border-border/70 p-3 dark:border-white/10">
          <button
            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground/70 transition hover:bg-accent hover:text-foreground dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white ${
              isCollapsed ? "justify-center" : ""
            }`}
            onClick={() => router.push("/chat/new")}
          >
            <Command className="h-4 w-4" />
            {!isCollapsed && <span>Command Palette</span>}
          </button>

          <button
            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-rose-300 transition hover:bg-rose-500/20 hover:text-rose-200 ${
              isCollapsed ? "justify-center" : ""
            }`}
            onClick={onSignOut}
          >
            <LogOut className="h-4 w-4" />
            {!isCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </motion.aside>
    </>
  );
}
