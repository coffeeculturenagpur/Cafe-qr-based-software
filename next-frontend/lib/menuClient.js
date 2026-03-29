import { apiFetch } from "./api";

const MENU_CACHE_PREFIX = "qrdine:menu:";
const MENU_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getMenuWithCache(cafeId, options = {}) {
  if (!cafeId) return [];

  const force = Boolean(options.force);
  const cacheKey = `${MENU_CACHE_PREFIX}${cafeId}`;

  if (!force && typeof window !== "undefined") {
    try {
      const raw = window.sessionStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const ts = Number(parsed?.ts || 0);
        if (Array.isArray(parsed?.data) && Date.now() - ts < MENU_CACHE_TTL_MS) {
          return parsed.data;
        }
      }
    } catch {
      // fall through to network
    }
  }

  const data = await apiFetch(`/api/menu/${cafeId}`);
  const list = Array.isArray(data) ? data : [];

  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: list }));
    } catch {
      // ignore
    }
  }

  return list;
}
