import { SimpleGrid } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import type { CloudDepth } from "../types";
import { PanelCard } from "./PanelCard";
import { Row } from "./Row";

interface Props {
  depth?: CloudDepth;
  hz: number;
}

function fmtMeters(v: number | null | undefined) {
  return v == null ? "—" : `${v.toFixed(2)} m`;
}

function fmtBps(bps: number) {
  if (!Number.isFinite(bps) || bps <= 0) return "—";
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} MB/s`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} KB/s`;
  return `${bps.toFixed(0)} B/s`;
}

export function CloudDepthPanel({ depth, hz }: Props) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  let ageNode: [string, "good" | "warn" | "bad"] = ["—", "bad"];
  let latNode: [string, "good" | "warn" | "bad"] = ["—", "bad"];
  if (depth) {
    const ageMs = (Date.now() / 1000 - depth.seen_backend_ts) * 1000;
    ageNode = [
      `${ageMs.toFixed(0)} ms ago`,
      ageMs < 1500 ? "good" : ageMs < 5000 ? "warn" : "bad",
    ];
    const latMs = (depth.recv_ts - depth.scan_ts) * 1000;
    if (Number.isFinite(latMs)) {
      latNode = [
        `${latMs.toFixed(0)} ms`,
        Math.abs(latMs) < 250 ? "good" : Math.abs(latMs) < 1000 ? "warn" : "bad",
      ];
    }
  }

  const closePct =
    depth && depth.total_pixels > 0
      ? `${((depth.close_pixels / depth.total_pixels) * 100).toFixed(1)}%`
      : "—";

  return (
    <PanelCard
      title="Cloud /cloud/depth_stats"
      subtitle={depth ? `${depth.width}×${depth.height} ${depth.encoding}` : "waiting"}
    >
      <SimpleGrid columns={{ base: 2 }} gap={3}>
        <Row k="last seen" v={ageNode[0]} tone={ageNode[1]} />
        <Row k="one-way" v={latNode[0]} tone={latNode[1]} />
        <Row k="closest" v={fmtMeters(depth?.closest_m)} />
        <Row k="mean depth" v={fmtMeters(depth?.mean_m)} />
        <Row k={`< ${depth?.near_threshold_m ?? 1} m`} v={closePct} />
        <Row k="bandwidth in" v={fmtBps(depth?.bytes_per_sec ?? 0)} tone="warn" />
        <Row k="rate" v={`${hz.toFixed(1)} Hz`} />
      </SimpleGrid>
    </PanelCard>
  );
}
