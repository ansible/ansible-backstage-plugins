# RHDH Quadlet Bootc Image Management  
# Red Hat Developer Hub with Ansible Self-Service Portal using Logically Bound Images on RHEL 9 Image Mode

# Configuration
IMAGE_NAME := rhdh-bootc-quadlet
IMAGE_TAG := latest
VM_NAME := rhdh-quadlet-vm
VM_MEMORY := 4096
VM_VCPUS := 2
PORT := 7007
CONTAINERFILE := Containerfile.rhdh-bootc-quadlet

# Registry Configuration
REGISTRY := quay.io
NAMESPACE := audgirka
REGISTRY_IMAGE := $(REGISTRY)/$(NAMESPACE)/$(IMAGE_NAME)

# Build script and paths
BUILD_SCRIPT := ./build-quadlet.sh
VALIDATE_SCRIPT := ./validate-quadlet.sh
QUADLET_DIR := $(CURDIR)
IMAGE_MODE_DIR := $(PWD)/..

# Colors for output
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
BLUE := \033[0;34m
NC := \033[0m # No Color

.PHONY: help validate build build-local clean tag push qcow2 qcow2-local qcow2-if-needed qcow2-test vm-create-registry vm-create-registry-only vm-create-local vm-start vm-stop vm-status vm-test vm-destroy vm-destroy-local vm-destroy-registry vm-console health test-local test-vm deploy-local deploy-vm-registry deploy-vm-local deploy-vm vm-create up down status test publish login list-outputs clean-outputs postgres-setup postgres-start postgres-stop postgres-status postgres-logs postgres-connect postgres-destroy pull-all-images list-quadlet-images check-image-status

# Default target
help: ## Show this help message
	@echo "$(GREEN)RHDH Quadlet Bootc Image Management$(NC)"
	@echo "===================================="
	@echo ""
	@echo "$(BLUE)Logically Bound Images with Podman Quadlet$(NC)"
	@echo "Uses RHEL 9 Image Mode with automatic RHDH image management"
	@echo ""
	@echo "Available targets:"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(YELLOW)%-18s$(NC) %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "$(BLUE)Quick Start - Local Development:$(NC)"
	@echo "  $(GREEN)make deploy-vm-local$(NC)     # Complete local development workflow"
	@echo "  $(GREEN)make test-vm$(NC)             # Test RHDH in VM"
	@echo ""
	@echo "$(BLUE)Production - Registry Workflow:$(NC)"
	@echo "  $(GREEN)make deploy-vm-registry$(NC)  # Complete registry-based deployment"
	@echo "  $(GREEN)make test-vm$(NC)             # Test RHDH in VM"
	@echo ""
	@echo "$(BLUE)Individual Steps:$(NC)"
	@echo "  $(GREEN)make build-local$(NC)         # Build image locally" 
	@echo "  $(GREEN)make qcow2-local$(NC)         # Create QCOW2 from local image"
	@echo "  $(GREEN)make vm-create-local$(NC)     # Create VM from local QCOW2"
	@echo ""
	@echo "$(BLUE)PostgreSQL Database:$(NC)"
	@echo "  $(GREEN)make postgres-setup$(NC)      # Setup PostgreSQL data directory"
	@echo "  $(GREEN)make postgres-start$(NC)      # Start PostgreSQL container"
	@echo "  $(GREEN)make postgres-stop$(NC)       # Stop PostgreSQL container"
	@echo "  $(GREEN)make postgres-status$(NC)     # Check PostgreSQL status"
	@echo ""
	@echo "$(BLUE)Image Management:$(NC)"
	@echo "  $(GREEN)make check-image-status$(NC)  # Check which images are available"
	@echo "  $(GREEN)make pull-all-images$(NC)     # Check and pull all required images"
	@echo "  $(GREEN)make list-quadlet-images$(NC) # List all images used in setup"

validate: ## Validate Quadlet configuration files
	@echo "$(GREEN)Validating Quadlet configuration...$(NC)"
	@if [ -x "$(VALIDATE_SCRIPT)" ]; then \
		$(VALIDATE_SCRIPT); \
	else \
		echo "$(RED)Validation script not found or not executable$(NC)"; \
		exit 1; \
	fi

build-local: validate ## Build bootc image locally using build-quadlet.sh
	@echo "$(GREEN)Building RHDH Quadlet bootc image locally...$(NC)"
	$(BUILD_SCRIPT) -n $(IMAGE_NAME) -t $(IMAGE_TAG) -f quadlet/$(CONTAINERFILE)
	@echo "$(GREEN)✅ Local build completed: $(IMAGE_NAME):$(IMAGE_TAG)$(NC)"

build: validate ## Build bootc image for registry using build-quadlet.sh
	@echo "$(GREEN)Building RHDH Quadlet bootc image for registry...$(NC)"
	$(BUILD_SCRIPT) -n $(IMAGE_NAME) -t $(IMAGE_TAG) -r $(REGISTRY)/$(NAMESPACE) -f quadlet/$(CONTAINERFILE)
	@echo "$(GREEN)✅ Registry build completed: $(REGISTRY_IMAGE):$(IMAGE_TAG)$(NC)"

# Registry Operations
login: ## Login to registry
	@echo "$(GREEN)Logging into $(REGISTRY)...$(NC)"
	podman login $(REGISTRY)
	@echo "$(GREEN)✅ Logged in successfully$(NC)"

tag: ## Tag local image for registry
	@echo "$(GREEN)Tagging image for registry...$(NC)"
	podman tag $(IMAGE_NAME):$(IMAGE_TAG) $(REGISTRY_IMAGE):$(IMAGE_TAG)
	@echo "$(GREEN)✅ Tagged: $(REGISTRY_IMAGE):$(IMAGE_TAG)$(NC)"

push: tag ## Push image to registry
	@echo "$(GREEN)Pushing image to $(REGISTRY)...$(NC)"
	podman push $(REGISTRY_IMAGE):$(IMAGE_TAG)
	@echo "$(GREEN)✅ Image pushed successfully!$(NC)"
	@echo "$(GREEN)🌐 Image available at: $(REGISTRY_IMAGE):$(IMAGE_TAG)$(NC)"

# QCOW2 Image Creation
prepare-rootful-image: ## Ensure image is available in rootful storage
	@echo "$(GREEN)Preparing image for rootful podman...$(NC)"
	@# Check if image already exists in rootful storage - exit early if found
	@if sudo podman images | grep "$(IMAGE_NAME)" | grep "$(IMAGE_TAG)" >/dev/null; then \
		echo "$(GREEN)✅ Image $(IMAGE_NAME):$(IMAGE_TAG) already available in rootful storage - skipping transfer$(NC)"; \
		exit 0; \
	fi
	@# Single shell command to handle transfer logic properly (fixes Makefile multi-shell exit issue)
	@if [ "$$EUID" -eq 0 ] || [ -n "$$SUDO_USER" ]; then \
		echo "$(YELLOW)Running as root/sudo - checking user $$SUDO_USER storage...$(NC)"; \
		if [ -n "$$SUDO_USER" ]; then \
			USER_HOME=$$(getent passwd $$SUDO_USER | cut -d: -f6); \
			if sudo -u $$SUDO_USER XDG_RUNTIME_DIR="/run/user/$$(id -u $$SUDO_USER)" podman images | grep "$(IMAGE_NAME)" | grep "$(IMAGE_TAG)" >/dev/null; then \
				echo "$(GREEN)Found image in user $$SUDO_USER storage, transferring...$(NC)"; \
				sudo -u $$SUDO_USER XDG_RUNTIME_DIR="/run/user/$$(id -u $$SUDO_USER)" podman save $(IMAGE_NAME):$(IMAGE_TAG) -o /tmp/$(IMAGE_NAME)-$(IMAGE_TAG).tar; \
				sudo podman load -i /tmp/$(IMAGE_NAME)-$(IMAGE_TAG).tar; \
				rm -f /tmp/$(IMAGE_NAME)-$(IMAGE_TAG).tar; \
				echo "$(GREEN)✅ Image transferred to rootful storage$(NC)"; \
			else \
				echo "$(RED)❌ Image $(IMAGE_NAME):$(IMAGE_TAG) not found in user $$SUDO_USER storage$(NC)"; \
				echo "$(YELLOW)Build it first with: make build-local$(NC)"; \
				exit 1; \
			fi; \
		else \
			echo "$(RED)❌ Running as root but SUDO_USER not set$(NC)"; \
			echo "$(YELLOW)Build image first or run without sudo$(NC)"; \
			exit 1; \
		fi; \
	else \
		if podman images | grep "$(IMAGE_NAME)" | grep "$(IMAGE_TAG)" >/dev/null; then \
			echo "$(GREEN)Found image in user storage, transferring...$(NC)"; \
			podman save $(IMAGE_NAME):$(IMAGE_TAG) -o /tmp/$(IMAGE_NAME)-$(IMAGE_TAG).tar; \
			sudo podman load -i /tmp/$(IMAGE_NAME)-$(IMAGE_TAG).tar; \
			rm -f /tmp/$(IMAGE_NAME)-$(IMAGE_TAG).tar; \
			echo "$(GREEN)✅ Image transferred to rootful storage$(NC)"; \
		else \
			echo "$(RED)❌ Image $(IMAGE_NAME):$(IMAGE_TAG) not found in user storage$(NC)"; \
			echo "$(YELLOW)Build it first with: make build-local$(NC)"; \
			exit 1; \
		fi; \
	fi

qcow2-local: check-rootful-podman prepare-rootful-image pull-all-images ## Create QCOW2 from local image (requires sudo/root)
	@echo "$(GREEN)Creating QCOW2 image from local $(IMAGE_NAME):$(IMAGE_TAG)...$(NC)"
	@echo "$(YELLOW)Note: bootc-image-builder requires rootful podman (sudo)$(NC)"
	@echo "$(BLUE)INFO: bootc automatically discovers and pulls logically bound images during installation$(NC)"
	@echo "$(BLUE)INFO: Using configuration file to create 20GB disk (vs default 10GB) for RHDH application$(NC)"
	@echo "$(BLUE)INFO: Using larger temporary filesystems to accommodate image extraction$(NC)"
	@mkdir -p $(QUADLET_DIR)/output
	@echo "$(BLUE)Mounting config file: $(QUADLET_DIR)/config.toml$(NC)"
	@test -f $(QUADLET_DIR)/config.toml || { echo "$(RED)❌ Config file not found: $(QUADLET_DIR)/config.toml$(NC)"; exit 1; }
	@cd $(QUADLET_DIR) && sudo podman run --rm -it \
		--privileged \
		--pull=newer \
		--security-opt label=type:unconfined_t \
		-v "$(QUADLET_DIR)/output:/output" \
		-v "$(QUADLET_DIR)/config.toml:/config.toml:ro" \
		-v /var/lib/containers/storage:/var/lib/containers/storage \
		registry.redhat.io/rhel9/bootc-image-builder \
		--type qcow2 \
		--config /config.toml \
		--output /output \
		localhost/$(IMAGE_NAME):$(IMAGE_TAG)
	@echo "$(GREEN)✅ QCOW2 image created in output/ directory$(NC)"
	@echo "$(GREEN)📁 Files created:$(NC)"
	@ls -lh $(QUADLET_DIR)/output/

qcow2: pull-all-images ## Create QCOW2 from registry image (requires sudo/root)
	@echo "$(GREEN)Creating QCOW2 image from $(REGISTRY_IMAGE):$(IMAGE_TAG)...$(NC)"
	@echo "$(YELLOW)Note: bootc-image-builder requires rootful podman (sudo)$(NC)"
	@echo "$(BLUE)INFO: bootc automatically discovers and pulls logically bound images during installation$(NC)"
	@echo "$(BLUE)INFO: Using configuration file to create 20GB disk (vs default 10GB) for RHDH application$(NC)"
	@echo "$(BLUE)INFO: Using larger temporary filesystems to accommodate image extraction$(NC)"
	@mkdir -p $(QUADLET_DIR)/output
	@echo "$(BLUE)Mounting config file: $(QUADLET_DIR)/config.toml$(NC)"
	@test -f $(QUADLET_DIR)/config.toml || { echo "$(RED)❌ Config file not found: $(QUADLET_DIR)/config.toml$(NC)"; exit 1; }
	@cd $(QUADLET_DIR) && sudo podman run --rm -it \
		--privileged \
		--pull=newer \
		--security-opt label=type:unconfined_t \
		-v "$(QUADLET_DIR)/output:/output" \
		-v "$(QUADLET_DIR)/config.toml:/config.toml:ro" \
		-v /var/lib/containers/storage:/var/lib/containers/storage \
		registry.redhat.io/rhel9/bootc-image-builder \
		--type qcow2 \
		--config /config.toml \
		--output /output \
		$(REGISTRY_IMAGE):$(IMAGE_TAG)
	@echo "$(GREEN)✅ QCOW2 image created in output/ directory$(NC)"
	@echo "$(GREEN)📁 Files created:$(NC)"
	@ls -lh $(QUADLET_DIR)/output/

qcow2-test: qcow2-local ## Create QCOW2 and test basic integrity
	@echo "$(GREEN)Testing QCOW2 integrity...$(NC)"
	@if [ -f "$(QUADLET_DIR)/output/qcow2/disk.qcow2" ]; then \
		echo "$(GREEN)✅ QCOW2 file exists$(NC)"; \
		qemu-img info $(QUADLET_DIR)/output/qcow2/disk.qcow2; \
	else \
		echo "$(RED)❌ QCOW2 file not found$(NC)"; \
		exit 1; \
	fi

# ISO Creation (for bare metal deployment)
iso-local: pull-all-images ## Create ISO from local image (requires sudo/root)
	@echo "$(GREEN)Creating ISO installer from local $(IMAGE_NAME):$(IMAGE_TAG)...$(NC)"
	@echo "$(YELLOW)Note: bootc-image-builder requires rootful podman (sudo)$(NC)"
	@mkdir -p $(QUADLET_DIR)/output
	@cd $(QUADLET_DIR) && sudo podman run --rm -it \
		--privileged \
		--pull=newer \
		--security-opt label=type:unconfined_t \
		-v $(QUADLET_DIR)/output:/output \
		-v /var/lib/containers/storage:/var/lib/containers/storage \
		registry.redhat.io/rhel9/bootc-image-builder \
		--type iso \
		--output /output \
		localhost/$(IMAGE_NAME):$(IMAGE_TAG)
	@echo "$(GREEN)✅ ISO image created in output/ directory$(NC)"
	@ls -lh $(QUADLET_DIR)/output/

# Prerequisites and Dependency Checks
check-rootful-podman: ## Check if rootful podman is available
	@echo "$(GREEN)Checking rootful podman access...$(NC)"
	@if sudo -n podman version >/dev/null 2>&1; then \
		echo "$(GREEN)✅ Rootful podman access confirmed$(NC)"; \
	else \
		echo "$(RED)❌ Rootful podman access required$(NC)"; \
		echo "$(YELLOW)Solutions:$(NC)"; \
		echo "  1. Run: sudo podman version  (to test access)"; \
		echo "  2. Add yourself to sudoers: sudo usermod -aG wheel \$$USER"; \
		echo "  3. Or run make targets with sudo: sudo make qcow2-local"; \
		echo ""; \
		echo "$(YELLOW)Why rootful podman is needed:$(NC)"; \
		echo "  bootc-image-builder requires privileged operations for:"; \
		echo "  - Creating disk images"; \
		echo "  - Managing loop devices"; \
		echo "  - File system operations"; \
		exit 1; \
	fi

check-deps: ## Check all dependencies for image creation
	@echo "$(GREEN)Checking bootc-image-builder dependencies...$(NC)"
	@$(MAKE) check-rootful-podman
	@echo "$(GREEN)✅ All dependencies checked$(NC)"

# VM Management (requires libvirt)
vm-check-deps: ## Check VM dependencies
	@echo "$(GREEN)Checking VM dependencies...$(NC)"
	@which qemu-system-x86_64 >/dev/null 2>&1 || which /usr/libexec/qemu-kvm >/dev/null 2>&1 || { echo "$(YELLOW)⚠ QEMU not installed$(NC)"; echo "$(BLUE)INFO: Install with: sudo dnf install qemu-kvm qemu-kvm-core libvirt virt-install$(NC)"; echo "$(BLUE)INFO: Or use 'make test-image-config' to verify bootc image without VM$(NC)"; }
	@which virsh >/dev/null 2>&1 || { echo "$(YELLOW)⚠ libvirt not available$(NC)"; }
	@echo "$(GREEN)✅ VM dependencies checked (alternative testing available)$(NC)"

qcow2-if-needed: ## Smart QCOW2 creation - only rebuild if needed
	@echo "$(GREEN)Checking if QCOW2 rebuild is needed...$(NC)"
	@QCOW2_FILE="$(QUADLET_DIR)/output/qcow2/disk.qcow2"; \
	if [ ! -f "$$QCOW2_FILE" ]; then \
		echo "$(YELLOW)QCOW2 file doesn't exist, creating...$(NC)"; \
		$(MAKE) qcow2-local; \
	else \
		echo "$(BLUE)QCOW2 file exists, checking freshness...$(NC)"; \
		IMAGE_ID=$$(podman images --format "{{.ID}} {{.Created}}" | grep $$(podman images --format "{{.Repository}}:{{.Tag}} {{.ID}}" | grep "$(IMAGE_NAME):$(IMAGE_TAG)" | cut -d' ' -f2) | head -1); \
		if [ -n "$$IMAGE_ID" ]; then \
			IMAGE_CREATED=$$(echo "$$IMAGE_ID" | cut -d' ' -f2-); \
			QCOW2_CREATED=$$(stat -c %Y "$$QCOW2_FILE" 2>/dev/null || echo "0"); \
			IMAGE_TIMESTAMP=$$(date -d "$$IMAGE_CREATED" +%s 2>/dev/null || echo "999999999999"); \
			if [ "$$IMAGE_TIMESTAMP" -gt "$$QCOW2_CREATED" ]; then \
				echo "$(YELLOW)Image is newer than QCOW2, rebuilding...$(NC)"; \
				echo "$(BLUE)  Image created: $$IMAGE_CREATED$(NC)"; \
				echo "$(BLUE)  QCOW2 created: $$(date -d @$$QCOW2_CREATED 2>/dev/null || echo "unknown")$(NC)"; \
				$(MAKE) qcow2-local; \
			else \
				echo "$(GREEN)✅ QCOW2 is up-to-date (newer than image)$(NC)"; \
				echo "$(BLUE)  Using existing: $$QCOW2_FILE$(NC)"; \
				ls -lh "$$QCOW2_FILE"; \
			fi; \
		else \
			echo "$(YELLOW)Image $(IMAGE_NAME):$(IMAGE_TAG) not found, rebuilding QCOW2...$(NC)"; \
			$(MAKE) qcow2-local; \
		fi; \
	fi

vm-create-registry-only: vm-check-deps ## Create VM from existing registry QCOW2 (requires libvirt)
	@echo "$(GREEN)Creating VM from existing registry QCOW2: $(VM_NAME)-registry...$(NC)"
	@test -f $(QUADLET_DIR)/output/qcow2/disk.qcow2 || { echo "$(RED)❌ QCOW2 file not found. Run 'make qcow2' first.$(NC)"; exit 1; }
	@if virsh list --all | grep -q $(VM_NAME)-registry; then \
		echo "$(YELLOW)VM $(VM_NAME)-registry already exists, destroying first...$(NC)"; \
		$(MAKE) vm-destroy-registry; \
	fi
	@sudo cp $(QUADLET_DIR)/output/qcow2/disk.qcow2 /tmp/$(VM_NAME)-registry.qcow2
	@sudo chmod 644 /tmp/$(VM_NAME)-registry.qcow2
	@virt-install \
		--name $(VM_NAME)-registry \
		--memory $(VM_MEMORY) \
		--vcpus $(VM_VCPUS) \
		--disk path=/tmp/$(VM_NAME)-registry.qcow2,format=qcow2 \
		--import \
		--os-variant rhel10.0 \
		--network default \
		--graphics none \
		--console pty,target_type=serial \
		--noautoconsole
	@echo "$(GREEN)✅ VM created and started from registry image$(NC)"

vm-create-registry: qcow2 vm-check-deps ## Create VM from registry QCOW2 (requires libvirt)
	@echo "$(GREEN)Creating VM from registry image: $(VM_NAME)-registry...$(NC)"
	@if virsh list --all | grep -q $(VM_NAME)-registry; then \
		echo "$(YELLOW)VM $(VM_NAME)-registry already exists, destroying first...$(NC)"; \
		$(MAKE) vm-destroy-registry; \
	fi
	@sudo cp $(QUADLET_DIR)/output/qcow2/disk.qcow2 /tmp/$(VM_NAME)-registry.qcow2
	@sudo chmod 644 /tmp/$(VM_NAME)-registry.qcow2
	@virt-install \
		--name $(VM_NAME)-registry \
		--memory $(VM_MEMORY) \
		--vcpus $(VM_VCPUS) \
		--disk path=/tmp/$(VM_NAME)-registry.qcow2,format=qcow2 \
		--import \
		--os-variant rhel10.0 \
		--network default \
		--graphics none \
		--console pty,target_type=serial \
		--noautoconsole
	@echo "$(GREEN)✅ VM created and started from registry image$(NC)"

vm-create-local: qcow2-local vm-check-deps ## Create VM from local QCOW2 (requires libvirt)
	@echo "$(GREEN)Creating VM from local image: $(VM_NAME)...$(NC)"
	@if virsh list --all | grep -q $(VM_NAME); then \
		echo "$(YELLOW)VM $(VM_NAME) already exists, destroying first...$(NC)"; \
		$(MAKE) vm-destroy-local; \
	fi
	@sudo cp $(QUADLET_DIR)/output/qcow2/disk.qcow2 /tmp/$(VM_NAME).qcow2
	@sudo chmod 644 /tmp/$(VM_NAME).qcow2
	@virt-install \
		--name $(VM_NAME) \
		--memory $(VM_MEMORY) \
		--vcpus $(VM_VCPUS) \
		--disk path=/tmp/$(VM_NAME).qcow2,format=qcow2 \
		--import \
		--os-variant rhel10.0 \
		--network default \
		--graphics none \
		--console pty,target_type=serial \
		--noautoconsole
	@echo "$(GREEN)✅ VM created and started from local image$(NC)"

vm-start: ## Start VM
	@echo "$(GREEN)Starting VM: $(VM_NAME)...$(NC)"
	@virsh start $(VM_NAME) || echo "$(YELLOW)VM may already be running$(NC)"
	@echo "$(GREEN)✅ VM start initiated$(NC)"

vm-stop: ## Stop VM gracefully
	@echo "$(GREEN)Stopping VM: $(VM_NAME)...$(NC)"
	@virsh shutdown $(VM_NAME) || echo "$(YELLOW)VM may not be running$(NC)"
	@echo "$(GREEN)✅ VM shutdown initiated$(NC)"

vm-force-stop: ## Force stop VM
	@echo "$(GREEN)Force stopping VM: $(VM_NAME)...$(NC)"
	@virsh destroy $(VM_NAME) 2>/dev/null || echo "$(YELLOW)VM was not running$(NC)"
	@echo "$(GREEN)✅ VM force stopped$(NC)"

vm-status: ## Show VM status and info
	@echo "$(GREEN)VM Status:$(NC)"
	@virsh list --all | grep $(VM_NAME) || echo "$(YELLOW)VM $(VM_NAME) not found$(NC)"
	@echo ""
	@echo "$(GREEN)VM Details:$(NC)"
	@virsh dominfo $(VM_NAME) 2>/dev/null || echo "$(YELLOW)VM not found$(NC)"

vm-ip: ## Get VM IP address
	@echo "$(GREEN)Getting VM IP address...$(NC)"
	@virsh domifaddr $(VM_NAME) 2>/dev/null || echo "$(YELLOW)No IP assigned yet or VM not running$(NC)"
	@echo ""
	@echo "$(GREEN)Network leases:$(NC)"
	@virsh net-dhcp-leases default 2>/dev/null || echo "$(YELLOW)No DHCP leases$(NC)"

vm-console: ## Connect to VM console
	@echo "$(GREEN)Connecting to VM console (Ctrl+] to exit)...$(NC)"
	@virsh console $(VM_NAME)

vm-destroy-local: ## Destroy local VM and cleanup
	@echo "$(GREEN)Destroying local VM: $(VM_NAME)...$(NC)"
	@virsh destroy $(VM_NAME) 2>/dev/null || true
	@virsh undefine $(VM_NAME) 2>/dev/null || true
	@sudo rm -f /tmp/$(VM_NAME).qcow2
	@echo "$(GREEN)✅ Local VM destroyed and cleaned up$(NC)"

vm-destroy-registry: ## Destroy registry VM and cleanup
	@echo "$(GREEN)Destroying registry VM: $(VM_NAME)-registry...$(NC)"
	@virsh destroy $(VM_NAME)-registry 2>/dev/null || true
	@virsh undefine $(VM_NAME)-registry 2>/dev/null || true
	@sudo rm -f /tmp/$(VM_NAME)-registry.qcow2
	@echo "$(GREEN)✅ Registry VM destroyed and cleaned up$(NC)"

vm-destroy: vm-destroy-local vm-destroy-registry ## Destroy both local and registry VMs
	@echo "$(GREEN)✅ All VMs destroyed and cleaned up$(NC)"

# Direct QEMU (alternative to libvirt)
qemu-start: qcow2-if-needed ## Start VM using direct QEMU (no libvirt required)
	@echo "$(GREEN)Starting QEMU VM with RHDH Quadlet...$(NC)"
	@echo "$(YELLOW)VM will be accessible on:$(NC)"
	@echo "  $(GREEN)SSH:$(NC)  ssh admin@localhost -p 2222  (password: admin123)"
	@echo "  $(GREEN)RHDH:$(NC) http://localhost:7007"
	@echo "  $(GREEN)VNC:$(NC)  vnc://localhost:5901"
	@echo ""
	@qemu-system-x86_64 \
		-m $(VM_MEMORY) \
		-cpu host \
		-enable-kvm \
		-netdev user,id=net0,hostfwd=tcp::7007-:7007,hostfwd=tcp::2222-:22 \
		-device virtio-net,netdev=net0 \
		-drive file=$(QUADLET_DIR)/output/qcow2/disk.qcow2,format=qcow2,if=virtio \
		-display vnc=:1 \
		-name "RHDH Quadlet VM"

# VM Testing and Management
# Testing
test-local: ## Test local image build
	@echo "$(GREEN)Testing local image...$(NC)"
	@podman images | grep $(IMAGE_NAME) && echo "$(GREEN)✅ Local image exists$(NC)" || echo "$(RED)❌ Local image not found$(NC)"

test-vm: ## Test RHDH in VM (requires VM to be running)
	@echo "$(GREEN)Testing RHDH service in VM...$(NC)"
	@echo "$(YELLOW)Attempting to connect to VM on common IPs...$(NC)"
	@for ip in localhost 192.168.122.100 192.168.122.101 192.168.122.102; do \
		echo "Testing $$ip:7007..."; \
		if curl -s --connect-timeout 5 http://$$ip:7007 >/dev/null 2>&1; then \
			echo "$(GREEN)✅ RHDH responding at $$ip:7007$(NC)"; \
			echo "$(GREEN)Testing endpoints:$(NC)"; \
			curl -s http://$$ip:7007 | head -3; \
			echo ""; \
			curl -s http://$$ip:7007/self-service | head -3 2>/dev/null || echo "Self-service portal check complete"; \
			break; \
		fi; \
	done

test-vm-comprehensive: ## Comprehensive RHDH test in VM
	@echo "$(GREEN)Comprehensive RHDH test...$(NC)"
	@VM_IP=$$(virsh domifaddr $(VM_NAME) 2>/dev/null | grep -oE "192\.168\.[0-9]+\.[0-9]+" | head -1); \
	if [ -n "$$VM_IP" ]; then \
		echo "$(GREEN)Testing RHDH at $$VM_IP:7007$(NC)"; \
		echo "=== Main Page ==="; \
		timeout 10 curl -s http://$$VM_IP:7007 | head -5 || echo "Main page timeout"; \
		echo ""; \
		echo "=== Health Check ==="; \
		timeout 10 curl -s http://$$VM_IP:7007/api/app/health || echo "Health check timeout"; \
		echo ""; \
		echo "=== Self-Service Portal ==="; \
		timeout 10 curl -s http://$$VM_IP:7007/self-service | head -3 || echo "Self-service timeout"; \
		echo ""; \
	else \
		echo "$(RED)❌ No IP address found for VM$(NC)"; \
		echo "$(YELLOW)Trying direct QEMU access...$(NC)"; \
		timeout 10 curl -s http://localhost:7007 | head -3 || echo "Direct access failed"; \
	fi

# Logically bound images verification
test-bound-images: ## Test logically bound images functionality (requires running VM)
	@echo "$(GREEN)Testing logically bound images...$(NC)"
	@echo "$(YELLOW)This test checks if RHDH image was pulled automatically$(NC)"
	@VM_IP=$$(virsh domifaddr $(VM_NAME) 2>/dev/null | grep -oE "192\.168\.[0-9]+\.[0-9]+" | head -1); \
	if [ -n "$$VM_IP" ]; then \
		echo "$(GREEN)Connecting to VM to check bound images...$(NC)"; \
		ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 admin@$$VM_IP \
			"sudo /usr/local/bin/manage-bound-images.sh" 2>/dev/null || \
			echo "$(YELLOW)Could not connect via SSH, VM may still be booting$(NC)"; \
	else \
		echo "$(RED)❌ Cannot get VM IP for testing$(NC)"; \
	fi

# Workflow targets
# Legacy alias for backward compatibility
deploy-local: deploy-vm-local ## Alias for deploy-vm-local (backward compatibility)

# Alternative: Build and QCOW2 in one step without dependencies
build-and-qcow2: ## Build image and create QCOW2 (complete workflow)
	@echo "$(GREEN)🚀 Building image and creating QCOW2...$(NC)"
	@$(MAKE) build-local
	@$(MAKE) qcow2-local
	@echo "$(GREEN)✅ Complete build and QCOW2 creation finished!$(NC)"

# Alternative approach: Non-sudo workflow
prepare-image-for-sudo: build-local ## Prepare image for sudo operations (run as user)
	@echo "$(GREEN)Preparing image for sudo operations...$(NC)"
	@if podman images | grep "$(IMAGE_NAME)" | grep "$(IMAGE_TAG)" >/dev/null; then \
		echo "$(GREEN)Saving image to temporary file...$(NC)"; \
		podman save $(IMAGE_NAME):$(IMAGE_TAG) -o /tmp/$(IMAGE_NAME)-$(IMAGE_TAG).tar; \
		echo "$(GREEN)✅ Image saved to /tmp/$(IMAGE_NAME)-$(IMAGE_TAG).tar$(NC)"; \
		echo "$(YELLOW)Now run: sudo make load-and-qcow2$(NC)"; \
	else \
		echo "$(RED)❌ Image $(IMAGE_NAME):$(IMAGE_TAG) not found$(NC)"; \
		echo "$(YELLOW)Available images:$(NC)"; \
		podman images | head -5; \
		exit 1; \
	fi

load-and-qcow2: ## Load image and create QCOW2 (run with sudo)
	@echo "$(GREEN)Loading image and creating QCOW2...$(NC)"
	@if [ -f "/tmp/$(IMAGE_NAME)-$(IMAGE_TAG).tar" ]; then \
		echo "$(GREEN)Loading bootc image into rootful storage...$(NC)"; \
		podman load -i /tmp/$(IMAGE_NAME)-$(IMAGE_TAG).tar; \
		rm -f /tmp/$(IMAGE_NAME)-$(IMAGE_TAG).tar; \
		echo "$(BLUE)INFO: bootc will automatically pull logically bound images during installation$(NC)"; \
		echo "$(BLUE)INFO: Using config.toml to create 20GB disk for RHDH application space$(NC)"; \
		echo "$(GREEN)Creating QCOW2 image...$(NC)"; \
		mkdir -p $(QUADLET_DIR)/output; \
		echo "$(BLUE)Mounting config file: $(QUADLET_DIR)/config.toml$(NC)"; \
		test -f $(QUADLET_DIR)/config.toml || { echo "$(RED)❌ Config file not found: $(QUADLET_DIR)/config.toml$(NC)"; exit 1; }; \
		cd $(QUADLET_DIR) && podman run --rm -it \
			--privileged \
			--pull=newer \
			--security-opt label=type:unconfined_t \
			-v "$(QUADLET_DIR)/output:/output" \
			-v "$(QUADLET_DIR)/config.toml:/config.toml:ro" \
			-v /var/lib/containers/storage:/var/lib/containers/storage \
			--tmpfs /tmp:size=10G \
			--tmpfs /var/tmp:size=5G \
			--shm-size=2G \
			registry.redhat.io/rhel9/bootc-image-builder \
			--type qcow2 \
			--config /config.toml \
			--output /output \
			localhost/$(IMAGE_NAME):$(IMAGE_TAG); \
		echo "$(GREEN)✅ QCOW2 image created in output/ directory$(NC)"; \
		ls -lh $(QUADLET_DIR)/output/; \
	else \
		echo "$(RED)❌ Image archive not found at /tmp/$(IMAGE_NAME)-$(IMAGE_TAG).tar$(NC)"; \
		echo "$(YELLOW)Run: make prepare-image-for-sudo first$(NC)"; \
		exit 1; \
	fi

deploy-vm-registry: build qcow2 vm-create-registry ## Complete registry-based deployment workflow
	@echo "$(GREEN)🚀 Registry-based VM deployment completed!$(NC)"
	@echo "$(BLUE)Image used: $(REGISTRY_IMAGE):$(IMAGE_TAG)$(NC)"
	@echo "$(YELLOW)⏳ Waiting for services to start (2 minutes)...$(NC)"
	@sleep 120
	@$(MAKE) test-vm

deploy-vm-local: build-local vm-create-local ## Complete local development deployment workflow  
	@echo "$(GREEN)🚀 Local VM deployment completed!$(NC)"
	@echo "$(BLUE)Image used: localhost/$(IMAGE_NAME):$(IMAGE_TAG)$(NC)"
	@echo "$(YELLOW)⏳ Waiting for services to start (2 minutes)...$(NC)"
	@sleep 120
	@$(MAKE) test-vm

publish: build push ## Build and push to registry
	@echo "$(GREEN)🚀 Image published successfully!$(NC)"

# Cleanup
clean: ## Clean up images and temporary files
	@echo "$(GREEN)Cleaning up...$(NC)"
	@podman rmi $(IMAGE_NAME):$(IMAGE_TAG) 2>/dev/null || echo "$(YELLOW)Local image not found$(NC)"
	@echo "$(GREEN)✅ Cleanup completed$(NC)"

clean-outputs: ## Clean output directories
	@echo "$(GREEN)Cleaning output directories...$(NC)"
	@rm -rf $(QUADLET_DIR)/output/
	@echo "$(GREEN)✅ Output directories cleaned$(NC)"

clean-all: clean clean-outputs vm-destroy ## Complete cleanup including VM
	@echo "$(GREEN)✅ Complete cleanup finished$(NC)"

list-outputs: ## List generated output files
	@echo "$(GREEN)Generated Files:$(NC)"
	@if [ -d "$(QUADLET_DIR)/output" ]; then \
		find $(QUADLET_DIR)/output -type f -exec ls -lh {} \; 2>/dev/null || echo "$(YELLOW)No files found$(NC)"; \
	else \
		echo "$(YELLOW)No output directory found$(NC)"; \
	fi

# Information targets
info: ## Show configuration and status
	@echo "$(GREEN)RHDH Quadlet Configuration:$(NC)"
	@echo "=============================="
	@echo "$(YELLOW)Image:$(NC)           $(IMAGE_NAME):$(IMAGE_TAG)"
	@echo "$(YELLOW)Registry:$(NC)        $(REGISTRY_IMAGE):$(IMAGE_TAG)"
	@echo "$(YELLOW)Containerfile:$(NC)   $(CONTAINERFILE)"
	@echo "$(YELLOW)VM Name:$(NC)         $(VM_NAME)"
	@echo "$(YELLOW)VM Memory:$(NC)       $(VM_MEMORY)MB"
	@echo "$(YELLOW)VM CPUs:$(NC)         $(VM_VCPUS)"
	@echo "$(YELLOW)RHDH Port:$(NC)       $(PORT)"
	@echo ""
	@echo "$(GREEN)Logically Bound Images:$(NC)"
	@echo "$(YELLOW)RHDH Image:$(NC)      registry.redhat.io/rhdh/rhdh-hub-rhel9:1.6"
	@echo "$(YELLOW)Quadlet Files:$(NC)   rhdh.container"
	@echo "$(YELLOW)Bound Location:$(NC)  /usr/lib/bootc/bound-images.d/"

# Backward compatibility aliases
deploy-vm: deploy-vm-local ## Alias for deploy-vm-local (backward compatibility - defaults to local)
vm-create: vm-create-local ## Alias for vm-create-local (backward compatibility - defaults to local)

# Image Management
QUADLET_IMAGES := \
	registry.redhat.io/rhel9/rhel-bootc:latest \
	registry.redhat.io/rhdh/rhdh-hub-rhel9:1.6 \
	registry.redhat.io/rhel9/postgresql-15:latest \
	registry.redhat.io/rhel9/bootc-image-builder

pull-all-images: ## Check and pull all container images used in quadlet setup (requires sudo)
	@echo "$(GREEN)Checking and pulling container images for quadlet setup...$(NC)"
	@echo "$(BLUE)This ensures all images are available for bootc-image-builder$(NC)"
	@echo ""
	@for image in $(QUADLET_IMAGES); do \
		echo "$(YELLOW)Checking: $$image$(NC)"; \
		if sudo podman image exists $$image >/dev/null 2>&1; then \
			echo "$(GREEN)✅ Already available: $$image$(NC)"; \
		else \
			echo "$(BLUE)📥 Pulling: $$image$(NC)"; \
			if sudo podman pull $$image >/dev/null 2>&1; then \
				echo "$(GREEN)✅ Successfully pulled: $$image$(NC)"; \
			else \
				echo "$(RED)❌ Failed to pull: $$image$(NC)"; \
				echo "$(YELLOW)⚠️  Error details:$(NC)"; \
				sudo podman pull $$image 2>&1 | sed 's/^/    /'; \
				echo "$(YELLOW)⚠️  Build may fail if this image is required$(NC)"; \
			fi; \
		fi; \
	done
	@echo ""
	@echo "$(GREEN)✅ Image availability check completed!$(NC)"

list-quadlet-images: ## List all container images used in the quadlet setup
	@echo "$(GREEN)Container Images Used in Quadlet Setup:$(NC)"
	@echo "======================================"
	@echo ""
	@echo "$(BLUE)Base Images:$(NC)"
	@echo "  registry.redhat.io/rhel9/rhel-bootc:latest           $(YELLOW)# Containerfile base image$(NC)"
	@echo ""
	@echo "$(BLUE)Application Images (Logically Bound):$(NC)"
	@echo "  registry.redhat.io/rhdh/rhdh-hub-rhel9:1.6           $(YELLOW)# RHDH application$(NC)"
	@echo "  registry.redhat.io/rhel9/postgresql-15:latest        $(YELLOW)# PostgreSQL database$(NC)"
	@echo ""
	@echo "$(BLUE)Build Tools:$(NC)"
	@echo "  registry.redhat.io/rhel9/bootc-image-builder         $(YELLOW)# QCOW2/ISO creation$(NC)"
	@echo ""
	@echo "$(GREEN)Total Images: 4$(NC)"

check-image-status: ## Check availability status of all quadlet images (requires sudo)
	@echo "$(GREEN)Checking image availability status...$(NC)"
	@echo "$(BLUE)This shows which images are already available locally$(NC)"
	@echo ""
	@for image in $(QUADLET_IMAGES); do \
		printf "$(YELLOW)%-50s$(NC) " "$$image"; \
		if sudo podman image exists $$image >/dev/null 2>&1; then \
			echo "$(GREEN)✅ Available$(NC)"; \
		else \
			echo "$(RED)❌ Missing$(NC)"; \
		fi; \
	done
	@echo ""
	@echo "$(BLUE)Use 'make pull-all-images' to pull missing images$(NC)"

# Quick aliases
up: vm-start ## Alias for vm-start
down: vm-stop ## Alias for vm-stop  
status: vm-status ## Alias for vm-status
test: test-vm ## Alias for test-vm
health: test-vm ## Alias for test-vm

# Alternative testing for RHEL 9 (without QEMU dependency)
test-image-config: ## Test bootc image configuration without VM
	@echo "$(GREEN)Testing bootc image configuration...$(NC)"
	@echo "$(BLUE)1. Checking logically bound images:$(NC)"
	@podman run --rm localhost/$(IMAGE_NAME):$(IMAGE_TAG) ls -la /usr/lib/bootc/bound-images.d/ || echo "$(RED)❌ Failed$(NC)"
	@echo ""
	@echo "$(BLUE)2. Verifying RHDH image reference:$(NC)"
	@podman run --rm localhost/$(IMAGE_NAME):$(IMAGE_TAG) cat /usr/share/containers/systemd/rhdh.image || echo "$(RED)❌ Failed$(NC)"
	@echo ""
	@echo "$(BLUE)3. Testing QCOW2 image:$(NC)"
	@if [ -f $(QUADLET_DIR)/output/qcow2/disk.qcow2 ]; then \
		echo "$(GREEN)✅ QCOW2 exists: $$(stat -c%s $(QUADLET_DIR)/output/qcow2/disk.qcow2 | numfmt --to=iec)$(NC)"; \
	else \
		echo "$(RED)❌ QCOW2 not found$(NC)"; \
	fi
	@echo ""
	@echo "$(GREEN)✅ Image ready for deployment!$(NC)"

# PostgreSQL Database Management
postgres-setup: ## Setup PostgreSQL data directory and permissions
	@echo "$(GREEN)Setting up PostgreSQL data directory...$(NC)"
	@sudo mkdir -p /var/lib/rhdh/postgres-data
	@sudo chown 26:26 /var/lib/rhdh/postgres-data  # PostgreSQL UID/GID
	@sudo chmod 700 /var/lib/rhdh/postgres-data
	@echo "$(GREEN)✅ PostgreSQL data directory created at /var/lib/rhdh/postgres-data$(NC)"

postgres-start: postgres-setup ## Start PostgreSQL container service
	@echo "$(GREEN)Starting PostgreSQL container service...$(NC)"
	@sudo cp postgres.container /etc/containers/systemd/
	@sudo cp postgres.env /etc/rhdh/ || true
	@sudo systemctl daemon-reload
	@sudo systemctl start postgres.service
	@sudo systemctl enable postgres.service
	@echo "$(GREEN)✅ PostgreSQL service started and enabled$(NC)"

postgres-stop: ## Stop PostgreSQL container service
	@echo "$(GREEN)Stopping PostgreSQL container service...$(NC)"
	@sudo systemctl stop postgres.service 2>/dev/null || echo "$(YELLOW)Service was not running$(NC)"
	@echo "$(GREEN)✅ PostgreSQL service stopped$(NC)"

postgres-status: ## Check PostgreSQL container status
	@echo "$(GREEN)PostgreSQL Service Status:$(NC)"
	@sudo systemctl status postgres.service --no-pager -l || echo "$(YELLOW)Service not found$(NC)"
	@echo ""
	@echo "$(GREEN)PostgreSQL Container Status:$(NC)"
	@podman ps -a | grep rhdh-postgres || echo "$(YELLOW)Container not found$(NC)"
	@echo ""
	@echo "$(GREEN)PostgreSQL Health Check:$(NC)"
	@podman exec rhdh-postgres pg_isready -U rhdh_user 2>/dev/null || echo "$(YELLOW)Database not ready or container not running$(NC)"

postgres-logs: ## Show PostgreSQL container logs
	@echo "$(GREEN)PostgreSQL Container Logs:$(NC)"
	@podman logs rhdh-postgres --tail 50 2>/dev/null || echo "$(YELLOW)Container not running$(NC)"

postgres-connect: ## Connect to PostgreSQL database
	@echo "$(GREEN)Connecting to PostgreSQL database...$(NC)"
	@echo "$(YELLOW)Use password: secure_rhdh_password_123$(NC)"
	@podman exec -it rhdh-postgres psql -U rhdh_user -d rhdh_backstage

postgres-destroy: ## Stop and remove PostgreSQL container and data
	@echo "$(GREEN)Destroying PostgreSQL setup...$(NC)"
	@$(MAKE) postgres-stop
	@sudo systemctl disable postgres.service 2>/dev/null || true
	@sudo rm -f /etc/containers/systemd/postgres.container
	@sudo systemctl daemon-reload
	@podman rm -f rhdh-postgres 2>/dev/null || true
	@echo "$(YELLOW)⚠️  PostgreSQL data directory preserved at /var/lib/rhdh/postgres-data$(NC)"
	@echo "$(YELLOW)⚠️  To completely remove data: sudo rm -rf /var/lib/rhdh/postgres-data$(NC)"
	@echo "$(GREEN)✅ PostgreSQL container destroyed$(NC)"
