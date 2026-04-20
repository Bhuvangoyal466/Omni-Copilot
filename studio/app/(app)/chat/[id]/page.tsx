import { randomUUID } from "crypto";
import { redirect } from "next/navigation";

import { ConversationDesk } from "@/components/chat/conversation-desk";

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
  return <ConversationDesk chatId={decodeURIComponent(params.id)} initialPrompt={prompt} />;
}
