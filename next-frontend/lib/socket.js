import { io } from "socket.io-client";
import { getApiBaseUrl } from "./api";
import { getToken } from "./auth";

export function connectCafeSocket(cafeId) {
  // Prefer explicit API base; otherwise same origin (Next rewrite / same host deploy).
  const baseUrl =
    getApiBaseUrl() ||
    (typeof window !== "undefined" ? window.location.origin : undefined);
  const token = typeof window !== "undefined" ? getToken() : null;
  const socket = io(baseUrl, {
    transports: ["websocket", "polling"],
    auth: token ? { token } : {},
  });

  socket.on("connect", () => {
    if (cafeId) socket.emit("JOIN_CAFE", { cafeId });
  });

  return socket;
}
