# Copyright 2026 The Regents of the University of California (Regents)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Cloud-side LaserScan subscriber.

Logs per-frame stats and republishes them as JSON on /cloud/scan_stats so
the local dashboard can prove the cloud node is actually processing scans.
"""

import json
import math
import socket
import time

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import LaserScan
from std_msgs.msg import String


class ScanListener(Node):
    def __init__(self):
        super().__init__("scan_listener")
        self._hostname = socket.gethostname()
        self._sub = self.create_subscription(
            LaserScan, "scan", self._on_scan, 10
        )
        self._stats_pub = self.create_publisher(String, "/cloud/scan_stats", 10)
        self.get_logger().info(
            f"scan_listener up on {self._hostname}; "
            "waiting for /scan, publishing /cloud/scan_stats"
        )

    def _on_scan(self, msg: LaserScan) -> None:
        finite = [r for r in msg.ranges if math.isfinite(r) and r > 0.0]
        scan_ts = msg.header.stamp.sec + msg.header.stamp.nanosec * 1e-9
        if not finite:
            payload = {
                "hostname": self._hostname,
                "beams": len(msg.ranges),
                "scan_ts": scan_ts,
                "recv_ts": time.time(),
                "min": None,
                "max": None,
                "mean": None,
            }
            self.get_logger().info(
                f"scan({len(msg.ranges)} beams) — all inf/NaN/0"
            )
        else:
            payload = {
                "hostname": self._hostname,
                "beams": len(msg.ranges),
                "scan_ts": scan_ts,
                "recv_ts": time.time(),
                "min": min(finite),
                "max": max(finite),
                "mean": sum(finite) / len(finite),
            }
            self.get_logger().info(
                f"scan({len(msg.ranges)} beams) "
                f"min={payload['min']:.2f}m max={payload['max']:.2f}m "
                f"mean={payload['mean']:.2f}m"
            )
        out = String()
        out.data = json.dumps(payload)
        self._stats_pub.publish(out)


def main(args=None):
    rclpy.init(args=args)
    node = ScanListener()
    try:
        rclpy.spin(node)
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
