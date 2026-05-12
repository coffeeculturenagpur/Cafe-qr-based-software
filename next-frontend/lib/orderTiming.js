function resolveAcceptToServeMs(order) {
  const direct = Number(order?.acceptToServeMs);
  if (Number.isFinite(direct) && direct >= 0) return direct;

  const acceptedAt = order?.acceptedAt ? new Date(order.acceptedAt).getTime() : NaN;
  const servedAt = order?.servedAt ? new Date(order.servedAt).getTime() : NaN;
  if (Number.isFinite(acceptedAt) && Number.isFinite(servedAt) && servedAt >= acceptedAt) {
    return servedAt - acceptedAt;
  }
  return null;
}

function resolveDateValue(value) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function formatClockDate(dateValue) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    day: "2-digit",
    month: "short",
  }).format(dateValue);
}

export function formatOrderAcceptedAt(order) {
  const acceptedAt = resolveDateValue(order?.acceptedAt);
  if (!acceptedAt) return "Not accepted yet";
  return formatClockDate(acceptedAt);
}

export function formatOrderServedAt(order) {
  const servedAt = resolveDateValue(order?.servedAt);
  if (!servedAt) return "Not served yet";
  return formatClockDate(servedAt);
}

export function formatOrderAcceptToServe(order) {
  const ms = resolveAcceptToServeMs(order);
  if (!Number.isFinite(ms)) return "Not served yet";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
