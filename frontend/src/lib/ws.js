import { useEffect, useRef } from "react";
import { BACKEND_URL } from "./api";

// Persistent WebSocket subscription for live updates.
export function useLiveEvents(onEvent, enabled = true) {
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    const token = localStorage.getItem("s8_token");
    if (!token) return;
    let ws;
    let closed = false;
    let retry;

    const connect = () => {
      const wsUrl = BACKEND_URL.replace(/^http/, "ws") + `/api/ws?token=${token}`;
      ws = new WebSocket(wsUrl);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          cbRef.current && cbRef.current(msg);
        } catch (_) {}
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      ws && ws.close();
    };
  }, [enabled]);
}
