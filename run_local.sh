#!/usr/bin/env bash
# Launch the local-side dev container with the workspace mounted, env vars
# loaded from .env, and the CycloneDDS config rendered from a template.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---- load env ------------------------------------------------------------
ENV_FILE="$REPO_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
    ENV_FILE="$REPO_DIR/.env.example"
    echo "warning: no .env found, falling back to .env.example" >&2
fi
set -o allexport
# shellcheck disable=SC1090
source "$ENV_FILE"
set +o allexport

required=(LOCAL_IP CLOUD_IP CLOUD_USER CLOUD_SSH_HOST SSH_KEY_PATH DDS_INTERFACE)
for v in "${required[@]}"; do
    if [[ -z "${!v:-}" ]]; then
        echo "error: $v is not set in $ENV_FILE" >&2
        exit 1
    fi
done

# ---- render cyclonedds config -------------------------------------------
CDDS_OUT="$REPO_DIR/cyclonedds_local.xml"
LOCAL_IP="$LOCAL_IP" CLOUD_IP="$CLOUD_IP" DDS_INTERFACE="$DDS_INTERFACE" \
    envsubst < "$REPO_DIR/cyclonedds_local.xml.template" > "$CDDS_OUT"

# ---- resolve SSH key path on host ---------------------------------------
SSH_KEY_HOST="${SSH_KEY_PATH/#\~/$HOME}"
if [[ ! -f "$SSH_KEY_HOST" ]]; then
    echo "error: SSH key $SSH_KEY_HOST does not exist" >&2
    exit 1
fi
SSH_KEY_BASENAME="$(basename "$SSH_KEY_HOST")"

# ---- nvidia GPU, if available -------------------------------------------
GPU_FLAGS=()
if docker info 2>/dev/null | grep -q '^ Runtimes:.*nvidia'; then
    GPU_FLAGS+=(--gpus all)
fi

# ---- allow X server access for Gazebo GUI -------------------------------
xhost +local:root >/dev/null 2>&1 || true

exec docker run -it --rm \
    --net=host \
    --name fogros2-local \
    "${GPU_FLAGS[@]}" \
    -v "$REPO_DIR":/root/fog_ws/src/FogROS2 \
    -v "$HOME/.ssh":/root/.ssh:ro \
    -v "$CDDS_OUT":/etc/cyclonedds_local.xml:ro \
    -v /tmp/.X11-unix:/tmp/.X11-unix \
    -e DISPLAY="${DISPLAY:-:0}" \
    -e XAUTHORITY="${XAUTHORITY:-}" \
    -e ROS_DOMAIN_ID="${ROS_DOMAIN_ID:-0}" \
    -e CLOUD_IP="$CLOUD_IP" \
    -e LOCAL_IP="$LOCAL_IP" \
    -e CLOUD_USER="$CLOUD_USER" \
    -e CLOUD_SSH_KEY="/root/.ssh/$SSH_KEY_BASENAME" \
    -e LOCAL_HOSTNAME="${LOCAL_HOSTNAME:-local}" \
    -e CLOUD_HOSTNAME="${CLOUD_HOSTNAME:-cloud}" \
    -e DDS_INTERFACE="$DDS_INTERFACE" \
    fogros2-local \
    bash
