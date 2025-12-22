#!/bin/bash
set -euo pipefail

#############################################
# AFFiNE Deploy to Coolify
# Pushes Docker image via SSH tunnel to internal registry
#############################################

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load .env file if present
if [[ -f "$SCRIPT_DIR/.env" ]]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
    echo "[DEPLOY] Loaded environment from .env file"
fi

# Configuration
SSH_HOST="${SSH_HOST:?Set SSH_HOST (e.g., user@coolify.example.com)}"
SSH_PORT="${SSH_PORT:-22}"
LOCAL_REGISTRY_PORT="${LOCAL_REGISTRY_PORT:-5000}"
IMAGE_NAME="${IMAGE_NAME:-affine}"
BUILD_TAG="${BUILD_TAG:-$(git rev-parse --short HEAD)}"
REGISTRY_USER="${REGISTRY_USER:?Set REGISTRY_USER for registry authentication}"
REGISTRY_PASSWORD="${REGISTRY_PASSWORD:?Set REGISTRY_PASSWORD for registry authentication}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Registry URL for pushing (via SSH tunnel)
REGISTRY_URL="localhost:${LOCAL_REGISTRY_PORT}"

log "============================================"
log "AFFiNE Deploy"
log "  SSH Host:  $SSH_HOST"
log "  Image:     $IMAGE_NAME"
log "  Tag:       $BUILD_TAG"
log "============================================"

# Verify image exists
if ! docker image inspect "$REGISTRY_URL/$IMAGE_NAME:$BUILD_TAG" >/dev/null 2>&1; then
    error "Image $REGISTRY_URL/$IMAGE_NAME:$BUILD_TAG not found. Run ./build.sh first."
fi

# Check if tunnel port is already in use
if lsof -i ":${LOCAL_REGISTRY_PORT}" >/dev/null 2>&1; then
    warn "Port ${LOCAL_REGISTRY_PORT} already in use - assuming SSH tunnel is active"
else
    log "Opening SSH tunnel to registry..."
    ssh -f -N -L "${LOCAL_REGISTRY_PORT}:docker-registry:5000" -p "${SSH_PORT}" "${SSH_HOST}"
    sleep 2
fi

# Authenticate with registry
log "Authenticating with registry..."
echo "${REGISTRY_PASSWORD}" | docker login "${REGISTRY_URL}" --username "${REGISTRY_USER}" --password-stdin

# Push images
log "Pushing $REGISTRY_URL/$IMAGE_NAME:$BUILD_TAG..."
docker push "$REGISTRY_URL/$IMAGE_NAME:$BUILD_TAG"

log "Pushing $REGISTRY_URL/$IMAGE_NAME:latest..."
docker push "$REGISTRY_URL/$IMAGE_NAME:latest"

# Get image digest for pinning
DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' "$REGISTRY_URL/$IMAGE_NAME:$BUILD_TAG" 2>/dev/null || echo "")

log "============================================"
log "Deploy complete!"
log "============================================"
echo ""
echo "Images pushed to internal registry:"
echo "  - $IMAGE_NAME:$BUILD_TAG"
echo "  - $IMAGE_NAME:latest"
if [[ -n "$DIGEST" ]]; then
    echo ""
    echo "Image digest (for pinning):"
    echo "  $DIGEST"
fi
echo ""
echo "To deploy in Coolify:"
echo "  1. Set AFFINE_REVISION=$BUILD_TAG (or 'latest')"
echo "  2. Redeploy the service"
echo ""
echo "SSH tunnel may still be running. To close:"
echo "  pkill -f 'ssh.*${LOCAL_REGISTRY_PORT}:docker-registry'"
