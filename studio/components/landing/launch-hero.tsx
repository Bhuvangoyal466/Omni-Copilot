"use client";

import Link from "next/link";
import { ArrowRight, Calendar, Github, Mail, NotepadText, Slack } from "lucide-react";

import { AI_Prompt } from "@/components/ui/animated-ai-input";
import { Button } from "@/components/ui/button";

const featureCards = [
  {
    title: "Email + Calendar",
    description: "Summarize Gmail threads, draft replies, and schedule follow-ups in one flow.",
    icon: Mail
  },
  {
    title: "Code + GitHub",
    description: "Open PR reviews, file diffs, and release notes from one chat-first workspace.",
    icon: Github
  },
  {
    title: "Notion + Slack",
    description: "Pull decisions from docs and instantly generate shareable team updates.",
    icon: NotepadText
  }
];

const quickActions = [
  { label: "Inbox sweep", icon: Mail, text: "Find critical unread emails" },
  { label: "Today plan", icon: Calendar, text: "Build a focus schedule from calendar" },
  { label: "PR digest", icon: Github, text: "Summarize assigned pull requests" },
  { label: "Workspace pulse", icon: Slack, text: "Create a channel update from Slack" }
];

export function LaunchHero() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Horizon Desk</p>
            <h1 className="mt-1 text-2xl font-semibold">A task workspace with sharper edges</h1>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="rounded-md">
              <Link href="/integrations">Integrations</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-md">
              <Link href="/light">Light</Link>
            </Button>
            <Button asChild className="rounded-md">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </header>

        <main className="grid flex-1 gap-8 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <section className="space-y-6">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">One place for mail, calendar, docs, code, and chat.</p>
              <h2 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
                Keep work organized with a focused command surface.
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Horizon reads your connected tools, prepares summaries, and helps you move between tasks without switching apps.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild className="rounded-md px-5">
                <Link href="/chat/new" className="inline-flex items-center gap-2">
                  Start chat
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-md px-5">
                <Link href="/memory">Open memory</Link>
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {quickActions.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-md border border-border bg-card p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{item.text}</p>
                  </div>
                );
              })}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {featureCards.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="rounded-md border border-border bg-card p-4">
                    <Icon className="h-5 w-5" />
                    <h3 className="mt-3 text-base font-semibold">{feature.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-4 rounded-md border border-border bg-card p-5">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Preview</p>
              <h2 className="mt-1 text-xl font-semibold">Try a prompt</h2>
              <p className="mt-2 text-sm text-muted-foreground">Use the same input style as the app, with a quieter layout.</p>
            </div>

            <AI_Prompt disabled placeholder="Summarize unread emails, meetings, and open PRs..." />

            <div className="rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
              The app keeps the same core actions, but the interface has a cleaner visual hierarchy.
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}