import { Box, Flex, HStack, Text, VStack } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { LuLaptop } from "react-icons/lu";
import { TbCloudComputing } from "react-icons/tb";
import type {
  AppConfig,
  CloudDepth,
  CloudStats,
  ScanFrame,
} from "../types";
import type { ConnState } from "../hooks/useDashboardSocket";
import { PanelCard } from "./PanelCard";

interface Props {
  conn: ConnState;
  scan?: ScanFrame;
  cloudStats?: CloudStats;
  cloudDepth?: CloudDepth;
  scanHz: number;
  cloudHz: number;
  depthHz: number;
  cfg: AppConfig | null;
}

type Status = "ok" | "stale" | "down";

const STATUS_COLOR: Record<Status, string> = {
  ok: "#48bb78",
  stale: "#ecc94b",
  down: "#f56565",
};

const STATUS_LABEL: Record<Status, string> = {
  ok: "running",
  stale: "stale",
  down: "no data",
};

interface ProcSpec {
  name: string;
  detail: string;
  status: Status;
}

function statusFromHz(hz: number): Status {
  if (hz >= 1) return "ok";
  if (hz > 0) return "stale";
  return "down";
}

function statusFromAge(ageMs: number | null): Status {
  if (ageMs == null) return "down";
  if (ageMs < 1500) return "ok";
  if (ageMs < 5000) return "stale";
  return "down";
}

function fmtBytesPerSec(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return "—";
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} MB/s`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} KB/s`;
  return `${bps.toFixed(0)} B/s`;
}

export function TopologyPanel({
  conn,
  scan,
  cloudStats,
  cloudDepth,
  scanHz,
  cloudHz,
  depthHz,
  cfg,
}: Props) {
  const scanStatus = statusFromHz(scanHz);
  const cloudAgeMs =
    cloudStats != null
      ? (Date.now() / 1000 - cloudStats.seen_backend_ts) * 1000
      : null;
  const depthAgeMs =
    cloudDepth != null
      ? (Date.now() / 1000 - cloudDepth.seen_backend_ts) * 1000
      : null;
  const cloudStatus = statusFromAge(cloudAgeMs);
  const depthStatus = statusFromAge(depthAgeMs);
  const backendStatus: Status = conn === "open" ? "ok" : "down";

  const localProcs: ProcSpec[] = [
    {
      name: "Gazebo Sim",
      detail: scan ? `${scan.ranges.length} beams + depth cam` : "starting…",
      status: scanStatus,
    },
    {
      name: "ros_gz_bridge",
      detail: scanHz > 0 ? `${scanHz.toFixed(1)} Hz scan` : "idle",
      status: scanStatus,
    },
    {
      name: "Dashboard backend",
      detail: conn === "open" ? "WebSocket open" : conn,
      status: backendStatus,
    },
  ];

  const cloudProcs: ProcSpec[] = [
    {
      name: "scan_listener",
      detail:
        cloudStats?.hostname != null ? `on ${cloudStats.hostname}` : "waiting",
      status: cloudStatus,
    },
    {
      name: "depth_listener",
      detail:
        cloudDepth?.hostname != null
          ? `${cloudDepth.width}×${cloudDepth.height} @ ${depthHz.toFixed(1)} Hz`
          : "waiting",
      status: depthStatus,
    },
  ];

  return (
    <PanelCard title="System Topology" subtitle="processes & data flow (live)">
      <Flex
        align="center"
        justify="space-between"
        gap={4}
        direction={{ base: "column", md: "row" }}
      >
        <MachineCard
          icon={<LuLaptop size={140} color="#63b3ed" />}
          title="Local — robot/sim"
          host={cfg?.local.hostname ?? "local"}
          subhost={cfg?.local.ip}
          badge="sim"
          badgeColor="#63b3ed"
          procs={localProcs}
        />

        <Box flex={1} minW={{ base: "100%", md: "300px" }} alignSelf="stretch">
          <ArrowsSvg
            scanHz={scanHz}
            cloudHz={cloudHz}
            depthHz={depthHz}
            depthBps={cloudDepth?.bytes_per_sec ?? 0}
          />
        </Box>

        <MachineCard
          icon={<TbCloudComputing size={150} color="#9f7aea" />}
          title="Cloud — offload host"
          host={cloudStats?.hostname ?? cfg?.cloud.hostname ?? "cloud"}
          subhost={cfg?.cloud.ip}
          badge="cloud"
          badgeColor="#9f7aea"
          procs={cloudProcs}
        />
      </Flex>

      <HStack
        justify="center"
        gap={6}
        mt={4}
        fontSize="xs"
        color="gray.400"
      >
        <HStack gap={2}>
          <Dot color={STATUS_COLOR.ok} />
          <Text>{STATUS_LABEL.ok}</Text>
        </HStack>
        <HStack gap={2}>
          <Dot color={STATUS_COLOR.stale} />
          <Text>{STATUS_LABEL.stale}</Text>
        </HStack>
        <HStack gap={2}>
          <Dot color={STATUS_COLOR.down} />
          <Text>{STATUS_LABEL.down}</Text>
        </HStack>
        <Text fontFamily="mono">DDS · Tailscale · domain 0</Text>
      </HStack>
    </PanelCard>
  );
}

interface MachineCardProps {
  icon: React.ReactNode;
  title: string;
  host: string;
  subhost?: string;
  badge: string;
  badgeColor: string;
  procs: ProcSpec[];
}

function MachineCard({
  icon,
  title,
  host,
  subhost,
  badge,
  badgeColor,
  procs,
}: MachineCardProps) {
  return (
    <VStack
      align="stretch"
      gap={3}
      w={{ base: "100%", md: "280px" }}
      bg="gray.900"
      borderWidth="1px"
      borderColor="gray.800"
      borderRadius="lg"
      p={5}
    >
      <Flex justify="center" align="center" h="160px">
        {icon}
      </Flex>
      <Flex align="baseline" justify="space-between">
        <Box>
          <Text fontSize="sm" fontWeight="600" color="gray.100">
            {title}
          </Text>
          <Text fontSize="xs" color="gray.400" fontFamily="mono">
            {host}
            {subhost ? ` · ${subhost}` : ""}
          </Text>
        </Box>
        <Text
          fontSize="10px"
          fontWeight="600"
          textTransform="uppercase"
          color={badgeColor}
          bg={`${badgeColor}33`}
          px={2}
          py={0.5}
          borderRadius="full"
        >
          {badge}
        </Text>
      </Flex>
      <VStack
        align="stretch"
        gap={2}
        pt={1}
        borderTopWidth="1px"
        borderColor="gray.800"
      >
        {procs.map((p) => (
          <HStack key={p.name} gap={3} pt={2}>
            <Dot color={STATUS_COLOR[p.status]} />
            <Box>
              <Text fontSize="xs" color="gray.100" fontFamily="mono">
                {p.name}
              </Text>
              <Text fontSize="10px" color="gray.500" fontFamily="mono">
                {p.detail}
              </Text>
            </Box>
          </HStack>
        ))}
      </VStack>
    </VStack>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <Box
      as="span"
      display="inline-block"
      flexShrink={0}
      w="8px"
      h="8px"
      borderRadius="50%"
      bg={color}
    />
  );
}

interface FlowSpec {
  topic: string;
  detail: string;
  hz: number;
  color: string;
  direction: "down" | "up"; // down = local→cloud
  y: number;
}

function ArrowsSvg({
  scanHz,
  cloudHz,
  depthHz,
  depthBps,
}: {
  scanHz: number;
  cloudHz: number;
  depthHz: number;
  depthBps: number;
}) {
  const [tick, setTick] = useState(0);
  const startRef = useRef(performance.now());
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setTick(performance.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const W = 360;
  const H = 320;
  const x0 = 12;
  const x1 = W - 12;

  const flows: FlowSpec[] = [
    {
      topic: "/scan",
      detail: scanHz > 0 ? `${scanHz.toFixed(1)} Hz` : "—",
      hz: scanHz,
      color: "#63b3ed",
      direction: "down",
      y: 50,
    },
    {
      topic: "/cloud/scan_stats",
      detail: cloudHz > 0 ? `${cloudHz.toFixed(1)} Hz` : "—",
      hz: cloudHz,
      color: "#7f9cf5",
      direction: "up",
      y: 120,
    },
    {
      topic: "/camera/depth/image_rect_raw",
      detail:
        depthHz > 0
          ? `${depthHz.toFixed(1)} Hz · ${fmtBytesPerSec(depthBps)}`
          : "—",
      hz: depthHz,
      color: "#fbb267",
      direction: "down",
      y: 200,
    },
    {
      topic: "/cloud/depth_stats",
      detail: depthHz > 0 ? `${depthHz.toFixed(1)} Hz` : "—",
      hz: depthHz,
      color: "#9f7aea",
      direction: "up",
      y: 270,
    },
  ];

  // Fixed, calm flow speed — the dot is symbolic, not an actual packet,
  // so we don't tie it to topic Hz. Higher-rate flows just get a brighter dot.
  const PERIOD_MS = 2800;
  const phase = (offset = 0) => ((tick + offset) % PERIOD_MS) / PERIOD_MS;
  // Smoothstep eases the dot at the line endpoints so it doesn't snap back.
  const smoothstep = (t: number) => t * t * (3 - 2 * t);
  // Soft fade-in/out near the line ends.
  const dotOpacity = (t: number) => {
    const edge = 0.08;
    if (t < edge) return t / edge;
    if (t > 1 - edge) return (1 - t) / edge;
    return 1;
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="auto"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block" }}
    >
      <defs>
        {flows.map((f, i) => (
          <marker
            key={i}
            id={`arr-${i}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={f.color} />
          </marker>
        ))}
      </defs>
      {/* Subtle separator between scan-flows and depth-flows */}
      <line
        x1={x0}
        y1={160}
        x2={x1}
        y2={160}
        stroke="#1f2937"
        strokeDasharray="4 4"
        strokeWidth={1}
      />

      {flows.map((f, i) => {
        const fromX = f.direction === "down" ? x0 : x1;
        const toX = f.direction === "down" ? x1 : x0;
        // Stagger flows so all four dots aren't synced.
        const offset = i * (PERIOD_MS / flows.length);
        const t = phase(offset);
        const eased = smoothstep(t);
        const dotX =
          f.direction === "down"
            ? x0 + (x1 - x0) * eased
            : x1 - (x1 - x0) * eased;
        const opacity = dotOpacity(t);
        // Brighter dot for higher-rate flows.
        const r = f.hz >= 12 ? 5.5 : f.hz >= 5 ? 4.5 : 3.5;
        return (
          <g key={f.topic}>
            <line
              x1={fromX}
              y1={f.y}
              x2={toX}
              y2={f.y}
              stroke={f.color}
              strokeWidth={2}
              strokeOpacity={0.35}
              markerEnd={`url(#arr-${i})`}
            />
            <text
              x={W / 2}
              y={f.y - 10}
              fill="#cbd5e0"
              fontSize="12"
              fontFamily="ui-monospace, monospace"
              textAnchor="middle"
            >
              {f.topic}
            </text>
            <text
              x={W / 2}
              y={f.y + 18}
              fill={f.color}
              fontSize="10.5"
              fontFamily="ui-monospace, monospace"
              textAnchor="middle"
            >
              {f.detail}
            </text>
            {f.hz > 0 && (
              <circle
                cx={dotX}
                cy={f.y}
                r={r}
                fill={f.color}
                opacity={opacity}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
