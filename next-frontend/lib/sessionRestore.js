"use client";

import { apiFetch } from "./api";

export async function fetchSessionRestore(cafeId) {
  const qs = new URLSearchParams();
  if (cafeId) qs.set("cafeId", cafeId);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch(`/api/session/me${suffix}`, { credentials: "include" });
}

