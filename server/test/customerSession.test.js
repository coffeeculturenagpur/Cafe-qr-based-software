const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const {
  CUSTOMER_COOKIE_MAX_AGE_MS,
  CUSTOMER_COOKIE_NAME,
  getClientIp,
  ipFingerprint,
  signCustomerToken,
  verifyCustomerToken,
} = require("../utils/customerSession");

test("getClientIp prefers the first forwarded IP", () => {
  const req = {
    headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
    ip: "::ffff:127.0.0.1",
  };
  assert.equal(getClientIp(req), "203.0.113.5");
});

test("signCustomerToken creates a 3-hour customer token", () => {
  const req = { headers: { "x-forwarded-for": "203.0.113.5" } };
  const secret = "test-secret";
  const token = signCustomerToken({ customerId: "cust_123", req, secret });
  assert.ok(token);

  const payload = jwt.verify(token, secret);
  assert.equal(payload.sub, "cust_123");
  assert.equal(payload.aud, "customer");
  assert.ok(payload.exp - payload.iat <= 3 * 60 * 60);
});

test("verifyCustomerToken verifies valid customer token", () => {
  const secret = "test-secret";
  const sourceReq = { headers: { "x-forwarded-for": "203.0.113.5" } };
  const token = signCustomerToken({ customerId: "cust_123", req: sourceReq, secret });

  const ok = verifyCustomerToken({ req: sourceReq, token, secret });
  assert.equal(ok.status, undefined);
  assert.equal(ok.payload.sub, "cust_123");
});

test("customer cookie constants stay aligned with the short session policy", () => {
  assert.equal(CUSTOMER_COOKIE_NAME, "qrdine_customer");
  assert.equal(CUSTOMER_COOKIE_MAX_AGE_MS, 3 * 60 * 60 * 1000);
});
