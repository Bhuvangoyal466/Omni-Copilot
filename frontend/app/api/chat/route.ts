import { NextRequest } from "next/server";
import { auth } from "@/auth";

const BACKEND_URL = process.env.BACKEND_API_URL || "http://localhost:8000";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const session = await auth();
    const userId = session?.user?.email || "anonymous";

    const upstream = await fetch(`${BACKEND_URL}/api/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Omni-User-Id": userId
      },
      body,
      cache: "no-store"
    });

    if (!upstream.ok || !upstream.body) {
      return new Response(JSON.stringify({ error: "Unable to connect to backend stream" }), {
        status: upstream.status || 500,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backend connection failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
}
