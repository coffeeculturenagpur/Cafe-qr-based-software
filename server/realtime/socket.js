const { canAccessCafe } = require("../utils/tenant");
const { getUserFromSocketToken } = require("../utils/jwtUser");
const { verifyCustomerToken, CUSTOMER_COOKIE_NAME } = require("../utils/customerSession");
const { readSessionId, parseCookieHeader } = require("../utils/sessionIdentity");

let io = null;

const ROLE_ROOMS = {
  kitchen: "kitchen",
  staff: "staff",
  cafe_admin: "cafe_admin",
  super_admin: "super_admin",
};

function getCustomerSecret() {
  return process.env.CUSTOMER_JWT_SECRET || process.env.JWT_SECRET;
}

function joinCustomerIdentityRooms(socket) {
  const sessionId = readSessionId({ headers: socket.handshake.headers });
  if (sessionId) {
    socket.join(`session:${sessionId}`);
  }

  const cookies = parseCookieHeader(socket.handshake.headers?.cookie || "");
  const customerToken = cookies[CUSTOMER_COOKIE_NAME];
  if (!customerToken) return;

  try {
    const verified = verifyCustomerToken({
      token: customerToken,
      secret: getCustomerSecret(),
    });
    if (verified?.payload?.sub) {
      socket.join(`customer:${String(verified.payload.sub)}`);
    }
  } catch {
    // Ignore expired/invalid customer sessions for guest sockets.
  }
}

function initSocket(httpServer) {
  try {
    // Optional dependency: install `socket.io` to enable realtime.
    // If not installed, the app still runs (no-op realtime).
    // eslint-disable-next-line global-require
    const { Server } = require("socket.io");

    io = new Server(httpServer, {
      cors: { origin: "*", methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
    });

    io.on("connection", (socket) => {
      joinCustomerIdentityRooms(socket);

      socket.on("JOIN_CAFE", async ({ cafeId }) => {
        if (!cafeId) return;
        const token =
          socket.handshake.auth?.token ||
          socket.handshake.query?.token ||
          socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");

        if (token) {
          const user = await getUserFromSocketToken(String(token));
          if (!user) {
            socket.emit("JOIN_ERROR", { message: "Invalid or expired token" });
            return;
          }
          if (!canAccessCafe(user, cafeId)) {
            socket.emit("JOIN_ERROR", { message: "Forbidden: cannot join this cafe room" });
            return;
          }
          const role = ROLE_ROOMS[user.role];
          if (role) {
            socket.join(`cafe:${String(cafeId)}:role:${role}`);
          }
          return;
        }
        // No token: guest PWA / customer live order updates (still room-scoped by cafeId only)
        socket.join(`cafe:${String(cafeId)}`);
      });
    });

    // eslint-disable-next-line no-console
    console.log("Socket.io enabled");
    return io;
  } catch (error) {
    io = null;
    // eslint-disable-next-line no-console
    console.warn(
      "Socket.io not enabled (install `socket.io` to enable realtime):",
      error.message
    );
    return null;
  }
}

function emitToRole(cafeId, role, event, payload) {
  if (!io || !cafeId || !role) return;
  io.to(`cafe:${String(cafeId)}:role:${role}`).emit(event, payload);
}

function emitCafeEvent(cafeId, event, payload) {
  if (!io || !cafeId) return;
  const id = String(cafeId);
  const sessionId = payload?.sessionId ? String(payload.sessionId) : "";
  const customerId = payload?.customerId ? String(payload.customerId) : "";

  if (sessionId) {
    io.to(`session:${sessionId}`).emit(event, payload);
  }
  if (customerId) {
    io.to(`customer:${customerId}`).emit(event, payload);
  }

  if (event === "NEW_ORDER") {
    emitToRole(id, ROLE_ROOMS.kitchen, event, payload);
    emitToRole(id, ROLE_ROOMS.cafe_admin, event, payload);
    emitToRole(id, ROLE_ROOMS.super_admin, event, payload);
    return;
  }

  if (event === "ORDER_READY") {
    emitToRole(id, ROLE_ROOMS.staff, event, payload);
    emitToRole(id, ROLE_ROOMS.kitchen, event, payload);
    emitToRole(id, ROLE_ROOMS.cafe_admin, event, payload);
    emitToRole(id, ROLE_ROOMS.super_admin, event, payload);
    io.to(`cafe:${id}`).emit(event, payload);
    return;
  }

  if (event === "ORDER_PAID") {
    emitToRole(id, ROLE_ROOMS.staff, event, payload);
    emitToRole(id, ROLE_ROOMS.kitchen, event, payload);
    emitToRole(id, ROLE_ROOMS.cafe_admin, event, payload);
    emitToRole(id, ROLE_ROOMS.super_admin, event, payload);
    io.to(`cafe:${id}`).emit(event, payload);
    return;
  }

  if (event === "ORDER_UPDATED") {
    emitToRole(id, ROLE_ROOMS.kitchen, event, payload);
    emitToRole(id, ROLE_ROOMS.cafe_admin, event, payload);
    emitToRole(id, ROLE_ROOMS.super_admin, event, payload);
    if (payload?.status && ["ready", "served", "paid", "rejected"].includes(payload.status)) {
      emitToRole(id, ROLE_ROOMS.staff, event, payload);
    }
    io.to(`cafe:${id}`).emit(event, payload);
    return;
  }

  io.to(`cafe:${id}`).emit(event, payload);
}

module.exports = { initSocket, emitCafeEvent };

