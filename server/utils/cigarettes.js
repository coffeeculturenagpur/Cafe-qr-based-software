const DEFAULT_CIGARETTE_CATEGORIES = ["Cigarettes"];

function normalizeCategory(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function resolveCigaretteCategories(cafe) {
  const list = Array.isArray(cafe?.cigaretteCategories)
    ? cafe.cigaretteCategories.map((c) => String(c || "").trim()).filter(Boolean)
    : [];
  return list.length > 0 ? list : DEFAULT_CIGARETTE_CATEGORIES;
}

function buildCigaretteCategorySet(cafe) {
  return new Set(resolveCigaretteCategories(cafe).map(normalizeCategory));
}

function isCigaretteCategory(category, categorySet) {
  const normalized = normalizeCategory(category);
  if (!normalized || !(categorySet instanceof Set) || categorySet.size === 0) return false;
  return categorySet.has(normalized);
}

function isCigaretteMenuItem(menuDoc, categorySet) {
  return isCigaretteCategory(menuDoc?.category, categorySet);
}

/**
 * @param {Array<{ menuItemId?: any, name?: string, price?: number, qty?: number, category?: string }>} resolvedItems
 * @param {Map<string, any>} menuMap keyed by String(menuItemId)
 * @param {Set<string>} categorySet
 */
function partitionResolvedItemsByType(resolvedItems, menuMap, categorySet) {
  const foodItems = [];
  const cigaretteItems = [];

  for (const item of Array.isArray(resolvedItems) ? resolvedItems : []) {
    const menuDoc = menuMap?.get(String(item?.menuItemId || "")) || null;
    const category = menuDoc?.category || item?.category || "";
    if (isCigaretteCategory(category, categorySet)) {
      cigaretteItems.push(item);
    } else {
      foodItems.push(item);
    }
  }

  return { foodItems, cigaretteItems };
}

function assertItemsMatchOrderType(resolvedItems, menuMap, categorySet, orderType) {
  const wantCigarette = String(orderType || "").toLowerCase() === "cigarette";
  for (const item of Array.isArray(resolvedItems) ? resolvedItems : []) {
    const menuDoc = menuMap?.get(String(item?.menuItemId || "")) || null;
    const isCig = isCigaretteMenuItem(menuDoc || item, categorySet);
    if (wantCigarette && !isCig) {
      const error = new Error("Cigarette orders may only include cigarette menu items");
      error.status = 400;
      throw error;
    }
    if (!wantCigarette && isCig) {
      const error = new Error("Food orders may not include cigarette menu items");
      error.status = 400;
      throw error;
    }
  }
}

module.exports = {
  DEFAULT_CIGARETTE_CATEGORIES,
  resolveCigaretteCategories,
  buildCigaretteCategorySet,
  isCigaretteCategory,
  isCigaretteMenuItem,
  partitionResolvedItemsByType,
  assertItemsMatchOrderType,
  normalizeCategory,
};
