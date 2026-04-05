const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 6 * 60 * 60);
const CUSTOMER_ORDER_TTL_SECONDS = Number(process.env.CUSTOMER_ORDER_TTL_SECONDS || 7 * 24 * 60 * 60);
const SESSION_ORDER_LIMIT = Number(process.env.SESSION_ORDER_LIMIT || 20);
const CUSTOMER_ORDER_LIMIT = Number(process.env.CUSTOMER_ORDER_LIMIT || 10);

let state = {
  mode: "memory",
  client: null,
  warned: false,
};

const memory = {
  values: new Map(),
  expiries: new Map(),
};

function now() {
  return Date.now();
}

function expiresAtFromSeconds(ttlSeconds) {
  return now() + ttlSeconds * 1000;
}

function pruneExpiredKey(key) {
  const expiry = memory.expiries.get(key);
  if (!expiry) return;
  if (expiry > now()) return;
  memory.expiries.delete(key);
  memory.values.delete(key);
}

function memoryGet(key) {
  pruneExpiredKey(key);
  return memory.values.get(key);
}

function memorySet(key, value, ttlSeconds) {
  memory.values.set(key, value);
  memory.expiries.set(key, expiresAtFromSeconds(ttlSeconds));
}

function memoryDel(key) {
  memory.values.delete(key);
  memory.expiries.delete(key);
}

function serialize(value) {
  return JSON.stringify(value);
}

function deserialize(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function sessionKey(sessionId) {
  return `session:${sessionId}`;
}

function sessionOrdersKey(sessionId) {
  return `session:${sessionId}:orders`;
}

function customerOrdersKey(customerId) {
  return `customer:${customerId}:orders`;
}

async function ensureRedisClient() {
  if (state.client || state.mode === "memory") return state.client;

  const url = process.env.REDIS_URL;
  if (!url) {
    state.mode = "memory";
    return null;
  }

  try {
    // Optional dependency. When unavailable we fall back to memory.
    // eslint-disable-next-line global-require
    const { createClient } = require("redis");
    const client = createClient({ url });
    client.on("error", (error) => {
      if (!state.warned) {
        state.warned = true;
        // eslint-disable-next-line no-console
        console.warn("Redis error, falling back to in-memory session store:", error.message);
      }
      state.mode = "memory";
      state.client = null;
    });
    await client.connect();
    state.client = client;
    state.mode = "redis";
    return client;
  } catch (error) {
    if (!state.warned) {
      state.warned = true;
      // eslint-disable-next-line no-console
      console.warn("Redis unavailable, using in-memory session store:", error.message);
    }
    state.mode = "memory";
    state.client = null;
    return null;
  }
}

async function initSessionStore() {
  if (!process.env.REDIS_URL) {
    state.mode = "memory";
    return { mode: state.mode };
  }
  await ensureRedisClient();
  return { mode: state.mode };
}

async function readJson(key, fallback = null) {
  const client = await ensureRedisClient();
  if (client && state.mode === "redis") {
    const raw = await client.get(key);
    return deserialize(raw, fallback);
  }
  const raw = memoryGet(key);
  return raw === undefined ? fallback : raw;
}

async function writeJson(key, value, ttlSeconds) {
  const client = await ensureRedisClient();
  if (client && state.mode === "redis") {
    await client.set(key, serialize(value), { EX: ttlSeconds });
    return;
  }
  memorySet(key, value, ttlSeconds);
}

async function pushUniqueList(key, value, { ttlSeconds, limit }) {
  const client = await ensureRedisClient();
  if (client && state.mode === "redis") {
    const existing = deserialize(await client.get(key), []);
    const next = [String(value), ...existing.filter((item) => String(item) !== String(value))].slice(0, limit);
    await client.set(key, serialize(next), { EX: ttlSeconds });
    return next;
  }

  const existing = Array.isArray(memoryGet(key)) ? memoryGet(key) : [];
  const next = [String(value), ...existing.filter((item) => String(item) !== String(value))].slice(0, limit);
  memorySet(key, next, ttlSeconds);
  return next;
}

async function getSessionState(sessionId) {
  if (!sessionId) return null;
  return readJson(sessionKey(sessionId), null);
}

async function upsertSessionState({ sessionId, cafeId, tableId = null, tableNumber = null, customerId = null }) {
  if (!sessionId) return null;
  const key = sessionKey(sessionId);
  const current = (await readJson(key, null)) || {};
  const next = {
    sessionId,
    cafeId: cafeId ?? current.cafeId ?? null,
    tableId: tableId ?? current.tableId ?? null,
    tableNumber: tableNumber ?? current.tableNumber ?? null,
    customerId: customerId ?? current.customerId ?? null,
    createdAt: current.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeJson(key, next, SESSION_TTL_SECONDS);
  return next;
}

async function linkSessionCustomer(sessionId, customerId) {
  if (!sessionId || !customerId) return null;
  return upsertSessionState({ sessionId, customerId: String(customerId) });
}

async function attachOrderToSession({ sessionId, customerId, cafeId, tableNumber, orderId }) {
  if (!orderId) return;
  if (sessionId) {
    await upsertSessionState({ sessionId, cafeId, tableNumber, customerId: customerId ? String(customerId) : null });
    await pushUniqueList(sessionOrdersKey(sessionId), orderId, {
      ttlSeconds: SESSION_TTL_SECONDS,
      limit: SESSION_ORDER_LIMIT,
    });
  }
  if (customerId) {
    await pushUniqueList(customerOrdersKey(String(customerId)), orderId, {
      ttlSeconds: CUSTOMER_ORDER_TTL_SECONDS,
      limit: CUSTOMER_ORDER_LIMIT,
    });
  }
}

async function getTrackedOrderIds({ sessionId, customerId }) {
  const ids = [];
  if (sessionId) {
    const sessionOrders = await readJson(sessionOrdersKey(sessionId), []);
    if (Array.isArray(sessionOrders)) ids.push(...sessionOrders);
  }
  if (customerId) {
    const customerOrders = await readJson(customerOrdersKey(String(customerId)), []);
    if (Array.isArray(customerOrders)) ids.push(...customerOrders);
  }
  return [...new Set(ids.map((id) => String(id)).filter(Boolean))];
}

async function clearSessionState(sessionId) {
  if (!sessionId) return;
  const client = await ensureRedisClient();
  if (client && state.mode === "redis") {
    await client.del(sessionKey(sessionId));
    await client.del(sessionOrdersKey(sessionId));
    return;
  }
  memoryDel(sessionKey(sessionId));
  memoryDel(sessionOrdersKey(sessionId));
}

function getSessionStoreMode() {
  return state.mode;
}

module.exports = {
  attachOrderToSession,
  clearSessionState,
  CUSTOMER_ORDER_LIMIT,
  CUSTOMER_ORDER_TTL_SECONDS,
  getSessionState,
  getSessionStoreMode,
  getTrackedOrderIds,
  initSessionStore,
  linkSessionCustomer,
  SESSION_ORDER_LIMIT,
  SESSION_TTL_SECONDS,
  upsertSessionState,
};
