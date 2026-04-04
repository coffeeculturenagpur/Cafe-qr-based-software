function getOrderTimestamp(order) {
  const candidates = [order?.updatedAt, order?.createdAt];
  for (const value of candidates) {
    const time = new Date(value || "").getTime();
    if (Number.isFinite(time) && time > 0) return time;
  }
  return 0;
}

function normalizeTableValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { key: "unknown", label: "?" };
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    const normalized = String(Math.trunc(numeric));
    return { key: normalized, label: normalized };
  }
  return { key: raw.toLowerCase(), label: raw };
}

export function groupOrdersByTable(orderList) {
  const groups = new Map();

  for (const order of Array.isArray(orderList) ? orderList : []) {
    const normalizedTable = normalizeTableValue(order?.tableNumber);
    const tableKey = normalizedTable.key;
    if (!groups.has(tableKey)) {
      groups.set(tableKey, {
        tableKey,
        tableNumber: normalizedTable.label,
        orders: [],
      });
    }
    groups.get(tableKey).orders.push(order);
  }

  return Array.from(groups.values())
    .map((group) => {
      const orders = group.orders.slice().sort((a, b) => getOrderTimestamp(b) - getOrderTimestamp(a));
      return {
        ...group,
        orders,
        latestOrder: orders[0] || null,
        customerNames: Array.from(
          new Set(orders.map((order) => String(order?.customerName || "").trim()).filter(Boolean))
        ),
        phones: Array.from(new Set(orders.map((order) => String(order?.phone || "").trim()).filter(Boolean))),
      };
    })
    .sort((a, b) => getOrderTimestamp(b.latestOrder) - getOrderTimestamp(a.latestOrder));
}
