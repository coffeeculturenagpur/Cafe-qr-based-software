"use client";

const CUSTOMER_SESSION_TTL_MS = 3 * 60 * 60 * 1000;
const CUSTOMER_SESSION_KEY = "qrdine:customer-session";

export function customerSessionKey() {
  return CUSTOMER_SESSION_KEY;
}

function legacyCustomerSessionKey(cafeId, tableNumber) {
  return `customer:${cafeId}:table:${tableNumber}`;
}

function parseCustomerSession(raw) {
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") return null;

  const expiresAt = Number(parsed.expiresAt);
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
    return null;
  }

  return {
    name: parsed.name || "",
    phone: parsed.phone || "",
  };
}

export function getCustomerSession(cafeId, tableNumber) {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(customerSessionKey());
    const parsed = parseCustomerSession(raw);
    if (parsed) return parsed;
    if (raw) localStorage.removeItem(customerSessionKey());

    if (cafeId && tableNumber != null) {
      const legacyKey = legacyCustomerSessionKey(cafeId, tableNumber);
      const legacyRaw = localStorage.getItem(legacyKey);
      const legacyParsed = parseCustomerSession(legacyRaw);
      if (legacyParsed) {
        setCustomerSession(legacyParsed);
        localStorage.removeItem(legacyKey);
        return legacyParsed;
      }
      if (legacyRaw) localStorage.removeItem(legacyKey);
    }

    return null;
  } catch {
    return null;
  }
}

export function setCustomerSession(session) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      customerSessionKey(),
      JSON.stringify({
        name: session?.name || "",
        phone: session?.phone || "",
        expiresAt: Date.now() + CUSTOMER_SESSION_TTL_MS,
      })
    );
  } catch {
    // ignore
  }
}

export function clearCustomerSession(cafeId, tableNumber) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(customerSessionKey());
    if (cafeId && tableNumber != null) {
      localStorage.removeItem(legacyCustomerSessionKey(cafeId, tableNumber));
    }
  } catch {
    // ignore
  }
}
