"use client";

import { useMemo, useState } from "react";
import { Brain, CalendarClock, Mail, NotebookPen, Save } from "lucide-react";

import RadialOrbitalTimeline from "@/components/ui/radial-orbital-timeline";
import { Button } from "@/components/ui/button";

interface MemoryItem {
  id: string;
  label: string;
  value: string;
}

const initialMemory: MemoryItem[] = [
  { id: "tone", label: "Preferred writing tone", value: "Concise and professional" },
  { id: "timezone", label: "Timezone", value: "Asia/Kolkata" },
  { id: "focus", label: "Current focus", value: "Horizon Desk launch sprint" },
  { id: "channels", label: "Daily channels", value: "Gmail, Slack, GitHub" }
];

export default function MemoryPage() {
  const [memory, setMemory] = useState<MemoryItem[]>(initialMemory);
  const [showOrbit, setShowOrbit] = useState(false);

  const orbitData = useMemo(
    () => [
      { id: 1, title: "Inbox", date: "Today", content: "3 priority emails summarized and tagged for follow-up.", category: "mail", icon: Mail, relatedIds: [2, 3], status: "completed" as const, energy: 86 },
      { id: 2, title: "Calendar", date: "Today", content: "Prepared meeting context from recent project activity.", category: "calendar", icon: CalendarClock, relatedIds: [1, 4], status: "in-progress" as const, energy: 62 },
      { id: 3, title: "Notes", date: "Yesterday", content: "Extracted action items from shared docs and notes.", category: "docs", icon: NotebookPen, relatedIds: [1], status: "completed" as const, energy: 71 },
      { id: 4, title: "Memory", date: "Now", content: "Updated persistent profile with tool preferences and intent patterns.", category: "memory", icon: Brain, relatedIds: [2], status: "pending" as const, energy: 45 }
    ],
    []
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2 border-b border-border pb-4">
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Memory</p>
        <h1 className="text-2xl font-semibold">Personal memory</h1>
        <p className="text-sm text-muted-foreground">Review and edit the context Omni stores for better long-term assistance.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {memory.map((item) => (
          <div key={item.id} className="rounded-md border border-border bg-card p-4">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{item.label}</p>
              <textarea
                value={item.value}
                onChange={(event) => {
                  const value = event.target.value;
                  setMemory((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, value } : entry)));
                }}
                className="min-h-[88px] w-full resize-none rounded-md border border-border bg-background p-3 text-sm outline-none"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button className="rounded-md">
          <Save className="mr-2 h-4 w-4" />
          Save memory edits
        </Button>

        <Button variant="outline" className="rounded-md" onClick={() => setShowOrbit((prev) => !prev)}>
          {showOrbit ? "Hide" : "Show"} orbital memory map
        </Button>
      </div>

      {showOrbit && (
        <div className="overflow-hidden rounded-md border border-border">
          <RadialOrbitalTimeline timelineData={orbitData} />
        </div>
      )}
    </div>
  );
}