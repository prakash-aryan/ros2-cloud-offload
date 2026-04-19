import { Box, Flex, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

interface Props {
  k: string;
  v: ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
}

const TONE: Record<NonNullable<Props["tone"]>, string> = {
  default: "gray.100",
  good: "green.300",
  warn: "yellow.300",
  bad: "red.300",
};

export function Row({ k, v, tone = "default" }: Props) {
  return (
    <Flex justify="space-between" align="baseline" py={1}>
      <Text fontSize="sm" color="gray.500">
        {k}
      </Text>
      <Box as="span" fontFamily="mono" fontSize="sm" color={TONE[tone]}>
        {v}
      </Box>
    </Flex>
  );
}
