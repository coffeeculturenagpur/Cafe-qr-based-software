/** Normalize phone for uniqueness (digits only, keep leading country digits). */
function normalizePhone(input) {
  if (!input || typeof input !== "string") return "";
  const digits = input.replace(/\D/g, "");
  return digits;
}

/** Validate the user-entered phone before normalizePhone can discard invalid characters. */
function isValidPhone(input) {
  return typeof input === "string" && /^\d{7,15}$/.test(input.trim());
}

module.exports = { normalizePhone, isValidPhone };
