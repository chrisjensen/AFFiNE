#!/bin/bash
set -euo pipefail

#############################################
# AFFiNE Custom Build & Deploy to Coolify
# Uses SSH tunnel to push to internal registry
#############################################

# Script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load .env file if present (before variable validation)
if [[ -f "$SCRIPT_DIR/.env" ]]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
    echo "[BUILD] Loaded environment from .env file"
fi

# Configuration - Set via environment or .env file
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

log() { echo -e "${GREEN}[BUILD]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Validate we're in the right directory
cd "$PROJECT_ROOT"
[[ -f "package.json" ]] || error "Cannot find package.json. Run from AFFiNE project or check script location."

# Registry URL for local pushing (via SSH tunnel)
REGISTRY_URL="localhost:${LOCAL_REGISTRY_PORT}"

log "============================================"
log "AFFiNE Build & Deploy"
log "  SSH Host:  $SSH_HOST"
log "  Image:     $IMAGE_NAME"
log "  Tag:       $BUILD_TAG"
log "============================================"

# Step 1: Install dependencies
log "Step 1/7: Installing dependencies..."
yarn install

# Step 2: Build frontend packages
log "Step 2/7: Building web frontend..."
yarn affine @affine/web build

log "Step 3/7: Building admin frontend..."
yarn affine @affine/admin build

log "Step 4/7: Building mobile frontend..."
yarn affine @affine/mobile build

# Step 3: Build server
log "Step 5/7: Building server..."
yarn workspace @affine/server build

log "Generating Prisma client..."
yarn workspace @affine/server prisma:generate

# Step 4: Prepare build context
log "Step 6/7: Building Docker image..."
BUILD_DIR=$(mktemp -d)
trap "rm -rf $BUILD_DIR" EXIT

log "Preparing build context in $BUILD_DIR..."

# Copy server directory (includes node_modules with prisma client)
mkdir -p "$BUILD_DIR/packages/backend"
cp -r packages/backend/server "$BUILD_DIR/packages/backend/"

# Copy frontend distributions
mkdir -p "$BUILD_DIR/packages/frontend/apps/web"
mkdir -p "$BUILD_DIR/packages/frontend/admin"
mkdir -p "$BUILD_DIR/packages/frontend/apps/mobile"
cp -r packages/frontend/apps/web/dist "$BUILD_DIR/packages/frontend/apps/web/"
cp -r packages/frontend/admin/dist "$BUILD_DIR/packages/frontend/admin/"
cp -r packages/frontend/apps/mobile/dist "$BUILD_DIR/packages/frontend/apps/mobile/"

# Copy Dockerfile
cp .github/deployment/node/Dockerfile "$BUILD_DIR/"

# Build Docker image
cd "$BUILD_DIR"

docker build \
    --platform linux/amd64 \
    --tag "$REGISTRY_URL/$IMAGE_NAME:$BUILD_TAG" \
    --tag "$REGISTRY_URL/$IMAGE_NAME:latest" \
    .

# Step 5: Push via SSH tunnel
log "Step 7/7: Pushing to registry via SSH tunnel..."

# Check if tunnel port is already in use
if lsof -i ":${LOCAL_REGISTRY_PORT}" >/dev/null 2>&1; then
    warn "Port ${LOCAL_REGISTRY_PORT} already in use - assuming SSH tunnel is active"
else
    log "Opening SSH tunnel to registry..."
    ssh -f -N -L "${LOCAL_REGISTRY_PORT}:docker-registry:5000" -p "${SSH_PORT}" "${SSH_HOST}"
    # Give tunnel a moment to establish
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
log "Build complete!"
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
