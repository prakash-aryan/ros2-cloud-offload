# Copyright 2026 The Regents of the University of California (Regents)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""TurtleBot3 (burger) in Gazebo Sim Harmonic, /scan offloaded to the cloud.

Local entities:
  * gz sim Harmonic running the ROBOTIS turtlebot3_world world
  * ros_gz_sim `create` to spawn the burger
  * ros_gz_bridge mapping /scan, /cmd_vel, /odom, /clock, /imu, /tf
  * FastAPI (uvicorn) on :8000 — serves the React SPA + WebSocket stream
    (rclpy subscribes to /scan, /odom, /cloud/scan_stats and fans them out)

Cloud entity (workstation):
  * scan_listener (fogros2_examples) — logs LaserScan stats per frame
    and republishes them as JSON on /cloud/scan_stats

Env (set in .env, applied by run_local.sh — see .env.example):
    CLOUD_IP, CLOUD_USER, CLOUD_SSH_KEY, LOCAL_IP, DDS_INTERFACE
    GZ_HEADLESS=1     -> gz server only (no GUI)
    DASHBOARD=0       -> skip dashboard backend

After launch, open http://localhost:8000 in a browser on the host.

The vendored TB3 burger model + world live under fogros2_examples/{models,worlds};
they originate from ROBOTIS-GIT/turtlebot3_simulations (jazzy branch, Apache 2.0).
"""

import os

from ament_index_python.packages import get_package_share_directory
from launch.actions import (
    AppendEnvironmentVariable,
    ExecuteProcess,
)
from launch_ros.actions import Node

import fogros2


def _required_env(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        raise RuntimeError(
            f"required env var {name} is not set; copy .env.example to .env "
            "and start via ./run_local.sh"
        )
    return val


def generate_launch_description():
    cloud_ip = _required_env("CLOUD_IP")
    cloud_user = _required_env("CLOUD_USER")
    ssh_key = _required_env("CLOUD_SSH_KEY")
    local_ip = _required_env("LOCAL_IP")
    dds_iface = os.environ.get("DDS_INTERFACE", "tailscale0")
    headless = os.environ.get("GZ_HEADLESS", "0") == "1"
    enable_dashboard = os.environ.get("DASHBOARD", "1") == "1"
    backend_dir = os.environ.get(
        "DASHBOARD_BACKEND_DIR", "/opt/dashboard/backend"
    )
    dashboard_port = os.environ.get("DASHBOARD_PORT", "8000")

    pkg_share = get_package_share_directory("fogros2_examples")
    world_path = os.path.join(pkg_share, "worlds", "turtlebot3_world.world")
    burger_sdf = os.path.join(
        pkg_share, "models", "turtlebot3_burger", "model.sdf"
    )
    bridge_yaml = os.path.join(
        pkg_share, "params", "turtlebot3_burger_bridge.yaml"
    )

    ld = fogros2.FogROSLaunchDescription()
    machine = fogros2.LocalMachine(
        ip=cloud_ip,
        ssh_username=cloud_user,
        ssh_key_path=ssh_key,
        local_ip=local_ip,
        dds_interface=dds_iface,
        remote_dds_interface=os.environ.get("REMOTE_DDS_INTERFACE", "enp0s8"),
    )

    # Gazebo needs to find both turtlebot3_burger and turtlebot3_common.
    set_gz_resource_path = AppendEnvironmentVariable(
        "GZ_SIM_RESOURCE_PATH", os.path.join(pkg_share, "models")
    )

    gz_args = ["gz", "sim", "-r", "-v", "2"]
    if headless:
        gz_args.append("-s")
    gz_args.append(world_path)
    gz_sim = ExecuteProcess(cmd=gz_args, output="screen")

    spawn_burger = Node(
        package="ros_gz_sim",
        executable="create",
        arguments=[
            "-name", "turtlebot3_burger",
            "-file", burger_sdf,
            "-x", "-2.0",
            "-y", "-0.5",
            "-z", "0.01",
        ],
        output="screen",
    )

    bridge = Node(
        package="ros_gz_bridge",
        executable="parameter_bridge",
        arguments=[
            "--ros-args", "-p", f"config_file:={bridge_yaml}",
        ],
        output="screen",
    )

    scan_node = fogros2.CloudNode(
        package="fogros2_examples",
        executable="scan_listener",
        output="screen",
        machine=machine,
    )
    depth_node = fogros2.CloudNode(
        package="fogros2_examples",
        executable="depth_listener",
        output="screen",
        machine=machine,
    )

    ld.add_action(set_gz_resource_path)
    ld.add_action(gz_sim)
    ld.add_action(spawn_burger)
    ld.add_action(bridge)
    ld.add_action(scan_node)
    ld.add_action(depth_node)

    if enable_dashboard:
        dash_server = ExecuteProcess(
            cmd=[
                "python3", "-m", "uvicorn", "main:app",
                "--host", "0.0.0.0",
                "--port", dashboard_port,
                "--app-dir", backend_dir,
            ],
            output="screen",
        )
        ld.add_action(dash_server)
    return ld
