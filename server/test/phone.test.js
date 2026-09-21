const test = require("node:test");
const assert = require("node:assert/strict");
const { isValidPhone, normalizePhone } = require("../utils/phone");

test("accepts phone numbers containing 7 to 15 digits", () => {
  assert.equal(isValidPhone("9876543210"), true);
  assert.equal(isValidPhone("1234567"), true);
  assert.equal(isValidPhone("123456789012345"), true);
});

test("rejects alphabetic and mixed phone input", () => {
  assert.equal(isValidPhone("ugbij"), false);
  assert.equal(isValidPhone("98765abc10"), false);
  assert.equal(isValidPhone("+919876543210"), false);
});

test("normalizes an already validated phone without changing its digits", () => {
  assert.equal(normalizePhone("9876543210"), "9876543210");
});