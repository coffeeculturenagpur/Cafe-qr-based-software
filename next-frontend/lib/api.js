const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export function getApiBaseUrl() {
  if (!API_BASE_URL) return "";
  return API_BASE_URL.replace(/\/$/, "");
}

export async function apiFetch(path, options = {}) {
  const baseUrl = getApiBaseUrl();
  // If NEXT_PUBLIC_API_BASE_URL isn't provided, fall back to relative URLs.
  // In local dev this pairs with Next rewrites to proxy /api/* to the backend.
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;

  const method = String(options.method || "GET").toUpperCase();
  const hasBody = typeof options.body !== "undefined" && options.body !== null;
  const isFormDataBody = typeof FormData !== "undefined" && hasBody && options.body instanceof FormData;
  const shouldSetJsonContentType = hasBody && !isFormDataBody && method !== "GET" && method !== "HEAD";

  const res = await fetch(url, {
    ...options,
    credentials: options.credentials ?? "include",
    headers: {
      ...(shouldSetJsonContentType ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  const contentType = res.headers.get("content-type") || "";
  let data = null;

  if (text) {
    if (contentType.includes("application/json")) {
      data = JSON.parse(text);
    } else {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text.startsWith("<!DOCTYPE") || text.startsWith("<html") ? `Non-JSON response from ${url}` : text };
      }
    }
  }

  if (!res.ok) {
    const message = data?.message || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data;
}
