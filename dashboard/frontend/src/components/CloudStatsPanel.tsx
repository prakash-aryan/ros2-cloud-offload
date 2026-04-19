import { SimpleGrid } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import type { CloudStats } from "../types";
import { PanelCard } from "./PanelCard";
import { Row } from "./Row";

interface Props {
  stats?: CloudStats;
  hz: number;
}

export function CloudStatsPanel({ stats, hz }: Props) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  const fmt = (v: number | null | undefined) =>
    v == null ? "—" : `${v.toFixed(2)} m`;

  let ageNode: [string, "good" | "warn" | "bad"] = ["—", "bad"];
  let latNode: [string, "good" | "warn" | "bad"] = ["—", "bad"];
  if (stats) {
    const ageMs = (Date.now() / 1000 - stats.seen_backend_ts) * 1000;
    ageNode = [
      `${ageMs.toFixed(0)} ms ago`,
      ageMs < 1500 ? "good" : ageMs < 5000 ? "warn" : "bad",
    ];
    const latMs = (stats.recv_ts - stats.scan_ts) * 1000;
    if (Number.isFinite(latMs)) {
      latNode = [
        `${latMs.toFixed(0)} ms`,
        Math.abs(latMs) < 200 ? "good" : Math.abs(latMs) < 1000 ? "warn" : "bad",
      ];
    }
  }

  return (
    <PanelCard
      title="Cloud /cloud/scan_stats"
      subtitle={stats ? stats.hostname : "waiting"}
    >
      <SimpleGrid columns={{ base: 2 }} gap={3}>
        <Row k="last seen" v={ageNode[0]} tone={ageNode[1]} />
        <Row k="one-way" v={latNode[0]} tone={latNode[1]} />
        <Row k="min" v={fmt(stats?.min)} />
        <Row k="max" v={fmt(stats?.max)} />
        <Row k="mean" v={fmt(stats?.mean)} />
        <Row k="rate" v={`${hz.toFixed(1)} Hz`} />
      </SimpleGrid>
    </PanelCard>
  );
}
