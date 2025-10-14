#!/bin/bash
# Build script for RHDH bootc image with Podman Quadlet and Logically Bound Images

set -e

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_MODE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Default values
IMAGE_NAME="rhdh-bootc-quadlet"
IMAGE_TAG="latest"
REGISTRY=""
CONTAINERFILE="${SCRIPT_DIR}/Containerfile.rhdh-bootc-quadlet"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

usage() {
    echo "Usage: $0 [-n IMAGE_NAME] [-t TAG] [-r REGISTRY] [-f CONTAINERFILE] [-h]"
    echo ""
    echo "Options:"
    echo "  -n, --name       Image name (default: rhdh-bootc-quadlet)"
    echo "  -t, --tag        Image tag (default: latest)"
    echo "  -r, --registry   Registry to push to (optional)"
    echo "  -f, --file       Containerfile path (default: Containerfile.rhdh-bootc-quadlet)"
    echo "  -h, --help       Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Build with defaults"
    echo "  $0 -n my-rhdh -t v1.0               # Custom name and tag"
    echo "  $0 -r registry.redhat.io/myorg -t v1.0  # Build and push to registry"
}

log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1" >&2
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--name)
            IMAGE_NAME="$2"
            shift 2
            ;;
        -t|--tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        -r|--registry)
            REGISTRY="$2"
            shift 2
            ;;
        -f|--file)
            CONTAINERFILE="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Construct full image name
if [[ -n "$REGISTRY" ]]; then
    FULL_IMAGE_NAME="${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"
else
    FULL_IMAGE_NAME="${IMAGE_NAME}:${IMAGE_TAG}"
fi

echo "=================================="
echo "RHDH Bootc Quadlet Image Builder"
echo "=================================="
echo ""
log "Build Configuration:"
echo "  • Image Name: ${FULL_IMAGE_NAME}"
echo "  • Containerfile: ${CONTAINERFILE}"
echo "  • Build Context: ${IMAGE_MODE_DIR}"
echo ""

# Validate prerequisites
log "Validating prerequisites..."

if ! command -v podman &> /dev/null; then
    error "Podman is not installed or not in PATH"
    exit 1
fi

# Check if Containerfile exists (relative to current dir or IMAGE_MODE_DIR)
if [[ -f "$CONTAINERFILE" ]]; then
    # File exists relative to current directory
    true
elif [[ -f "${IMAGE_MODE_DIR}/$CONTAINERFILE" ]]; then
    # File exists relative to IMAGE_MODE_DIR
    true
else
    error "Containerfile not found: $CONTAINERFILE (checked in current dir and ${IMAGE_MODE_DIR})"
    exit 1
fi

if [[ ! -d "${IMAGE_MODE_DIR}/configs" ]]; then
    error "configs directory not found in: ${IMAGE_MODE_DIR}"
    exit 1
fi

if [[ ! -d "${IMAGE_MODE_DIR}/scripts" ]]; then
    error "scripts directory not found in: ${IMAGE_MODE_DIR}"
    exit 1
fi

if [[ ! -d "${IMAGE_MODE_DIR}/local-plugins" ]]; then
    warning "local-plugins directory not found, creating empty directory"
    mkdir -p "${IMAGE_MODE_DIR}/local-plugins"
fi

success "Prerequisites validated"

# Build the image
log "Building bootc image with logically bound RHDH..."
echo ""

cd "${IMAGE_MODE_DIR}"

podman build \
    --file "${CONTAINERFILE}" \
    --tag "${FULL_IMAGE_NAME}" \
    --progress=plain \
    .

if [[ $? -eq 0 ]]; then
    success "Image built successfully: ${FULL_IMAGE_NAME}"
else
    error "Image build failed"
    exit 1
fi

# Display build information
echo ""
log "Build completed successfully!"
echo ""
echo "Image Details:"
podman inspect "${FULL_IMAGE_NAME}" --format "  • Size: {{.Size}} bytes"
podman inspect "${FULL_IMAGE_NAME}" --format "  • Created: {{.Created}}"
podman inspect "${FULL_IMAGE_NAME}" --format "  • Architecture: {{.Architecture}}"

echo ""
log "Logically Bound Images Configuration:"
echo "  • RHDH Image: registry.redhat.io/rhdh/rhdh-hub-rhel9:1.6"
echo "  • Quadlet Files: /usr/share/containers/systemd/"
echo "  • Bound Images: /usr/lib/bootc/bound-images.d/"

# Push to registry if specified
if [[ -n "$REGISTRY" ]]; then
    echo ""
    log "Pushing image to registry: ${REGISTRY}..."
    
    podman push "${FULL_IMAGE_NAME}"
    
    if [[ $? -eq 0 ]]; then
        success "Image pushed successfully to: ${FULL_IMAGE_NAME}"
    else
        error "Failed to push image to registry"
        exit 1
    fi
fi

echo ""
success "Build completed successfully!"
echo ""
echo "Next Steps:"
echo "  1. Deploy the bootc image to your target system"
echo "  2. Run 'bootc upgrade' to pull logically bound images"
echo "  3. Access RHDH at http://localhost:7007"
echo "  4. Check service status: systemctl status rhdh.service"
echo ""
echo "For more information, see: ${SCRIPT_DIR}/README.md"

