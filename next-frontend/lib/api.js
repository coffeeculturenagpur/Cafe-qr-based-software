const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export function getApiBaseUrl() {
  if (!API_BASE_URL) return "";
  return API_BASE_URL.replace(/\/$/, "");
}

export async function apiFetch(path, options = {}) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new Error("Missing NEXT_PUBLIC_API_BASE_URL");
  }

  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message = data?.message || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data;
}
