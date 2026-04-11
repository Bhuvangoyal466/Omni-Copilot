import { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_API_URL || "http://localhost:8000";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();

    const upstream = await fetch(`${BACKEND_URL}/api/voice/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body,
      cache: "no-store"
    });

    const payload = await upstream.text();
    return new Response(payload, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "application/json"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice proxy failed";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 502,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
}
