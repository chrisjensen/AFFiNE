#!/bin/bash
set -euo pipefail

#############################################
# AFFiNE Custom Build
# Builds Docker image for deployment
#
# This script replicates the official CI build process from:
#   .github/workflows/build-images.yml
#############################################

# Script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load .env file if present
if [[ -f "$SCRIPT_DIR/.env" ]]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
    echo "[BUILD] Loaded environment from .env file"
fi

# Configuration
LOCAL_REGISTRY_PORT="${LOCAL_REGISTRY_PORT:-5000}"
IMAGE_NAME="${IMAGE_NAME:-affine}"
BUILD_TAG="${BUILD_TAG:-$(git rev-parse --short HEAD)}"
SKIP_NATIVE_BUILD="${SKIP_NATIVE_BUILD:-false}"

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

# Registry URL for tagging
REGISTRY_URL="localhost:${LOCAL_REGISTRY_PORT}"

log "============================================"
log "AFFiNE Build"
log "  Image:     $IMAGE_NAME"
log "  Tag:       $BUILD_TAG"
log "============================================"

# Step 1: Install dependencies for building
log "Step 1/8: Installing build dependencies..."
yarn install

# Step 2: Build native module (Rust)
if [[ "$SKIP_NATIVE_BUILD" == "true" ]]; then
    log "Step 2/8: Skipping native build (SKIP_NATIVE_BUILD=true)"
    # Verify native binary exists
    if [[ ! -f "packages/backend/native/server-native.node" ]]; then
        error "Native binary not found at packages/backend/native/server-native.node. Run 'yarn affine @affine/server-native build' first or set SKIP_NATIVE_BUILD=false"
    fi
else
    log "Step 2/8: Building native module (Rust)..."
    yarn affine @affine/server-native build
fi

# Step 3: Build frontend packages
# Increase Node.js heap size for webpack builds
export NODE_OPTIONS="--max-old-space-size=8192"

log "Step 3/8: Building web frontend..."
yarn affine @affine/web build

log "Step 4/8: Building admin frontend..."
yarn affine @affine/admin build

log "Step 5/8: Building mobile frontend..."
yarn affine @affine/mobile build

# Step 6: Build server (this bundles native module and copies .node files to dist)
log "Step 6/8: Building server..."
yarn workspace @affine/server build

# Verify native binaries were copied to dist
if [[ ! -f "packages/backend/server/dist/server-native.node" ]] && \
   [[ ! -f "packages/backend/server/dist/server-native.x64.node" ]]; then
    warn "Native binary not found in server dist. Copying manually..."
    cp packages/backend/native/server-native.node packages/backend/server/dist/ 2>/dev/null || \
    cp packages/backend/native/server-native.x64.node packages/backend/server/dist/ 2>/dev/null || \
    error "Failed to copy native binary to dist"
fi

# Step 7: Prepare production dependencies (matches CI build-images job)
log "Step 7/8: Installing production dependencies..."

# Remove existing node_modules from server (if any from dev)
rm -rf packages/backend/server/node_modules

# Install production-only dependencies for the server
# This matches the CI: yarn workspaces focus @affine/server --production
yarn workspaces focus @affine/server --production

# Generate Prisma client
log "Generating Prisma client..."
yarn workspace @affine/server prisma generate

# Move node_modules into server directory (matches CI: mv ./node_modules ./packages/backend/server)
log "Moving node_modules to server directory..."
mv node_modules packages/backend/server/

# Replace workspace symlink with actual content (symlink target not in Docker context)
log "Copying native package to node_modules..."
rm -rf packages/backend/server/node_modules/@affine/server-native
cp -r packages/backend/native packages/backend/server/node_modules/@affine/server-native

# Step 8: Build Docker image
log "Step 8/8: Building Docker image..."

# Temporarily move local development files that would not exist in a clean CI checkout
# These are gitignored files that could override runtime environment variables
BACKUP_DIR=$(mktemp -d)
mv packages/backend/server/.env "$BACKUP_DIR/.env" 2>/dev/null || true
mv packages/backend/server/config.json "$BACKUP_DIR/config.json" 2>/dev/null || true
mv packages/backend/server/static "$BACKUP_DIR/static" 2>/dev/null || true

# Ensure we restore files on exit
restore_dev_files() {
    mv "$BACKUP_DIR/.env" packages/backend/server/.env 2>/dev/null || true
    mv "$BACKUP_DIR/config.json" packages/backend/server/config.json 2>/dev/null || true
    mv "$BACKUP_DIR/static" packages/backend/server/static 2>/dev/null || true
    rm -rf "$BACKUP_DIR"
}
trap restore_dev_files EXIT

# Build using the project root as context (matches CI: context: .)
docker build \
    --platform linux/amd64 \
    --tag "$REGISTRY_URL/$IMAGE_NAME:$BUILD_TAG" \
    --tag "$REGISTRY_URL/$IMAGE_NAME:latest" \
    --file .github/deployment/node/Dockerfile \
    .

# Restore node_modules to root for future development
log "Restoring node_modules to project root..."
mv packages/backend/server/node_modules .

log "============================================"
log "Build complete!"
log "============================================"
echo ""
echo "Images built:"
echo "  - $REGISTRY_URL/$IMAGE_NAME:$BUILD_TAG"
echo "  - $REGISTRY_URL/$IMAGE_NAME:latest"
echo ""
echo "To deploy, run:"
echo "  ./deploy.sh"
echo ""
