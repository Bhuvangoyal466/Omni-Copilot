import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_API_URL || "http://localhost:8000";

export const runtime = "nodejs";

interface RouteContext {
  params: {
    toolId: string;
  };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const query = request.nextUrl.search || "";
  const redirectTarget = `${BACKEND_URL}/api/integrations/${encodeURIComponent(params.toolId)}/callback${query}`;
  return NextResponse.redirect(redirectTarget, { status: 307 });
}
