import { randomUUID } from "crypto";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ChatIndexPage() {
  redirect(`/chat/${randomUUID().slice(0, 8)}`);
}
