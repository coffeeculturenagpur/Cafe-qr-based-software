/**
 * Client-side helpers for cigarette menu categories (mirrors server/utils/cigarettes.js).
 */

export const DEFAULT_CIGARETTE_CATEGORIES = ["Cigarettes", "Cigarette"];

export function normalizeCigaretteCategory(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function resolveCigaretteCategories(cafeInfo) {
  const configured = Array.isArray(cafeInfo?.cigaretteCategories)
    ? cafeInfo.cigaretteCategories.map((c) => String(c || "").trim()).filter(Boolean)
    : [];
  const merged = [...DEFAULT_CIGARETTE_CATEGORIES];
  for (const name of configured) {
    if (!merged.some((existing) => normalizeCigaretteCategory(existing) === normalizeCigaretteCategory(name))) {
      merged.push(name);
    }
  }
  return merged;
}

export function buildCigaretteCategorySet(cafeInfo) {
  return new Set(resolveCigaretteCategories(cafeInfo).map(normalizeCigaretteCategory));
}

export function isCigaretteMenuItem(item, cafeInfoOrSet) {
  const set =
    cafeInfoOrSet instanceof Set ? cafeInfoOrSet : buildCigaretteCategorySet(cafeInfoOrSet);
  const normalized = normalizeCigaretteCategory(item?.category);
  if (!normalized) return false;
  if (set.has(normalized)) return true;
  return normalized.includes("cigaret");
}

export function filterCigaretteMenuItems(menuItems, cafeInfo) {
  const set = buildCigaretteCategorySet(cafeInfo);
  return (Array.isArray(menuItems) ? menuItems : []).filter((item) => isCigaretteMenuItem(item, set));
}
