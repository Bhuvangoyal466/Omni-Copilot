"use client";

import { CheckCircle2, History, Moon, RotateCcw, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store/app-store";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  const selectedModel = useAppStore((s) => s.selectedModel);
  const setSelectedModel = useAppStore((s) => s.setSelectedModel);
  const auditLog = useAppStore((s) => s.auditLog);
  const markAuditUndone = useAppStore((s) => s.markAuditUndone);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-200/70">Settings</p>
        <h1 className="text-2xl font-semibold text-foreground dark:text-white">Workspace controls</h1>
        <p className="text-sm text-muted-foreground dark:text-white/65">Manage model preferences, appearance, and action history.</p>
      </div>

      <section className="rounded-3xl border border-border/70 bg-background/70 p-5 backdrop-blur-xl dark:border-white/15 dark:bg-black/35">
        <h2 className="mb-3 text-sm font-semibold text-foreground dark:text-white">Model and interface</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground dark:text-white/60">Primary model</span>
            <select
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              className="h-11 w-full rounded-xl border border-border/70 bg-background/70 px-3 text-sm text-foreground outline-none dark:border-white/20 dark:bg-white/5 dark:text-white"
            >
              <option value="llama-3.3-70b-versatile">Groq Llama 3.3 70B</option>
              <option value="gpt-5.4-mini">OpenAI GPT-5.4 Mini</option>
              <option value="gpt-5.4">OpenAI GPT-5.4</option>
              <option value="qwen-qwq-32b">Groq Qwen QwQ 32B</option>
              <option value="deepseek-r1-distill-llama-70b">Groq DeepSeek R1 Distill Llama 70B</option>
            </select>
          </label>

          <div className="space-y-1">
            <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground dark:text-white/60">Theme</span>
            <div className="flex gap-2">
              <Button
                onClick={() => setTheme("dark")}
                variant={theme === "dark" ? "default" : "secondary"}
                className={theme === "dark" ? "bg-cyan-300 text-black hover:bg-cyan-200" : "bg-secondary/80 text-secondary-foreground"}
              >
                <Moon className="mr-2 h-4 w-4" />
                Dark
              </Button>
              <Button
                onClick={() => setTheme("light")}
                variant={theme === "light" ? "default" : "secondary"}
                className={theme === "light" ? "bg-cyan-300 text-black hover:bg-cyan-200" : "bg-secondary/80 text-secondary-foreground"}
              >
                <Sun className="mr-2 h-4 w-4" />
                Light
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section id="audit" className="rounded-3xl border border-border/70 bg-background/70 p-5 backdrop-blur-xl dark:border-white/15 dark:bg-black/35">
        <div className="mb-4 flex items-center gap-2">
          <History className="h-4 w-4 text-cyan-600 dark:text-cyan-200" />
          <h2 className="text-sm font-semibold text-foreground dark:text-white">Action history</h2>
        </div>

        <div className="space-y-2">
          {auditLog.length === 0 && <p className="text-sm text-muted-foreground dark:text-white/55">No actions recorded yet.</p>}

          {auditLog.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/65 px-3 py-2 dark:border-white/10 dark:bg-white/5"
            >
              <div>
                <p className="text-sm text-foreground dark:text-white/90">{entry.label}</p>
                <p className="text-xs text-muted-foreground dark:text-white/55">{new Date(entry.createdAt).toLocaleString()}</p>
              </div>

              {entry.undoable && !entry.undone ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => markAuditUndone(entry.id)}
                  className="bg-secondary/80 text-secondary-foreground hover:bg-secondary"
                >
                  <RotateCcw className="mr-2 h-3.5 w-3.5" />
                  Undo
                </Button>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {entry.undone ? "Undone" : "Recorded"}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
