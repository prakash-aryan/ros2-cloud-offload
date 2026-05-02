import { useEffect, useRef, useCallback } from "react";
import { Box, Grid, Text, VStack } from "@chakra-ui/react";
import { PanelCard } from "./PanelCard";

const LINEAR_SPEED = 0.22;
const ANGULAR_SPEED = 2.0;
const PUBLISH_HZ = 10; // how often to re-send while a key is held

interface Props {
  sendCmd: (linear: number, angular: number) => void;
}

// Map keyboard key → [linear, angular] multipliers
const KEY_MAP: Record<string, [number, number]> = {
  w: [1, 0],
  arrowup: [1, 0],
  s: [-1, 0],
  arrowdown: [-1, 0],
  a: [0, 1],
  arrowleft: [0, 1],
  d: [0, -1],
  arrowright: [0, -1],
};

export function useTeleop(sendCmd: (l: number, a: number) => void) {
  const held = useRef<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const publish = useCallback(() => {
    let lin = 0;
    let ang = 0;
    for (const k of held.current) {
      const m = KEY_MAP[k];
      if (m) {
        lin += m[0];
        ang += m[1];
      }
    }
    lin = Math.max(-1, Math.min(1, lin));
    ang = Math.max(-1, Math.min(1, ang));
    sendCmd(lin * LINEAR_SPEED, ang * ANGULAR_SPEED);
  }, [sendCmd]);

  const startLoop = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(publish, 1000 / PUBLISH_HZ);
  }, [publish]);

  const stopLoop = useCallback(() => {
    if (!intervalRef.current) return;
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    sendCmd(0, 0);
  }, [sendCmd]);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!KEY_MAP[key]) return;
      e.preventDefault();
      held.current.add(key);
      startLoop();
    };
    const onUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      held.current.delete(key);
      if (held.current.size === 0) stopLoop();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      stopLoop();
    };
  }, [startLoop, stopLoop]);

  return { held, startLoop, stopLoop, publish };
}

// -- on screen d-pad buttons --

interface BtnProps {
  label: string;
  keys: string[];
  held: React.MutableRefObject<Set<string>>;
  startLoop: () => void;
  stopLoop: () => void;
  gridArea: string;
}

function DpadBtn({ label, keys, held, startLoop, stopLoop, gridArea }: BtnProps) {
  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    keys.forEach((k) => held.current.add(k));
    startLoop();
  };
  const onPointerUp = () => {
    keys.forEach((k) => held.current.delete(k));
    if (held.current.size === 0) stopLoop();
  };

  return (
    <Box
      gridArea={gridArea}
      as="button"
      display="flex"
      alignItems="center"
      justifyContent="center"
      w="52px"
      h="52px"
      bg="gray.800"
      borderRadius="md"
      borderWidth="1px"
      borderColor="gray.600"
      color="gray.200"
      fontSize="xl"
      cursor="pointer"
      userSelect="none"
      _active={{ bg: "blue.700", borderColor: "blue.400" }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {label}
    </Box>
  );
}

// -- panel --

export function TeleopPanel({ sendCmd }: Props) {
  const { held, startLoop, stopLoop } = useTeleop(sendCmd);

  const btnProps = { held, startLoop, stopLoop };

  return (
    <PanelCard
      title="Teleop"
      subtitle={`keyboard (WASD / arrows) - ${LINEAR_SPEED} m/s - ${ANGULAR_SPEED} rad/s`}
    >
      <VStack gap={4} align="center" py={2}>
        {/* D-pad grid: 3×3, centre cell empty */}
        <Grid
          templateAreas={`
            ".    fwd  ."
            "lft  .    rgt"
            ".    bwd  ."
          `}
          templateColumns="52px 52px 52px"
          templateRows="52px 52px 52px"
          gap="6px"
        >
          <DpadBtn label="▲" keys={["w", "arrowup"]}    gridArea="fwd" {...btnProps} />
          <DpadBtn label="◀" keys={["a", "arrowleft"]}  gridArea="lft" {...btnProps} />
          <DpadBtn label="▶" keys={["d", "arrowright"]} gridArea="rgt" {...btnProps} />
          <DpadBtn label="▼" keys={["s", "arrowdown"]}  gridArea="bwd" {...btnProps} />
        </Grid>

        <Text fontSize="xs" color="gray.500" textAlign="center" fontFamily="mono">
          W fwd &nbsp;·&nbsp; S back &nbsp;·&nbsp; A rotate left &nbsp;·&nbsp; D rotate right
        </Text>
      </VStack>
    </PanelCard>
  );
}
