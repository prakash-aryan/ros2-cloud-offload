import { SimpleGrid } from "@chakra-ui/react";
import { useMemo } from "react";
import type { ScanFrame } from "../types";
import { PanelCard } from "./PanelCard";
import { Row } from "./Row";

interface Props {
  scan?: ScanFrame;
  hz: number;
}

export function LocalStatsPanel({ scan, hz }: Props) {
  const { min, max, mean, finite } = useMemo(() => {
    if (!scan) return { min: null, max: null, mean: null, finite: 0 };
    let mn = Infinity;
    let mx = -Infinity;
    let sum = 0;
    let n = 0;
    for (const r of scan.ranges) {
      if (r == null) continue;
      if (r < mn) mn = r;
      if (r > mx) mx = r;
      sum += r;
      n++;
    }
    return n > 0
      ? { min: mn, max: mx, mean: sum / n, finite: n }
      : { min: null, max: null, mean: null, finite: 0 };
  }, [scan]);

  const fmt = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)} m`);

  return (
    <PanelCard title="Local /scan" subtitle="sim → browser">
      <SimpleGrid columns={{ base: 2 }} gap={3}>
        <Row k="beams" v={scan ? String(scan.ranges.length) : "—"} />
        <Row k="finite" v={String(finite)} />
        <Row k="min" v={fmt(min)} />
        <Row k="max" v={fmt(max)} />
        <Row k="mean" v={fmt(mean)} />
        <Row k="rate" v={`${hz.toFixed(1)} Hz`} />
      </SimpleGrid>
    </PanelCard>
  );
}
