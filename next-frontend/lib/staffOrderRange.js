/** ISO range for “today” in the browser’s local timezone */
export function todayISOStringRange() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  return { from: from.toISOString(), to: to.toISOString() };
}

export function ordersTodayQueryString() {
  const { from, to } = todayISOStringRange();
  return new URLSearchParams({ from, to }).toString();
}

export function isOrderInLocalToday(order) {
  if (!order?.createdAt) return true;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return new Date(order.createdAt) >= start;
}

/**
 * Business-day boundary for staff dashboards.
 * By default, the "day" starts at 1:00 AM local time (so late-night orders
 * just after midnight still count towards the previous day's shift).
 */
export function businessDayISOStringRange({ startHour = 1 } = {}) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(Number(startHour) || 0, 0, 0, 0);
  // If it's before the boundary hour, we're still in the previous business day.
  if (now.getTime() < start.getTime()) {
    start.setDate(start.getDate() - 1);
  }
  return { from: start.toISOString(), to: now.toISOString() };
}

export function ordersBusinessDayQueryString({ startHour = 1 } = {}) {
  const { from, to } = businessDayISOStringRange({ startHour });
  return new URLSearchParams({ from, to }).toString();
}

export function isOrderInLocalBusinessDay(order, { startHour = 1 } = {}) {
  if (!order?.createdAt) return true;
  const { from } = businessDayISOStringRange({ startHour });
  return new Date(order.createdAt).getTime() >= new Date(from).getTime();
}
