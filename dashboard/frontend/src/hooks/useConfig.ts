import { useEffect, useState } from "react";
import type { AppConfig } from "../types";

export function useConfig(): AppConfig | null {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((r) => r.json())
      .then((j: AppConfig) => {
        if (!cancelled) setCfg(j);
      })
      .catch((err) => console.warn("failed to load /api/config", err));
    return () => {
      cancelled = true;
    };
  }, []);
  return cfg;
}
