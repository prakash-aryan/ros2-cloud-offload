"""Cloud-side depth-image processor.

Subscribes to /camera/depth/image_rect_raw (RealSense-style topic published by
the sim's depth_camera + ros_gz_bridge), computes a few summary stats per
frame, and republishes them as JSON on /cloud/depth_stats so the dashboard
can show what the cloud is actually doing.

The 'cloud offload' pitch: the local end ships ~6 MB/s of raw depth to the
cloud, and only a few hundred bytes of summary come back.
"""

import json
import socket
import time
from collections import deque

import numpy as np
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Image
from std_msgs.msg import String

# How "close" counts as a near-obstacle, in meters.
NEAR_THRESHOLD_M = 1.0


def _decode(msg: Image):
    """Return a (H, W) np.float32 depth array in meters, or None if unsupported."""
    if msg.encoding == "32FC1":
        depth = np.frombuffer(msg.data, dtype=np.float32).reshape(
            msg.height, msg.width
        )
    elif msg.encoding == "16UC1":
        depth = (
            np.frombuffer(msg.data, dtype=np.uint16)
            .reshape(msg.height, msg.width)
            .astype(np.float32)
            / 1000.0
        )
    else:
        return None
    return depth


class DepthListener(Node):
    def __init__(self):
        super().__init__("depth_listener")
        self._hostname = socket.gethostname()
        self._sub = self.create_subscription(
            Image,
            "/camera/depth/image_rect_raw",
            self._on_img,
            5,
        )
        self._pub = self.create_publisher(String, "/cloud/depth_stats", 10)
        self._byte_window: deque = deque(maxlen=120)
        self.get_logger().info(
            f"depth_listener up on {self._hostname}; "
            "subscribed to /camera/depth/image_rect_raw, "
            "publishing /cloud/depth_stats"
        )

    def _on_img(self, msg: Image) -> None:
        now = time.time()
        # Track received bytes/sec over a rolling window.
        self._byte_window.append((now, len(msg.data)))
        cutoff = now - 4.0
        while self._byte_window and self._byte_window[0][0] < cutoff:
            self._byte_window.popleft()
        if len(self._byte_window) >= 2:
            t0 = self._byte_window[0][0]
            bytes_in_window = sum(b for _, b in list(self._byte_window)[1:])
            bytes_per_sec = bytes_in_window / max(0.001, now - t0)
        else:
            bytes_per_sec = 0.0

        depth = _decode(msg)
        if depth is None:
            self.get_logger().warn(f"unsupported depth encoding {msg.encoding}")
            return
        valid = depth[np.isfinite(depth) & (depth > 0)]
        total_pixels = msg.width * msg.height
        if valid.size == 0:
            payload = {
                "hostname": self._hostname,
                "width": msg.width,
                "height": msg.height,
                "encoding": msg.encoding,
                "scan_ts": (
                    msg.header.stamp.sec + msg.header.stamp.nanosec * 1e-9
                ),
                "recv_ts": now,
                "bytes_per_sec": bytes_per_sec,
                "total_pixels": total_pixels,
                "valid_pixels": 0,
                "closest_m": None,
                "mean_m": None,
                "close_pixels": 0,
                "near_threshold_m": NEAR_THRESHOLD_M,
            }
        else:
            close_pixels = int(np.sum(valid < NEAR_THRESHOLD_M))
            payload = {
                "hostname": self._hostname,
                "width": msg.width,
                "height": msg.height,
                "encoding": msg.encoding,
                "scan_ts": (
                    msg.header.stamp.sec + msg.header.stamp.nanosec * 1e-9
                ),
                "recv_ts": now,
                "bytes_per_sec": bytes_per_sec,
                "total_pixels": total_pixels,
                "valid_pixels": int(valid.size),
                "closest_m": float(valid.min()),
                "mean_m": float(valid.mean()),
                "close_pixels": close_pixels,
                "near_threshold_m": NEAR_THRESHOLD_M,
            }
        out = String()
        out.data = json.dumps(payload)
        self._pub.publish(out)


def main(args=None):
    rclpy.init(args=args)
    node = DepthListener()
    try:
        rclpy.spin(node)
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
