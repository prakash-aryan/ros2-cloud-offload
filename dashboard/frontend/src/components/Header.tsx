import { Badge, Box, Flex, Heading, Text } from "@chakra-ui/react";
import type { ConnState } from "../hooks/useDashboardSocket";
import type { AppConfig } from "../types";

const COLORS: Record<ConnState, string> = {
  connecting: "yellow",
  open: "green",
  closed: "red",
};

interface Props {
  conn: ConnState;
  cfg: AppConfig | null;
}

export function Header({ conn, cfg }: Props) {
  return (
    <Box
      borderBottomWidth="1px"
      borderColor="gray.800"
      bg="gray.900"
      px={6}
      py={4}
    >
      <Flex align="center" gap={4} maxW="7xl" mx="auto">
        <Heading size="md" color="blue.200" fontFamily="mono">
          ros2-cloud-offload
        </Heading>
        <Badge colorPalette={COLORS[conn]} variant="subtle">
          {conn}
        </Badge>
        <Box flex={1} />
        {cfg && (
          <Text fontSize="xs" color="gray.400" fontFamily="mono">
            {cfg.local.hostname} → {cfg.cloud.hostname} ·{" "}
            {cfg.dds.interface || "—"} · domain {cfg.dds.domain_id}
          </Text>
        )}
      </Flex>
    </Box>
  );
}
