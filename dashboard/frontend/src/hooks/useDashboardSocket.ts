import { useEffect, useRef, useState, useCallback } from "react";
import type {
  CloudDepth,
  CloudStats,
  OdomFrame,
  ScanFrame,
  ServerFrame,
} from "../types";

export type ConnState = "connecting" | "open" | "closed";

export interface DashboardState {
  conn: ConnState;
  scan?: ScanFrame;
  odom?: OdomFrame;
  cloudStats?: CloudStats;
  cloudDepth?: CloudDepth;
  scanHz: number;
  cloudHz: number;
  depthHz: number;
  sendCmd: (linear: number, angular: number) => void;
}

const RATE_WINDOW_MS = 3000;

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

export function useDashboardSocket(): DashboardState {
  const [state, setState] = useState<Omit<DashboardState, "sendCmd">>({
    conn: "connecting",
    scanHz: 0,
    cloudHz: 0,
    depthHz: 0,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const scanTimes = useRef<number[]>([]);
  const cloudTimes = useRef<number[]>([]);
  const depthTimes = useRef<number[]>([]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const bumpRate = (arr: React.MutableRefObject<number[]>) => {
      const now = performance.now();
      arr.current.push(now);
      const cutoff = now - RATE_WINDOW_MS;
      while (arr.current.length && arr.current[0] < cutoff) {
        arr.current.shift();
      }
    };

    const rateHz = (arr: React.MutableRefObject<number[]>) =>
      (arr.current.length / RATE_WINDOW_MS) * 1000;

    const connect = () => {
      setState((s) => ({ ...s, conn: "connecting" }));
      ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onopen = () => setState((s) => ({ ...s, conn: "open" }));
      ws.onclose = () => {
        setState((s) => ({ ...s, conn: "closed" }));
        wsRef.current = null;
        if (!stopped) retry = setTimeout(connect, 1500);
      };
      ws.onerror = () => ws?.close();
      ws.onmessage = (ev) => {
        try {
          const frame: ServerFrame = JSON.parse(ev.data);
          const { scan, odom, cloud_stats, cloud_depth } = frame.topics;
          if (scan) bumpRate(scanTimes);
          if (cloud_stats) bumpRate(cloudTimes);
          if (cloud_depth) bumpRate(depthTimes);
          setState((s) => ({
            ...s,
            scan: scan ?? s.scan,
            odom: odom ?? s.odom,
            cloudStats: cloud_stats ?? s.cloudStats,
            cloudDepth: cloud_depth ?? s.cloudDepth,
            scanHz: rateHz(scanTimes),
            cloudHz: rateHz(cloudTimes),
            depthHz: rateHz(depthTimes),
          }));
        } catch (err) {
          console.warn("bad frame", err);
        }
      };
    };

    connect();

    const tick = setInterval(() => {
      setState((s) => ({
        ...s,
        scanHz: rateHz(scanTimes),
        cloudHz: rateHz(cloudTimes),
        depthHz: rateHz(depthTimes),
      }));
    }, 500);

    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      clearInterval(tick);
      ws?.close();
    };
  }, []);

  const sendCmd = useCallback((linear: number, angular: number) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "cmd_vel", linear, angular }));
  }, []);

  return { ...state, sendCmd };
}