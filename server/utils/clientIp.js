const crypto = require("crypto");

function normalizeIp(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const first = raw.split(",")[0].trim().toLowerCase();
  if (!first) return "";
  if (first === "::1") return "127.0.0.1";
  if (first.startsWith("::ffff:")) return first.slice(7);
  return first;
}

function getClientIp(req) {
  return normalizeIp(
    req?.headers?.["x-forwarded-for"] ||
    req?.headers?.["x-real-ip"] ||
    req?.ip ||
    req?.socket?.remoteAddress ||
    req?.connection?.remoteAddress
  );
}

function getClientIpKey(req) {
  const ip = getClientIp(req);
  if (!ip) return "";
  return crypto.createHash("sha256").update(ip).digest("hex");
}

module.exports = { getClientIp, getClientIpKey };
