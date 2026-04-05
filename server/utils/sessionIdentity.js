const crypto = require("crypto");

const SESSION_COOKIE_NAME = "qrdine_session";
const SESSION_COOKIE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function isSecureRequest(req) {
  if (req?.secure) return true;
  const forwardedProto = req?.headers?.["x-forwarded-proto"];
  if (typeof forwardedProto === "string") {
    return forwardedProto.split(",")[0].trim().toLowerCase() === "https";
  }
  return false;
}

function getSessionCookieOptions(req) {
  const secure = process.env.NODE_ENV === "production" || isSecureRequest(req);
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
    path: "/",
  };
}

function createSessionId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString("hex");
}

function parseCookieHeader(header) {
  const parsed = {};
  if (!header || typeof header !== "string") return parsed;

  for (const chunk of header.split(";")) {
    const [name, ...rest] = chunk.split("=");
    const key = String(name || "").trim();
    if (!key) continue;
    parsed[key] = decodeURIComponent(rest.join("=").trim());
  }

  return parsed;
}

function readSessionId(req) {
  const fromCookieParser = req?.cookies?.[SESSION_COOKIE_NAME];
  if (fromCookieParser) return String(fromCookieParser).trim();

  const headerCookie = req?.headers?.cookie;
  const parsed = parseCookieHeader(headerCookie);
  if (parsed[SESSION_COOKIE_NAME]) return String(parsed[SESSION_COOKIE_NAME]).trim();

  return "";
}

function ensureSessionId(req, res) {
  const existing = readSessionId(req);
  if (existing) {
    req.sessionId = existing;
    return existing;
  }

  const sessionId = createSessionId();
  req.sessionId = sessionId;
  if (res?.cookie) {
    res.cookie(SESSION_COOKIE_NAME, sessionId, getSessionCookieOptions(req));
  }
  return sessionId;
}

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_MS,
  createSessionId,
  ensureSessionId,
  getSessionCookieOptions,
  parseCookieHeader,
  readSessionId,
};
