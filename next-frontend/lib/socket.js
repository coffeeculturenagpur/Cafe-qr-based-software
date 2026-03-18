import { io } from "socket.io-client";
import { getApiBaseUrl } from "./api";

export function connectCafeSocket(cafeId) {
  const baseUrl = getApiBaseUrl();
  const socket = io(baseUrl, { transports: ["websocket"] });

  socket.on("connect", () => {
    if (cafeId) socket.emit("JOIN_CAFE", { cafeId });
  });

  return socket;
}