import { Box, Container, Grid, GridItem } from "@chakra-ui/react";
import { Header } from "./components/Header";
import { TopologyPanel } from "./components/TopologyPanel";
import { LocalStatsPanel } from "./components/LocalStatsPanel";
import { CloudStatsPanel } from "./components/CloudStatsPanel";
import { CloudDepthPanel } from "./components/CloudDepthPanel";
import { TeleopPanel } from "./components/TeleopPanel";
import { useDashboardSocket } from "./hooks/useDashboardSocket";
import { useConfig } from "./hooks/useConfig";

export default function App() {
  const state = useDashboardSocket();
  const cfg = useConfig();

  return (
    <Box minH="100vh" bg="gray.950" color="gray.50">
      <Header conn={state.conn} cfg={cfg} />
      <Container maxW="7xl" py={6}>
        <Grid templateColumns="1fr" gap={6}>
          <GridItem>
            <TopologyPanel
              conn={state.conn}
              scan={state.scan}
              cloudStats={state.cloudStats}
              cloudDepth={state.cloudDepth}
              scanHz={state.scanHz}
              cloudHz={state.cloudHz}
              depthHz={state.depthHz}
              cfg={cfg}
            />
          </GridItem>
          <Grid templateColumns={{ base: "1fr", lg: "1fr 1fr 1fr 1fr" }} gap={6}>
            <GridItem>
              <LocalStatsPanel scan={state.scan} hz={state.scanHz} />
            </GridItem>
            <GridItem>
              <CloudStatsPanel stats={state.cloudStats} hz={state.cloudHz} />
            </GridItem>
            <GridItem>
              <CloudDepthPanel depth={state.cloudDepth} hz={state.depthHz} />
            </GridItem>
            <GridItem>
              <TeleopPanel sendCmd={state.sendCmd} />
            </GridItem>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}