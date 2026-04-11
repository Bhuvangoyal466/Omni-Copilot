import { auth } from "@/auth";

const BACKEND_URL = process.env.BACKEND_API_URL || "http://localhost:8000";

export const runtime = "nodejs";

interface RouteContext {
  params: {
    toolId: string;
  };
}

export async function POST(_request: Request, { params }: RouteContext) {
  const session = await auth();
  const userId = session?.user?.email;

  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const upstream = await fetch(`${BACKEND_URL}/api/integrations/${encodeURIComponent(params.toolId)}/disconnect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ userId }),
    cache: "no-store"
  });

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "application/json"
    }
  });
}
