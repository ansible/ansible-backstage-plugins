#!/bin/bash
# Validation script for Podman Quadlet files

set -e

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

validate_image_file() {
    local file="$1"
    local errors=0
    
    log "Validating Quadlet .image file: $(basename "$file")"
    
    if [[ ! -f "$file" ]]; then
        error "File not found: $file"
        return 1
    fi
    
    # Check for required sections
    if ! grep -q "^\[Image\]" "$file"; then
        error "Missing [Image] section"
        ((errors++))
    fi
    
    if ! grep -q "^\[Install\]" "$file"; then
        error "Missing [Install] section"
        ((errors++))
    fi
    
    # Check for required fields
    if ! grep -q "^Image=" "$file"; then
        error "Missing Image= field in [Image] section"
        ((errors++))
    fi
    
    if ! grep -q "^WantedBy=" "$file"; then
        error "Missing WantedBy= field in [Install] section"
        ((errors++))
    fi
    
    # Validate image reference
    local image_ref=$(grep "^Image=" "$file" | cut -d'=' -f2- | tr -d ' ')
    if [[ -z "$image_ref" ]]; then
        error "Empty Image= value"
        ((errors++))
    elif [[ ! "$image_ref" =~ ^[a-zA-Z0-9._/-]+:[a-zA-Z0-9._-]+$ ]]; then
        warning "Image reference format may be invalid: $image_ref"
    fi
    
    if [[ $errors -eq 0 ]]; then
        success "Quadlet .image file validation passed"
    else
        error "Quadlet .image file validation failed with $errors errors"
    fi
    
    return $errors
}

validate_container_file() {
    local file="$1"
    local errors=0
    
    log "Validating Quadlet .container file: $(basename "$file")"
    
    if [[ ! -f "$file" ]]; then
        error "File not found: $file"
        return 1
    fi
    
    # Check for required sections
    local required_sections=("[Unit]" "[Container]" "[Service]" "[Install]")
    for section in "${required_sections[@]}"; do
        if ! grep -q "^\\$section" "$file"; then
            error "Missing $section section"
            ((errors++))
        fi
    done
    
    # Check for required Container fields
    local required_container_fields=("Image=" "ContainerName=")
    for field in "${required_container_fields[@]}"; do
        if ! grep -q "^$field" "$file"; then
            error "Missing $field field in [Container] section"
            ((errors++))
        fi
    done
    
    # Check for bootc storage configuration (only for RHDH container)
    if [[ "$(basename "$file")" == "rhdh.container" ]] && ! grep -q "GlobalArgs=.*additionalimagestore=/usr/lib/bootc/storage" "$file"; then
        error "Missing bootc storage configuration (GlobalArgs with additionalimagestore)"
        ((errors++))
    fi
    
    # Validate image reference
    local image_ref=$(grep "^Image=" "$file" | cut -d'=' -f2- | tr -d ' ')
    if [[ -z "$image_ref" ]]; then
        error "Empty Image= value"
        ((errors++))
    elif [[ ! "$image_ref" =~ ^[a-zA-Z0-9._/-]+:[a-zA-Z0-9._-]+$ ]]; then
        warning "Image reference format may be invalid: $image_ref"
    fi
    
    # Check for proper service dependencies (only for RHDH container)
    if [[ "$(basename "$file")" == "rhdh.container" ]] && ! grep -q "Requires=.*-image\.service" "$file"; then
        warning "Missing dependency on corresponding .image service"
    fi
    
    if [[ $errors -eq 0 ]]; then
        success "Quadlet .container file validation passed"
    else
        error "Quadlet .container file validation failed with $errors errors"
    fi
    
    return $errors
}

validate_containerfile() {
    local file="$1"
    local errors=0
    
    log "Validating Containerfile: $(basename "$file")"
    
    if [[ ! -f "$file" ]]; then
        error "File not found: $file"
        return 1
    fi
    
    # Check for bootc base image
    if ! grep -q "FROM.*rhel-bootc" "$file"; then
        error "Missing RHEL bootc base image"
        ((errors++))
    fi
    
    # Check for quadlet file copying
    if ! grep -q "COPY.*quadlet.*systemd" "$file"; then
        error "Missing quadlet files copying to systemd directory"
        ((errors++))
    fi
    
    # Check for logically bound images setup
    if ! grep -q "/usr/lib/bootc/bound-images.d" "$file"; then
        error "Missing logically bound images directory setup"
        ((errors++))
    fi
    
    # Check for symlink creation
    if ! grep -q "ln -s.*bound-images.d" "$file"; then
        error "Missing symlink creation for bound images"
        ((errors++))
    fi
    
    # Check for podman installation
    if ! grep -q "dnf install.*podman" "$file"; then
        error "Missing Podman installation"
        ((errors++))
    fi
    
    if [[ $errors -eq 0 ]]; then
        success "Containerfile validation passed"
    else
        error "Containerfile validation failed with $errors errors"
    fi
    
    return $errors
}

main() {
    echo "========================================"
    echo "Podman Quadlet Configuration Validator"
    echo "========================================"
    echo ""
    
    local total_errors=0
    
    # Validate .image file (if it exists)
    if [[ -f "${SCRIPT_DIR}/rhdh.image" ]]; then
        if validate_image_file "${SCRIPT_DIR}/rhdh.image"; then
            success ".image file is valid"
        else
            ((total_errors++))
        fi
    else
        log "Skipping .image file validation (using simplified container-only approach)"
    fi
    
    echo ""
    
    # Validate RHDH .container file
    if validate_container_file "${SCRIPT_DIR}/rhdh.container"; then
        success "RHDH .container file is valid"
    else
        ((total_errors++))
    fi
    
    echo ""
    
    # Validate PostgreSQL .container file
    if [[ -f "${SCRIPT_DIR}/postgres.container" ]]; then
        if validate_container_file "${SCRIPT_DIR}/postgres.container"; then
            success "PostgreSQL .container file is valid"
        else
            ((total_errors++))
        fi
    else
        warning "PostgreSQL .container file not found - PostgreSQL will not be available"
    fi
    
    echo ""
    
    # Validate Containerfile
    if validate_containerfile "${SCRIPT_DIR}/Containerfile.rhdh-bootc-quadlet"; then
        success "Containerfile is valid"
    else
        ((total_errors++))
    fi
    
    echo ""
    echo "========================================"
    if [[ $total_errors -eq 0 ]]; then
        success "All validations passed! ✨"
        echo ""
        echo "Your RHDH + PostgreSQL Quadlet configuration is ready for deployment."
        echo "Next steps:"
        echo "  1. Build the image: ./build-quadlet.sh"
        echo "  2. Deploy to target system"
        echo "  3. Run: bootc upgrade"
        echo ""
        echo "Services that will be available:"
        echo "  - PostgreSQL database (postgres.service)"
        echo "  - RHDH application (rhdh.service)"
    else
        error "Validation failed with $total_errors errors"
        echo ""
        echo "Please fix the errors above before proceeding."
        exit 1
    fi
    echo "========================================"
}

main "$@"

