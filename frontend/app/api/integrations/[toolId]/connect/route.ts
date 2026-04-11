import { auth } from "@/auth";

const BACKEND_URL = process.env.BACKEND_API_URL || "http://localhost:8000";

export const runtime = "nodejs";

interface RouteContext {
  params: {
    toolId: string;
  };
}

export async function POST(request: Request, { params }: RouteContext) {
  const session = await auth();
  const userId = session?.user?.email;

  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  let frontendCallbackUrl: string | undefined;
  try {
    const body = await request.json();
    frontendCallbackUrl = typeof body?.frontendCallbackUrl === "string" ? body.frontendCallbackUrl : undefined;
  } catch {
    frontendCallbackUrl = undefined;
  }

  const upstream = await fetch(`${BACKEND_URL}/api/integrations/${encodeURIComponent(params.toolId)}/connect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      userId,
      frontendCallbackUrl
    }),
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
