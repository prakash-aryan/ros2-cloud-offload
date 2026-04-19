# Copyright 2026 The Regents of the University of California (Regents)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Talker example using a self-hosted SSH-reachable machine as the cloud.

Connection details come from env vars — set them in `.env` and start via
`./run_local.sh`. Required:
    CLOUD_IP        cloud machine IP
    CLOUD_USER      cloud SSH username
    CLOUD_SSH_KEY   path to SSH private key (inside the container)
    LOCAL_IP        local-side IP for DDS
    DDS_INTERFACE   interface to bind DDS to on both ends
"""

import os

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

    ld = fogros2.FogROSLaunchDescription()
    machine1 = fogros2.LocalMachine(
        ip=cloud_ip,
        ssh_username=cloud_user,
        ssh_key_path=ssh_key,
        local_ip=local_ip,
        dds_interface=dds_iface,
    )

    listener_node = Node(
        package="fogros2_examples", executable="listener", output="screen"
    )
    talker_node = fogros2.CloudNode(
        package="fogros2_examples",
        executable="talker",
        output="screen",
        machine=machine1,
    )
    ld.add_action(talker_node)
    ld.add_action(listener_node)
    return ld
