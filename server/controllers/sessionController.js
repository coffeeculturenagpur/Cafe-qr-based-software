const { getCurrentCustomer } = require("./customerController");
const { getSessionState, getSessionStoreMode } = require("../services/sessionStore");
const { signTableToken } = require("../utils/tableToken");

function normalizeCafeId(value) {
  return value ? String(value).trim() : "";
}

exports.getSessionMe = async (req, res) => {
  try {
    const sessionId = req.sessionId || "";
    const requestedCafeId = normalizeCafeId(req.query.cafeId);
    const session = sessionId ? await getSessionState(sessionId) : null;
    const current = await getCurrentCustomer(req).catch(() => null);
    const customer = current?.customer || null;

    const sessionCafeId = normalizeCafeId(session?.cafeId);
    const cafeMatches = !requestedCafeId || !sessionCafeId || requestedCafeId === sessionCafeId;
    const tableNumber = cafeMatches ? Number(session?.tableNumber || 0) : 0;
    const tableContext =
      sessionCafeId && tableNumber > 0 && cafeMatches
        ? {
            cafeId: sessionCafeId,
            tableNumber,
            token: signTableToken(sessionCafeId, tableNumber),
          }
        : null;

    return res.json({
      sessionId,
      storeMode: getSessionStoreMode(),
      session: session
        ? {
            sessionId: session.sessionId || sessionId,
            cafeId: sessionCafeId || null,
            tableNumber: Number(session?.tableNumber || 0) || null,
            customerId: session?.customerId ? String(session.customerId) : null,
            createdAt: session.createdAt || null,
            updatedAt: session.updatedAt || null,
          }
        : null,
      customer: customer
        ? {
            id: String(customer._id),
            name: customer.name,
            phone: customer.phone,
            lastTableNumber: customer.lastTableNumber,
            lastCafeId: customer.lastCafeId ? String(customer.lastCafeId) : null,
          }
        : null,
      tableContext,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};
