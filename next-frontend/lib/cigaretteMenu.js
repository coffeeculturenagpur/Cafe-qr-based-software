/**
 * Client-side helpers for cigarette menu categories (mirrors server/utils/cigarettes.js).
 */

export const DEFAULT_CIGARETTE_CATEGORIES = ["Cigarettes"];

export function normalizeCigaretteCategory(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function resolveCigaretteCategories(cafeInfo) {
  const list = Array.isArray(cafeInfo?.cigaretteCategories)
    ? cafeInfo.cigaretteCategories.map((c) => String(c || "").trim()).filter(Boolean)
    : [];
  return list.length > 0 ? list : DEFAULT_CIGARETTE_CATEGORIES;
}

export function buildCigaretteCategorySet(cafeInfo) {
  return new Set(resolveCigaretteCategories(cafeInfo).map(normalizeCigaretteCategory));
}

export function isCigaretteMenuItem(item, cafeInfoOrSet) {
  const set =
    cafeInfoOrSet instanceof Set ? cafeInfoOrSet : buildCigaretteCategorySet(cafeInfoOrSet);
  const normalized = normalizeCigaretteCategory(item?.category);
  return Boolean(normalized && set.has(normalized));
}

export function filterCigaretteMenuItems(menuItems, cafeInfo) {
  const set = buildCigaretteCategorySet(cafeInfo);
  return (Array.isArray(menuItems) ? menuItems : []).filter((item) => isCigaretteMenuItem(item, set));
}
