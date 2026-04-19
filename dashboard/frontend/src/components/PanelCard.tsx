import { Box, Flex, Heading, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function PanelCard({ title, subtitle, children }: Props) {
  return (
    <Box
      bg="gray.900"
      borderRadius="lg"
      borderWidth="1px"
      borderColor="gray.800"
      p={5}
      h="100%"
    >
      <Flex align="baseline" justify="space-between" mb={3}>
        <Heading
          size="xs"
          textTransform="uppercase"
          letterSpacing="wider"
          color="gray.400"
        >
          {title}
        </Heading>
        {subtitle && (
          <Text fontSize="xs" color="gray.500" fontFamily="mono">
            {subtitle}
          </Text>
        )}
      </Flex>
      {children}
    </Box>
  );
}
