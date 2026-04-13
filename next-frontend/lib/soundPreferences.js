const STORAGE_KEY = "qrdine:sound";

/** @returns {{ muted: boolean, volume: number, vibrate: boolean }} */
export function getSoundPreferences() {
  if (typeof window === "undefined") {
    return { muted: false, volume: 0.85, vibrate: true };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultPreferences();
    const parsed = JSON.parse(raw);
    return {
      muted: Boolean(parsed.muted),
      volume: typeof parsed.volume === "number" ? Math.min(1, Math.max(0, parsed.volume)) : 0.85,
      vibrate: parsed.vibrate !== false,
    };
  } catch {
    return getDefaultPreferences();
  }
}

function getDefaultPreferences() {
  if (typeof window === "undefined") {
    return { muted: false, volume: 0.85, vibrate: true };
  }
  const path = window.location.pathname || "";
  const staff =
    path.includes("/kitchen") ||
    path.includes("/waiter") ||
    path.includes("/admin") ||
    path.includes("/chef") ||
    path.includes("/super-admin");
  return {
    muted: staff ? false : true,
    volume: staff ? 0.85 : 0.65,
    vibrate: true,
  };
}

export function setSoundPreferences(partial) {
  if (typeof window === "undefined") return;
  const cur = getSoundPreferences();
  const next = { ...cur, ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  try {
    window.dispatchEvent(new CustomEvent("qrdine-sound-prefs", { detail: next }));
  } catch {
    // ignore
  }
}
