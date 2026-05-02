"""Cloud-offload monitor — backend.

FastAPI app that:
  * runs an rclpy node in a background thread, subscribing to the local
    sensor topics plus the heartbeat topic the cloud-side node republishes;
  * fan-outs the latest message per topic to all connected WebSocket clients
    at a bounded rate (drops stale frames under load);
  * serves the compiled React SPA from ./frontend/dist at /.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import threading
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional, Set

import rclpy
from builtin_interfaces.msg import Time as RosTime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from geometry_msgs.msg import TwistStamped
from nav_msgs.msg import Odometry
from rclpy.executors import SingleThreadedExecutor
from rclpy.node import Node
from sensor_msgs.msg import LaserScan
from std_msgs.msg import String

LOG = logging.getLogger("offload.dashboard")
logging.basicConfig(level=logging.INFO)

HERE = Path(__file__).resolve().parent
FRONTEND_DIST = Path(
    os.environ.get("DASHBOARD_FRONTEND_DIST", HERE.parent / "frontend" / "dist")
)
PORT = int(os.environ.get("DASHBOARD_PORT", "8000"))

CMD_VEL_MAX_HZ = float(os.environ.get("CMD_VEL_MAX_HZ", "20"))
_CMD_VEL_MIN_INTERVAL = 1.0 / CMD_VEL_MAX_HZ


@dataclass
class LatestFrames:
    """Holds the most recent JSON payload per topic."""

    data: Dict[str, Any] = field(default_factory=dict)
    lock: threading.Lock = field(default_factory=threading.Lock)
    version: int = 0

    def update(self, topic: str, payload: Dict[str, Any]) -> None:
        with self.lock:
            self.data[topic] = payload
            self.version += 1

    def snapshot(self) -> Dict[str, Any]:
        with self.lock:
            return dict(self.data)


LATEST = LatestFrames()

_dashboard_node: "DashboardNode | None" = None


class DashboardNode(Node):

    def __init__(self) -> None:
        super().__init__("offload_dashboard_backend")
        self.create_subscription(LaserScan, "scan", self._on_scan, 10)
        self.create_subscription(Odometry, "odom", self._on_odom, 10)
        self.create_subscription(
            String, "/cloud/scan_stats", self._on_cloud_stats, 10
        )
        self.create_subscription(
            String, "/cloud/depth_stats", self._on_cloud_depth, 10
        )
        self._cmd_vel_pub = self.create_publisher(TwistStamped, "cmd_vel", 10)
        self._last_cmd_vel_ts: float = 0.0
        self.get_logger().info("dashboard backend node up")

    def publish_cmd_vel(self, linear: float, angular: float) -> bool:
        now = time.monotonic()
        if now - self._last_cmd_vel_ts < _CMD_VEL_MIN_INTERVAL:
            return False
        self._last_cmd_vel_ts = now
        msg = TwistStamped()
        ros_now = self.get_clock().now().to_msg()
        msg.header.stamp = ros_now
        msg.header.frame_id = "base_link"
        msg.twist.linear.x = float(linear)
        msg.twist.angular.z = float(angular)
        self._cmd_vel_pub.publish(msg)
        return True

    def _on_scan(self, msg: LaserScan) -> None:
        ranges = [
            r if math.isfinite(r) and r > 0.0 else None for r in msg.ranges
        ]
        LATEST.update(
            "scan",
            {
                "stamp": msg.header.stamp.sec + msg.header.stamp.nanosec * 1e-9,
                "angle_min": msg.angle_min,
                "angle_max": msg.angle_max,
                "angle_increment": msg.angle_increment,
                "range_min": msg.range_min,
                "range_max": msg.range_max,
                "ranges": ranges,
            },
        )

    def _on_odom(self, msg: Odometry) -> None:
        p = msg.pose.pose.position
        q = msg.pose.pose.orientation
        yaw = math.atan2(
            2 * (q.w * q.z + q.x * q.y),
            1 - 2 * (q.y * q.y + q.z * q.z),
        )
        LATEST.update(
            "odom",
            {
                "stamp": msg.header.stamp.sec + msg.header.stamp.nanosec * 1e-9,
                "x": p.x,
                "y": p.y,
                "yaw": yaw,
            },
        )

    def _on_cloud_stats(self, msg: String) -> None:
        try:
            payload = json.loads(msg.data)
        except json.JSONDecodeError:
            return
        payload["seen_backend_ts"] = time.time()
        LATEST.update("cloud_stats", payload)

    def _on_cloud_depth(self, msg: String) -> None:
        try:
            payload = json.loads(msg.data)
        except json.JSONDecodeError:
            return
        payload["seen_backend_ts"] = time.time()
        LATEST.update("cloud_depth", payload)


def start_ros_spin() -> None:
    global _dashboard_node
    rclpy.init()
    node = DashboardNode()
    _dashboard_node = node
    exe = SingleThreadedExecutor()
    exe.add_node(node)

    def _spin() -> None:
        try:
            exe.spin()
        finally:
            node.destroy_node()
            rclpy.shutdown()

    threading.Thread(target=_spin, daemon=True, name="rclpy-spin").start()
    LOG.info("rclpy spin thread started")


class ConnectionManager:
    def __init__(self) -> None:
        self.active: Set[WebSocket] = set()
        self.lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self.lock:
            self.active.add(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self.lock:
            self.active.discard(ws)

    async def broadcast(self, payload: str) -> None:
        async with self.lock:
            stale = []
            for ws in self.active:
                try:
                    await ws.send_text(payload)
                except Exception:
                    stale.append(ws)
            for ws in stale:
                self.active.discard(ws)


CONN = ConnectionManager()


async def broadcast_loop() -> None:
    """Push a snapshot of LATEST to all clients at ~20 Hz."""
    last_version: Optional[int] = None
    while True:
        await asyncio.sleep(0.05)
        with LATEST.lock:
            version = LATEST.version
            snapshot = dict(LATEST.data)
        if version == last_version:
            continue
        last_version = version
        await CONN.broadcast(
            json.dumps({"ts": time.time(), "topics": snapshot})
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_ros_spin()
    task = asyncio.create_task(broadcast_loop())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(title="ros2-cloud-offload", lifespan=lifespan)


@app.get("/api/health")
async def health() -> JSONResponse:
    snap = LATEST.snapshot()
    now = time.time()
    ages = {}
    for k, v in snap.items():
        ts = v.get("seen_backend_ts") or v.get("recv_ts") or v.get("stamp")
        if isinstance(ts, (int, float)):
            ages[k] = round((now - ts) * 1000, 1)
    return JSONResponse(
        {
            "ok": True,
            "topics_seen": sorted(snap.keys()),
            "ages_ms": ages,
            "clients": len(CONN.active),
        }
    )


@app.get("/api/config")
async def config() -> JSONResponse:
    """Display-only config — populated from .env via run_local.sh."""
    return JSONResponse(
        {
            "local": {
                "hostname": os.environ.get("LOCAL_HOSTNAME", "local"),
                "ip": os.environ.get("LOCAL_IP", ""),
            },
            "cloud": {
                "hostname": os.environ.get("CLOUD_HOSTNAME", "cloud"),
                "ip": os.environ.get("CLOUD_IP", ""),
                "ssh_user": os.environ.get("CLOUD_USER", ""),
            },
            "dds": {
                "interface": os.environ.get("DDS_INTERFACE", ""),
                "domain_id": os.environ.get("ROS_DOMAIN_ID", "0"),
            },
        }
    )


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await CONN.connect(ws)
    try:
        # Send initial snapshot so the UI populates immediately.
        await ws.send_text(
            json.dumps({"ts": time.time(), "topics": LATEST.snapshot()})
        )
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if msg.get("type") == "cmd_vel" and _dashboard_node is not None:
                _dashboard_node.publish_cmd_vel(
                    linear=float(msg.get("linear", 0.0)),
                    angular=float(msg.get("angular", 0.0)),
                )
    except WebSocketDisconnect:
        pass
    finally:
        await CONN.disconnect(ws)


# Static SPA mount. Must be last so /api/* and /ws win.
if FRONTEND_DIST.exists():
    app.mount(
        "/",
        StaticFiles(directory=str(FRONTEND_DIST), html=True),
        name="spa",
    )
else:
    LOG.warning("frontend dist missing at %s; serving API only", FRONTEND_DIST)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=PORT,
        log_level="info",
    )