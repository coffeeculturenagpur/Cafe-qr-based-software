/** Statuses hidden from kitchen live board (handed off or completed). */
const KITCHEN_LIVE_EXCLUDED = new Set(["ready", "served", "paid", "rejected"]);

/** Statuses visible on waiter live board (ready to serve or in service). */
const WAITER_LIVE_VISIBLE = new Set(["ready", "served"]);

/** Statuses hidden from admin live orders list (completed). */
const ADMIN_LIVE_EXCLUDED = new Set(["paid", "rejected"]);

export function isKitchenLiveOrder(order) {
  return order?.status && !KITCHEN_LIVE_EXCLUDED.has(order.status);
}

export function isWaiterLiveOrder(order) {
  return order?.status && WAITER_LIVE_VISIBLE.has(order.status);
}

export function isAdminLiveOrder(order) {
  return order?.status && !ADMIN_LIVE_EXCLUDED.has(order.status);
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
