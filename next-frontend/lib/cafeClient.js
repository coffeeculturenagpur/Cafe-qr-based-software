import { apiFetch } from "./api";

const CAFE_CACHE_PREFIX = "qrdine:cafe:";
const CAFE_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getCafeWithCache(cafeId, options = {}) {
  if (!cafeId) return null;

  const force = Boolean(options.force);
  const cacheKey = `${CAFE_CACHE_PREFIX}${cafeId}`;

  if (!force && typeof window !== "undefined") {
    try {
      const raw = window.sessionStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const ts = Number(parsed?.ts || 0);
        if (parsed?.data && Date.now() - ts < CAFE_CACHE_TTL_MS) {
          return parsed.data;
        }
      }
    } catch {
      // Ignore cache read errors and fall back to network.
    }
  }

  const data = await apiFetch(`/api/cafe/${cafeId}`);

  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      // Ignore cache write errors.
    }
  }

  return data;
}
