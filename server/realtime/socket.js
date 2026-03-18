let io = null;

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
      socket.on("JOIN_CAFE", ({ cafeId }) => {
        if (!cafeId) return;
        socket.join(`cafe:${cafeId}`);
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

function emitCafeEvent(cafeId, event, payload) {
  if (!io || !cafeId) return;
  io.to(`cafe:${String(cafeId)}`).emit(event, payload);
}

module.exports = { initSocket, emitCafeEvent };

