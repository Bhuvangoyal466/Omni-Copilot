import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ShellChrome } from "@/components/sidebar/shell-chrome";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return <ShellChrome>{children}</ShellChrome>;
}
