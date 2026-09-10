const DEFAULT_CIGARETTE_CATEGORIES = ["Cigarettes", "Cigarette"];

function normalizeCategory(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function resolveCigaretteCategories(cafe) {
  const configured = Array.isArray(cafe?.cigaretteCategories)
    ? cafe.cigaretteCategories.map((c) => String(c || "").trim()).filter(Boolean)
    : [];
  // Always keep the default Cigarette/Cigarettes names so menu items show up
  // even when admins also add extra category aliases.
  const merged = [...DEFAULT_CIGARETTE_CATEGORIES];
  for (const name of configured) {
    if (!merged.some((existing) => normalizeCategory(existing) === normalizeCategory(name))) {
      merged.push(name);
    }
  }
  return merged;
}

function buildCigaretteCategorySet(cafe) {
  return new Set(resolveCigaretteCategories(cafe).map(normalizeCategory));
}

function isCigaretteCategory(category, categorySet) {
  const normalized = normalizeCategory(category);
  if (!normalized) return false;
  if (categorySet instanceof Set && categorySet.size > 0 && categorySet.has(normalized)) {
    return true;
  }
  // Fallback: any category whose name contains "cigaret" (covers Cigarette / Cigarettes)
  return normalized.includes("cigaret");
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
