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

  // FormData (multipart/file uploads) needs the runtime to set its own
  // Content-Type with the boundary. If we set application/json we'd corrupt
  // the upload, so detect FormData and skip JSON serialisation entirely.
  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;

  const headers: Record<string, string> = {};
  if (!isFormData) headers["Content-Type"] = "application/json";

  // Always send auth if a token exists — backend uses it to track per-user usage limits.
  const token = await getToken();
  if ((auth || token) && token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    const e: any = new Error(err || `Request failed: ${res.status}`);
    e.status = res.status;
    try {
      const parsed = JSON.parse(err);
      e.detail = parsed?.detail || err;
    } catch {
      e.detail = err;
    }
    throw e;
  }
  return (await res.json()) as T;
}

export const api = {
  guest: (device_id?: string) =>
    request<{ session_token: string; user: any }>("/auth/guest", {
      method: "POST",
      body: { device_id },
    }),
  googleLogin: (id_token: string) =>
    request<{ session_token: string; user: any }>("/auth/google", {
      method: "POST",
      body: { id_token },
    }),
  emailRegister: (email: string, password: string, name?: string) =>
    request<{ session_token: string; user: any }>("/auth/register", {
      method: "POST",
      body: { email, password, name },
    }),
  emailLogin: (email: string, password: string) =>
    request<{ session_token: string; user: any }>("/auth/login", {
      method: "POST",
      body: { email, password },
    }),
  adminLogin: (email: string, password: string) =>
    request<{ session_token: string; user: any }>("/auth/admin", {
      method: "POST",
      body: { email, password },
    }),
  me: () => request<{ user: any }>("/auth/me", { auth: true }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST", auth: true }),
  setupComplete: () =>
    request<{ ok: boolean; user: any }>("/auth/setup-complete", {
      method: "POST",
      auth: true,
    }),

  tool: (tool: string, text: string, options: Record<string, any> = {}) =>
    request<{ tool: string; original: string; suggestions: string[]; explanation?: string; data?: Record<string, any> | null }>(
      "/ai/tool",
      { method: "POST", body: { tool, text, options }, auth: true },
    ),

  ocr: (image_base64: string) =>
    request<{ text: string }>("/ocr", { method: "POST", body: { image_base64 } }),

  tts: (text: string, voice?: string, language?: string) =>
    request<{ audio_base64: string; voice: string; mime: string }>("/tts", {
      method: "POST",
      body: { text, voice, language },
    }),

  /**
   * Upload a voice-input clip → server-side Whisper-1 → transcript.
   * Pass `language` (ISO-639-1 like "hi", "en") to bias detection.
   *   • Mobile: `uri` is a `file://...` path returned by expo-audio.
   *   • Web:    `uri` is a `blob:` URL — we fetch it back to a Blob first.
   */
  transcribe: async (uri: string, language?: string) => {
    const form = new FormData();
    if (language) form.append("language", language);
    if (uri.startsWith("blob:") || uri.startsWith("data:")) {
      const blob = await (await fetch(uri)).blob();
      form.append("audio", blob, "voice.webm");
    } else {
      const ext = uri.split(".").pop()?.toLowerCase() || "m4a";
      const mime = ext === "mp3" ? "audio/mpeg" : ext === "wav" ? "audio/wav" : "audio/m4a";
      // React Native's FormData accepts the `{ uri, name, type }` shape.
      // @ts-expect-error — RN FormData polyfill supports the file object shape.
      form.append("audio", { uri, name: `voice.${ext}`, type: mime });
    }
    return request<{ text: string }>("/transcribe", {
      method: "POST",
      body: form,
    });
  },

  chat: (session_id: string, message: string) =>
    request<{ session_id: string; reply: string }>("/ai/chat", {
      method: "POST",
      body: { session_id, message },
      auth: true,
    }),
  chatHistory: (session_id: string) =>
    request<{ session_id: string; messages: Array<{ role: string; content: string }> }>(
      `/ai/chat/${session_id}`,
    ),

  saveHistory: (tool: string, original: string, applied: string) =>
    request("/history", { method: "POST", body: { tool, original, applied }, auth: true }),
  getHistory: () => request<{ items: any[] }>("/history", { auth: true }),
  deleteHistory: (id: string) => request(`/history/${id}`, { method: "DELETE", auth: true }),

  // Admin
  adminList: () =>
    request<{ items: Array<{ email: string; is_premium: boolean; added_at?: string; name?: string | null; has_account: boolean; tool_uses_today: number }> }>(
      "/admin/whitelist",
      { auth: true },
    ),
  adminAdd: (email: string, is_premium = true) =>
    request<{ ok: boolean; email: string; is_premium: boolean }>("/admin/whitelist", {
      method: "POST",
      body: { email, is_premium },
      auth: true,
    }),
  adminToggle: (email: string, is_premium: boolean) =>
    request<{ ok: boolean; email: string; is_premium: boolean }>("/admin/whitelist", {
      method: "PUT",
      body: { email, is_premium },
      auth: true,
    }),
  adminRemove: (email: string) =>
    request<{ deleted: number }>(`/admin/whitelist/${encodeURIComponent(email)}`, {
      method: "DELETE",
      auth: true,
    }),

  // ---------- Subscription (mock payment) ----------
  listPlans: () =>
    request<{
      plans: { id: string; label: string; price_inr: number; days: number; currency: string }[];
    }>("/subscription/plans"),
  subscribe: (plan: "weekly" | "monthly") =>
    request<{ ok: boolean; mock_payment: boolean; plan: string; expires_at: string; user: any }>(
      "/subscription/subscribe",
      { method: "POST", body: { plan }, auth: true },
    ),
  cancelSubscription: () =>
    request<{ ok: boolean; user: any }>("/subscription/cancel", {
      method: "POST",
      auth: true,
    }),

  // ---------- Voice-to-text (Whisper-1) ----------
  transcribe: async (uri: string, language?: string): Promise<{ text: string }> => {
    const form = new FormData();
    // React Native multipart upload — pass an object with uri/name/type
    const filename = uri.split("/").pop() || "voice.m4a";
    const match = /\.(\w+)$/.exec(filename);
    const ext = (match?.[1] || "m4a").toLowerCase();
    const mime =
      ext === "mp3" ? "audio/mpeg"
      : ext === "wav" ? "audio/wav"
      : ext === "webm" ? "audio/webm"
      : "audio/m4a";
    form.append("audio", {
      uri,
      name: filename,
      type: mime,
    } as any);
    if (language) form.append("language", language);

    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    // Do NOT set Content-Type; RN/fetch will set the multipart boundary itself.

    const res = await fetch(`${BASE}/api/transcribe`, {
      method: "POST",
      headers,
      body: form,
    });
    if (!res.ok) {
      const err = await res.text();
      const e: any = new Error(err || `Request failed: ${res.status}`);
      e.status = res.status;
      try { e.detail = JSON.parse(err)?.detail || err; } catch { e.detail = err; }
      throw e;
    }
    return await res.json();
  },
};
