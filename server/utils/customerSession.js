const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const CUSTOMER_COOKIE_NAME = "qrdine_customer";
const CUSTOMER_COOKIE_MAX_AGE_MS = 3 * 60 * 60 * 1000;

function getClientIp(req) {
  const forwarded = req?.headers?.["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const firstForwarded = typeof raw === "string" ? raw.split(",")[0].trim() : "";
  const ip = firstForwarded || req?.ip || req?.socket?.remoteAddress || "";
  return String(ip).replace(/^::ffff:/, "").trim();
}

function ipFingerprint(req, secret) {
  const ip = getClientIp(req);
  if (!ip || !secret) return "";
  return crypto.createHash("sha256").update(`${secret}:${ip}`).digest("hex");
}

function signCustomerToken({ customerId, req, secret }) {
  if (!customerId || !secret) return "";
  return jwt.sign(
    { sub: String(customerId), aud: "customer" },
    secret,
    { expiresIn: "3h" }
  );
}

function verifyCustomerToken({ req, token, secret }) {
  if (!secret) return { status: 500, message: "JWT secret not configured" };
  const payload = jwt.verify(token, secret);
  if (payload.aud !== "customer") return { status: 401, message: "Invalid session" };
  return { payload };
}

module.exports = {
  CUSTOMER_COOKIE_NAME,
  CUSTOMER_COOKIE_MAX_AGE_MS,
  getClientIp,
  ipFingerprint,
  signCustomerToken,
  verifyCustomerToken,
};
