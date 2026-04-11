import { randomUUID } from "crypto";
import { redirect } from "next/navigation";

import { ChatWorkspace } from "@/components/chat/chat-workspace";

export const dynamic = "force-dynamic";

interface ChatPageProps {
  params: {
    id: string;
  };
  searchParams?: {
    prompt?: string;
  };
}

export default function ChatPage({ params, searchParams }: ChatPageProps) {
  if (params.id === "new") {
    redirect(`/chat/${randomUUID().slice(0, 8)}`);
  }

  const prompt = typeof searchParams?.prompt === "string" ? searchParams.prompt : "";
  return <ChatWorkspace chatId={decodeURIComponent(params.id)} initialPrompt={prompt} />;
}
