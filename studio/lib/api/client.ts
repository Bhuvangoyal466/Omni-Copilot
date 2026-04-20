export type ChatRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface AgentStep {
  id: string;
  agent: string;
  message: string;
  status: "running" | "completed" | "failed";
  createdAt: string;
}

export interface ToolConnection {
  id: string;
  label: string;
  connected: boolean;
  status: "connected" | "disconnected" | "error" | "pending" | "connecting";
  lastUsed?: string;
  provider?: string;
  persona?: string;
  authUrl?: string | null;
  error?: string | null;
}

export interface AuditAction {
  id: string;
  label: string;
  createdAt: string;
  undoable: boolean;
  undone?: boolean;
}

export interface StreamEnvelope<T = unknown> {
  event: string;
  data: T;
}

export interface ChatRequestPayload {
  chatId: string;
  message: string;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    throw new Error("Empty response");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Invalid JSON response");
  }
}

export async function fetchIntegrations(): Promise<ToolConnection[]> {
  const response = await fetch("/api/integrations", { method: "GET", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load integrations (${response.status})`);
  }
  return readJson<ToolConnection[]>(response);
}

export async function connectIntegration(toolId: string, frontendCallbackUrl: string): Promise<ToolConnection> {
  const response = await fetch(`/api/integrations/${encodeURIComponent(toolId)}/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ frontendCallbackUrl })
  });

  if (!response.ok) {
    const payload: { detail?: string; error?: string } = await readJson<{ detail?: string; error?: string }>(
      response
    ).catch(() => ({}));
    const message = payload.detail || payload.error || `Failed to connect ${toolId}`;
    throw new Error(message);
  }

  return readJson<ToolConnection>(response);
}

export async function disconnectIntegration(toolId: string): Promise<ToolConnection> {
  const response = await fetch(`/api/integrations/${encodeURIComponent(toolId)}/disconnect`, {
    method: "POST"
  });

  if (!response.ok) {
    const payload: { detail?: string; error?: string } = await readJson<{ detail?: string; error?: string }>(
      response
    ).catch(() => ({}));
    const message = payload.detail || payload.error || `Failed to disconnect ${toolId}`;
    throw new Error(message);
  }

  return readJson<ToolConnection>(response);
}
