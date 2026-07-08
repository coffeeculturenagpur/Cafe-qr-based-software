function normalizeStatus(order) {
  return typeof order?.status === "string" ? order.status.trim().toLowerCase() : "";
}

/** Statuses hidden from kitchen live board (handed off or completed). */
const KITCHEN_LIVE_EXCLUDED = new Set(["ready", "served", "paid", "rejected"]);

/** Statuses visible on waiter live board (ready to serve or in service). */
const WAITER_LIVE_VISIBLE = new Set(["ready", "served"]);

/** Statuses hidden from admin live orders list (completed). */
const ADMIN_LIVE_EXCLUDED = new Set(["paid", "rejected"]);

export function isKitchenLiveOrder(order) {
  const status = normalizeStatus(order);
  return status && !KITCHEN_LIVE_EXCLUDED.has(status);
}

export function isWaiterLiveOrder(order) {
  const status = normalizeStatus(order);
  return status && WAITER_LIVE_VISIBLE.has(status);
}

export function isAdminLiveOrder(order) {
  const status = normalizeStatus(order);
  return status && !ADMIN_LIVE_EXCLUDED.has(status);
}

export function filterKitchenLiveOrders(orders) {
  if (!Array.isArray(orders)) return [];
  return orders.filter(isKitchenLiveOrder);
}

export function filterWaiterLiveOrders(orders) {
  if (!Array.isArray(orders)) return [];
  return orders.filter(isWaiterLiveOrder);
}

export function filterAdminLiveOrders(orders) {
  if (!Array.isArray(orders)) return [];
  return orders.filter(isAdminLiveOrder);
}
