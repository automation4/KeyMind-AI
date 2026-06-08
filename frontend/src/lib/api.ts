import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

const TOKEN_KEY = "keymind_session_token";

export async function getToken(): Promise<string | null> {
  return await storage.secureGet<string>(TOKEN_KEY, "");
}

export async function setToken(token: string): Promise<void> {
  await storage.secureSet(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await storage.secureRemove(TOKEN_KEY);
}

async function request<T = any>(
  path: string,
  options: { method?: string; body?: any; auth?: boolean } = {},
): Promise<T> {
  const { method = "GET", body, auth = false } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  exchangeSession: (session_id: string) =>
    request<{ session_token: string; user: any }>("/auth/session", {
      method: "POST",
      body: { session_id },
    }),
  guest: () =>
    request<{ session_token: string; user: any }>("/auth/guest", { method: "POST" }),
  me: () => request<{ user: any }>("/auth/me", { auth: true }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST", auth: true }),

  tool: (tool: string, text: string, options: Record<string, any> = {}) =>
    request<{ tool: string; original: string; suggestions: string[]; explanation?: string }>(
      "/ai/tool",
      { method: "POST", body: { tool, text, options } },
    ),

  ocr: (image_base64: string) =>
    request<{ text: string }>("/ocr", { method: "POST", body: { image_base64 } }),

  tts: (text: string, voice?: string) =>
    request<{ audio_base64: string; voice: string; mime: string }>("/tts", {
      method: "POST",
      body: { text, voice },
    }),

  chat: (session_id: string, message: string) =>
    request<{ session_id: string; reply: string }>("/ai/chat", {
      method: "POST",
      body: { session_id, message },
    }),
  chatHistory: (session_id: string) =>
    request<{ session_id: string; messages: Array<{ role: string; content: string }> }>(
      `/ai/chat/${session_id}`,
    ),

  saveHistory: (tool: string, original: string, applied: string) =>
    request("/history", { method: "POST", body: { tool, original, applied }, auth: true }),
  getHistory: () => request<{ items: any[] }>("/history", { auth: true }),
  deleteHistory: (id: string) => request(`/history/${id}`, { method: "DELETE", auth: true }),
};
