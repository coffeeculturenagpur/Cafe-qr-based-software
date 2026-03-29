/**
 * Default public URL for customer ordering (table QR links). Set in .env so QRs stay
 * valid when the admin UI is opened on a different host than guests use.
 */
export function getEnvCustomerAppUrl() {
  const raw = process.env.NEXT_PUBLIC_CUSTOMER_APP_URL;
  if (!raw || typeof raw !== "string") return "";
  return raw.replace(/\/$/, "").trim();
}
