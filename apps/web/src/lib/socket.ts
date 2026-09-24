import { io, type Socket } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

let socket: Socket | null = null;

// One shared connection per tab; the inbox page joins/leaves the
// workspace room as it mounts/unmounts rather than reconnecting.
export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, { withCredentials: true, autoConnect: true });
  }
  return socket;
}
