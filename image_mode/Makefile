# RHDH Ansible Bootc Container Management
# Red Hat Developer Hub with Ansible Self-Service Portal on RHEL 10 Image Mode

# Configuration
IMAGE_NAME := rhdh-ansible-bootc
IMAGE_TAG := final
CONTAINER_NAME := rhdh-ansible-portal
PORT := 7007
CONTAINERFILE := Containerfile.rhdh-ansible-bootc

# Registry Configuration
REGISTRY := quay.io
NAMESPACE := your-namespace
REGISTRY_IMAGE := $(REGISTRY)/$(NAMESPACE)/$(IMAGE_NAME)

# Colors for output
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m # No Color

.PHONY: help build start stop restart status clean remove-images health login tag push qcow2 qcow2-macos ami iso vmdk gce vhd raw anaconda-iso publish list-image-types deploy-container deploy-vm test-container test-vm shell service-logs service-status service-logs-live

# Default target
help: ## Show this help message
	@echo "$(GREEN)RHDH Ansible Bootc Container Management$(NC)"
	@echo "========================================="
	@echo ""
	@echo "Available targets:"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(YELLOW)%-15s$(NC) %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build the RHDH Ansible bootc container image
	@echo "$(GREEN)Building RHDH Ansible bootc image...$(NC)"
	podman build -f $(CONTAINERFILE) -t $(IMAGE_NAME):$(IMAGE_TAG) .
	@echo "$(GREEN)✅ Image built successfully: $(IMAGE_NAME):$(IMAGE_TAG)$(NC)"

start: ## Start the RHDH container
	@echo "$(GREEN)Starting RHDH Ansible Portal container...$(NC)"
	@if podman ps -a --format "{{.Names}}" | grep -q "^$(CONTAINER_NAME)$$"; then \
		echo "$(YELLOW)Container $(CONTAINER_NAME) already exists. Removing it first...$(NC)"; \
		podman stop $(CONTAINER_NAME) 2>/dev/null || true; \
		podman rm $(CONTAINER_NAME) 2>/dev/null || true; \
	fi
	podman run -d --name $(CONTAINER_NAME) -p $(PORT):$(PORT) $(IMAGE_NAME):$(IMAGE_TAG)
	@echo "$(GREEN)✅ Container started: $(CONTAINER_NAME)$(NC)"
	@echo "$(GREEN)🌐 Access RHDH at: http://localhost:$(PORT)$(NC)"

stop: ## Stop the RHDH container
	@echo "$(GREEN)Stopping RHDH container...$(NC)"
	@if podman ps --format "{{.Names}}" | grep -q "^$(CONTAINER_NAME)$$"; then \
		podman stop $(CONTAINER_NAME); \
		echo "$(GREEN)✅ Container stopped: $(CONTAINER_NAME)$(NC)"; \
	else \
		echo "$(YELLOW)Container $(CONTAINER_NAME) is not running$(NC)"; \
	fi

status: ## Show container and service status
	@echo "$(GREEN)Container Status:$(NC)"
	@if podman ps -a --format "{{.Names}}" | grep -q "^$(CONTAINER_NAME)$$"; then \
		podman ps -a --filter name=$(CONTAINER_NAME) --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"; \
	else \
		echo "$(YELLOW)Container $(CONTAINER_NAME) does not exist$(NC)"; \
	fi

shell: ## Open a shell inside the running container
	@echo "$(GREEN)Opening shell in container $(CONTAINER_NAME)...$(NC)"
	@if podman ps --format "{{.Names}}" | grep -q "^$(CONTAINER_NAME)$$"; then \
		podman exec -it $(CONTAINER_NAME) bash || podman exec -it $(CONTAINER_NAME) sh; \
	else \
		echo "$(YELLOW)Container $(CONTAINER_NAME) is not running$(NC)"; \
		echo "$(YELLOW)Start it with: make start$(NC)"; \
	fi

service-logs: ## Show RHDH systemd service logs inside the container
	@echo "$(GREEN)Showing RHDH service logs (last 200 lines)...$(NC)"
	@if podman ps --format "{{.Names}}" | grep -q "^$(CONTAINER_NAME)$$"; then \
		podman exec -it $(CONTAINER_NAME) journalctl -u rhdh -n 200 --no-pager | cat; \
	else \
		echo "$(YELLOW)Container $(CONTAINER_NAME) is not running$(NC)"; \
		echo "$(YELLOW)Start it with: make start$(NC)"; \
	fi

service-status: ## Show RHDH systemd service status inside the container
	@echo "$(GREEN)RHDH service status:$(NC)"
	@if podman ps --format "{{.Names}}" | grep -q "^$(CONTAINER_NAME)$$"; then \
		podman exec -it $(CONTAINER_NAME) systemctl status rhdh --no-pager | cat; \
	else \
		echo "$(YELLOW)Container $(CONTAINER_NAME) is not running$(NC)"; \
		echo "$(YELLOW)Start it with: make start$(NC)"; \
	fi

service-logs-live: ## Follow RHDH service logs in real time (Ctrl+C to stop)
	@echo "$(GREEN)Following RHDH service logs (Ctrl+C to stop)...$(NC)"
	@if podman ps --format "{{.Names}}" | grep -q "^$(CONTAINER_NAME)$$"; then \
		podman exec -it $(CONTAINER_NAME) journalctl -u rhdh -f --no-pager; \
	else \
		echo "$(YELLOW)Container $(CONTAINER_NAME) is not running$(NC)"; \
		echo "$(YELLOW)Start it with: make start$(NC)"; \
	fi

health: ## Run health check
	@echo "$(GREEN)Running health check...$(NC)"
	@if curl -f http://localhost:$(PORT) >/dev/null 2>&1; then \
		echo "$(GREEN)✅ RHDH is responding on http://localhost:$(PORT)$(NC)"; \
	else \
		echo "$(RED)❌ RHDH is not responding$(NC)"; \
	fi

clean: ## Stop and remove the container
	@echo "$(GREEN)Cleaning up container...$(NC)"
	@podman stop $(CONTAINER_NAME) 2>/dev/null || true
	@podman rm $(CONTAINER_NAME) 2>/dev/null || true
	@echo "$(GREEN)✅ Cleanup completed$(NC)"

# Registry Operations
login: ## Login to Quay.io registry
	@echo "$(GREEN)Logging into $(REGISTRY)...$(NC)"
	podman login $(REGISTRY)
	@echo "$(GREEN)✅ Logged in successfully$(NC)"

tag: ## Tag image for registry
	@echo "$(GREEN)Tagging image for registry...$(NC)"
	podman tag $(IMAGE_NAME):$(IMAGE_TAG) $(REGISTRY_IMAGE):$(IMAGE_TAG)
	@echo "$(GREEN)✅ Tagged: $(REGISTRY_IMAGE):$(IMAGE_TAG)$(NC)"

push: tag ## Push image to Quay.io registry
	@echo "$(GREEN)Pushing image to $(REGISTRY)...$(NC)"
	podman push $(REGISTRY_IMAGE):$(IMAGE_TAG)
	@echo "$(GREEN)✅ Image pushed successfully!$(NC)"
	@echo "$(GREEN)🌐 Image available at: $(REGISTRY_IMAGE):$(IMAGE_TAG)$(NC)"

# Bootc Image Builder Operations
list-image-types: ## List all available image types that bootc-image-builder can create
	@echo "$(GREEN)Supported bootc-image-builder image types:$(NC)"
	@echo ""
	@podman run --rm quay.io/centos-bootc/bootc-image-builder build --help | grep -A 1 "image types to build"
	@echo ""
	@echo "$(YELLOW)Image Type Descriptions:$(NC)"
	@echo "  $(GREEN)qcow2$(NC)        - QEMU/KVM disk image (for libvirt, OpenStack)"
	@echo "  $(GREEN)vmdk$(NC)         - VMware disk image (for vSphere, Workstation)"
	@echo "  $(GREEN)vhd$(NC)          - Hyper-V disk image (for Microsoft Azure)"
	@echo "  $(GREEN)ami$(NC)          - Amazon Machine Image (for AWS EC2)"
	@echo "  $(GREEN)gce$(NC)          - Google Compute Engine image"
	@echo "  $(GREEN)iso$(NC)          - ISO installer image (for bare metal, PXE boot)"
	@echo "  $(GREEN)anaconda-iso$(NC) - Anaconda-based ISO installer"
	@echo "  $(GREEN)raw$(NC)          - Raw disk image (for dd, bare metal)"
	@echo ""
	@echo "$(YELLOW)Usage examples:$(NC)"
	@echo "  make qcow2           # Create QCOW2 for KVM/libvirt"
	@echo "  make ami             # Create AMI for AWS"
	@echo "  make iso             # Create ISO installer"
	@echo "  make vmdk            # Create VMDK for VMware"

qcow2: ## Create QCOW2 disk image from registry image
	@echo "$(GREEN)Creating QCOW2 image from $(REGISTRY_IMAGE):$(IMAGE_TAG)...$(NC)"
	@mkdir -p output
	podman run --rm -it \
		--privileged \
		--pull=newer \
		--security-opt label=type:unconfined_t \
		-v $(PWD)/output:/output \
		-v /var/lib/containers/storage:/var/lib/containers/storage \
		quay.io/centos-bootc/bootc-image-builder \
		--type qcow2 \
		--output /output \
		$(REGISTRY_IMAGE):$(IMAGE_TAG)
	@echo "$(GREEN)✅ QCOW2 image created in output/ directory$(NC)"
	@echo "$(GREEN)📁 Files created:$(NC)"
	@ls -lh output/

qcow2-macos: ## Create QCOW2 disk image optimized for macOS M4 (ARM64)
	@echo "$(GREEN)Creating ARM64 QCOW2 image from $(REGISTRY_IMAGE):$(IMAGE_TAG)...$(NC)"
	@mkdir -p output-macos
	podman run --rm -it \
		--privileged \
		--pull=newer \
		--security-opt label=type:unconfined_t \
		-v $(PWD)/output-macos:/output \
		-v /var/lib/containers/storage:/var/lib/containers/storage \
		quay.io/centos-bootc/bootc-image-builder \
		--type qcow2 \
		--target-arch aarch64 \
		--output /output \
		$(REGISTRY_IMAGE):$(IMAGE_TAG)
	@echo "$(GREEN)✅ ARM64 QCOW2 image created in output-macos/ directory$(NC)"
	@echo "$(GREEN)📁 Files created:$(NC)"
	@ls -lh output-macos/

ami: ## Create AMI disk image for AWS
	@echo "$(GREEN)Creating AMI image from $(REGISTRY_IMAGE):$(IMAGE_TAG)...$(NC)"
	@mkdir -p output
	podman run --rm -it \
		--privileged \
		--pull=newer \
		--security-opt label=type:unconfined_t \
		-v $(PWD)/output:/output \
		-v /var/lib/containers/storage:/var/lib/containers/storage \
		quay.io/centos-bootc/bootc-image-builder \
		--type ami \
		--output /output \
		$(REGISTRY_IMAGE):$(IMAGE_TAG)
	@echo "$(GREEN)✅ AMI image created in output/ directory$(NC)"
	@ls -lh output/

iso: ## Create ISO installer image
	@echo "$(GREEN)Creating ISO installer from $(REGISTRY_IMAGE):$(IMAGE_TAG)...$(NC)"
	@mkdir -p output
	podman run --rm -it \
		--privileged \
		--pull=newer \
		--security-opt label=type:unconfined_t \
		-v $(PWD)/output:/output \
		-v /var/lib/containers/storage:/var/lib/containers/storage \
		quay.io/centos-bootc/bootc-image-builder \
		--type iso \
		--output /output \
		$(REGISTRY_IMAGE):$(IMAGE_TAG)
	@echo "$(GREEN)✅ ISO image created in output/ directory$(NC)"
	@ls -lh output/

vmdk: ## Create VMDK image for VMware
	@echo "$(GREEN)Creating VMDK image from $(REGISTRY_IMAGE):$(IMAGE_TAG)...$(NC)"
	@mkdir -p output
	podman run --rm -it \
		--privileged \
		--pull=newer \
		--security-opt label=type:unconfined_t \
		-v $(PWD)/output:/output \
		-v /var/lib/containers/storage:/var/lib/containers/storage \
		quay.io/centos-bootc/bootc-image-builder \
		--type vmdk \
		--output /output \
		$(REGISTRY_IMAGE):$(IMAGE_TAG)
	@echo "$(GREEN)✅ VMDK image created in output/ directory$(NC)"
	@ls -lh output/

gce: ## Create Google Compute Engine image
	@echo "$(GREEN)Creating GCE image from $(REGISTRY_IMAGE):$(IMAGE_TAG)...$(NC)"
	@mkdir -p output
	podman run --rm -it \
		--privileged \
		--pull=newer \
		--security-opt label=type:unconfined_t \
		-v $(PWD)/output:/output \
		-v /var/lib/containers/storage:/var/lib/containers/storage \
		quay.io/centos-bootc/bootc-image-builder \
		--type gce \
		--output /output \
		$(REGISTRY_IMAGE):$(IMAGE_TAG)
	@echo "$(GREEN)✅ GCE image created in output/ directory$(NC)"
	@ls -lh output/

vhd: ## Create VHD image for Hyper-V/Azure
	@echo "$(GREEN)Creating VHD image from $(REGISTRY_IMAGE):$(IMAGE_TAG)...$(NC)"
	@mkdir -p output
	podman run --rm -it \
		--privileged \
		--pull=newer \
		--security-opt label=type:unconfined_t \
		-v $(PWD)/output:/output \
		-v /var/lib/containers/storage:/var/lib/containers/storage \
		quay.io/centos-bootc/bootc-image-builder \
		--type vhd \
		--output /output \
		$(REGISTRY_IMAGE):$(IMAGE_TAG)
	@echo "$(GREEN)✅ VHD image created in output/ directory$(NC)"
	@ls -lh output/

raw: ## Create raw disk image
	@echo "$(GREEN)Creating raw disk image from $(REGISTRY_IMAGE):$(IMAGE_TAG)...$(NC)"
	@mkdir -p output
	podman run --rm -it \
		--privileged \
		--pull=newer \
		--security-opt label=type:unconfined_t \
		-v $(PWD)/output:/output \
		-v /var/lib/containers/storage:/var/lib/containers/storage \
		quay.io/centos-bootc/bootc-image-builder \
		--type raw \
		--output /output \
		$(REGISTRY_IMAGE):$(IMAGE_TAG)
	@echo "$(GREEN)✅ Raw disk image created in output/ directory$(NC)"
	@ls -lh output/

anaconda-iso: ## Create Anaconda-based ISO installer
	@echo "$(GREEN)Creating Anaconda ISO from $(REGISTRY_IMAGE):$(IMAGE_TAG)...$(NC)"
	@mkdir -p output
	podman run --rm -it \
		--privileged \
		--pull=newer \
		--security-opt label=type:unconfined_t \
		-v $(PWD)/output:/output \
		-v /var/lib/containers/storage:/var/lib/containers/storage \
		quay.io/centos-bootc/bootc-image-builder \
		--type anaconda-iso \
		--output /output \
		$(REGISTRY_IMAGE):$(IMAGE_TAG)
	@echo "$(GREEN)✅ Anaconda ISO created in output/ directory$(NC)"
	@ls -lh output/

# Complete workflow targets
publish: build push ## Build and push image to registry
	@echo "$(GREEN)🚀 Image published successfully!$(NC)"

deploy-qcow2: publish qcow2 ## Complete workflow: build, push, and create QCOW2
	@echo "$(GREEN)🎉 QCOW2 deployment image ready!$(NC)"
	@echo "$(GREEN)📁 Deploy the QCOW2 image from: output/$(NC)"

clean-output: ## Clean output directory
	@echo "$(GREEN)Cleaning output directory...$(NC)"
	sudo rm -rf output/ output-macos/ output-v* output-final/
	@echo "$(GREEN)✅ Output directories cleaned$(NC)"

# Complete Deployment Workflows
deploy-container: ## Complete container deployment workflow
	@echo "$(GREEN)Complete container deployment workflow...$(NC)"
	$(MAKE) build
	$(MAKE) start
	@echo "$(GREEN)✅ Container deployment complete!$(NC)"
	@echo "$(GREEN)🌐 Access RHDH at: http://localhost:$(PORT)$(NC)"

deploy-vm: ## Complete VM deployment workflow  
	@echo "$(GREEN)Complete VM deployment workflow...$(NC)"
	$(MAKE) build
	$(MAKE) push
	$(MAKE) qcow2-macos
	@echo "$(GREEN)✅ VM deployment complete!$(NC)"
	@echo "$(GREEN)📁 QCOW2 ready: output-macos/qcow2/disk.qcow2$(NC)"
	@echo "$(GREEN)🚀 Start VM with: make -f MAC-VM-Makefile vm-start$(NC)"

test-container: ## Test container deployment
	@echo "$(GREEN)Testing container deployment...$(NC)"
	@curl -s http://localhost:$(PORT) >/dev/null && echo "$(GREEN)✅ Container RHDH is working!$(NC)" || echo "$(RED)❌ Container not responding$(NC)"

test-vm: ## Test VM deployment
	@echo "$(GREEN)Testing VM deployment...$(NC)"
	@make -f MAC-VM-Makefile vm-test