# Copyright 2026 The Regents of the University of California (Regents)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Use an existing SSH-reachable host as a FogROS2 cloud target.

Unlike the AWS / GCP / Kubernetes providers, this one does not provision
anything. It expects ROS, colcon, and a writable home directory to already
exist on the remote host, and assumes the local and cloud machines can reach
each other directly (e.g. same LAN, VPN already up, or Tailscale).
"""

import json
import os
import subprocess

from .cloud_instance import CloudInstance
from .command_builder import BashBuilder
from .dds_config_builder import CycloneConfigBuilder


class LocalMachine(CloudInstance):
    """Treat an already-reachable host as a FogROS2 cloud target."""

    def __init__(
        self,
        ip,
        ssh_username,
        ssh_key_path,
        local_ip=None,
        remote_home=None,
        remote_colcon="/usr/bin/colcon",
        push_workspace=True,
        extra_dds_peers=(),
        dds_interface="tailscale0",
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.cloud_service_provider = "Local"

        self._ip = ip
        self._username = ssh_username
        self._ssh_key_path = ssh_key_path
        self._local_ip = local_ip
        self._remote_home = remote_home or f"/home/{ssh_username}"
        self._remote_colcon = remote_colcon
        self._push_workspace = push_workspace
        self._extra_dds_peers = list(extra_dds_peers)
        self._dds_interface = dds_interface

        self.create()

    def create(self):
        self.logger.info(
            f"Using existing host {self._username}@{self._ip} as cloud target"
        )
        self.info(flush_to_disk=True)
        self.connect()
        if self._push_workspace:
            self.push_ros_workspace()
        self.info(flush_to_disk=True)
        self._is_created = True

    def info(self, flush_to_disk=True):
        info_dict = super().info(flush_to_disk)
        info_dict["ssh_username"] = self._username
        info_dict["remote_home"] = self._remote_home
        if flush_to_disk:
            with open(os.path.join(self._working_dir, "info"), "w+") as f:
                json.dump(info_dict, f)
        return info_dict

    def force_start_vpn(self):
        return False

    def push_ros_workspace(self):
        # Only tar the `src/` tree so the cloud rebuilds from clean source.
        # Pushing local build/ + install/ would carry symlinks pointing into
        # this machine's filesystem, which won't resolve on the cloud.
        workspace_path = self.ros_workspace
        src_path = os.path.join(workspace_path, "src")
        if not os.path.isdir(src_path):
            raise RuntimeError(
                f"expected colcon src dir at {src_path}; is the workspace "
                "rooted somewhere else?"
            )
        tar_path = "/tmp/fogros2_src.tar"
        subprocess.check_call(
            [
                "tar",
                "-cf",
                tar_path,
                "--exclude=.git",
                "--exclude=build",
                "--exclude=install",
                "--exclude=log",
                "-C",
                workspace_path,
                "src",
            ]
        )
        self.scp.execute_cmd(
            f"rm -rf {self._remote_home}/fog_ws/src "
            f"{self._remote_home}/fog_ws/build "
            f"{self._remote_home}/fog_ws/install "
            f"{self._remote_home}/fog_ws/log "
            f"{self._remote_home}/fogros2_src.tar && "
            f"mkdir -p {self._remote_home}/fog_ws"
        )
        self.scp.send_file(tar_path, f"{self._remote_home}/fogros2_src.tar")
        self.scp.execute_cmd(
            f"cd {self._remote_home}/fog_ws && "
            f"tar -xf {self._remote_home}/fogros2_src.tar"
        )
        self.scp.execute_cmd("echo workspace src extracted on cloud target")

    def push_and_setup_vpn(self):
        # No VPN — the two ends already reach each other directly.
        pass

    def configure_DDS(self):
        peers = []
        if self._local_ip:
            peers.append(self._local_ip)
        peers.append(self._ip)
        peers.extend(self._extra_dds_peers)
        self.cyclone_builder = CycloneConfigBuilder(
            peers,
            username=self._username,
            interface_name=self._dds_interface,
        )
        self.cyclone_builder.generate_config_file()
        self.scp.send_file(
            "/tmp/cyclonedds.xml",
            f"{self._remote_home}/cyclonedds.xml",
        )

    def launch_cloud_node(self):
        cmd_builder = BashBuilder()
        cmd_builder.append(f"source /opt/ros/{self.ros_distro}/setup.bash")
        cmd_builder.append(
            f"cd {self._remote_home}/fog_ws && "
            f"{self._remote_colcon} build --cmake-clean-cache"
        )
        cmd_builder.append(f". {self._remote_home}/fog_ws/install/setup.bash")
        cmd_builder.append(self.cyclone_builder.env_cmd)
        ros_domain_id = os.environ.get("ROS_DOMAIN_ID", "0")
        cmd_builder.append(
            f"ROS_DOMAIN_ID={ros_domain_id} "
            "ros2 launch fogros2 cloud.launch.py"
        )
        self.logger.info(cmd_builder.get())
        self.scp.execute_cmd(cmd_builder.get())
