# RHDH Ansible Bootc Container

Red Hat Developer Hub with Ansible Self-Service Portal running on RHEL 10 Image Mode (bootc).

This project creates a RHEL 10 bootc-based container image that layers RHDH on top with Ansible plugins and sets up systemd integration for a complete developer portal experience.

Note: This `image_mode` directory is the root for the bootc container build. Run all `make` commands from within this folder.

## 🚀 Quick Start

### Prerequisites

- **Podman** v5.4.1 or newer
- **Internet connection** for downloading container images
- **8GB+ RAM** recommended for optimal performance
- **x86_64 or arm64** architecture

### Deployment Options

#### Option 1: Container Deployment (Recommended)

1. **Complete container deployment:**
   ```bash
   make deploy-container
   ```

2. **Access RHDH:**
   - Open [http://localhost:7007](http://localhost:7007) in your browser
   - Wait 1-2 minutes for all services to initialize
   - Login with your AAP credentials

#### Option 2: VM Deployment (QCOW2)

1. **Complete VM deployment:**
   ```bash
   make deploy-vm
   ```

2. **Start the VM:**
   ```bash
   make -f MAC-VM-Makefile vm-start
   ```

3. **Access RHDH:**
   - Wait 3-5 minutes for VM to boot and services to start
   - Open [http://localhost:7007](http://localhost:7007) in your browser
   - Open [http://localhost:8008](http://localhost:8008) in your browser
   - VM console login: `admin:admin123` or `root:root123`
   - SSH access: `ssh -p 2225 admin@localhost`

## 📋 Available Commands

### Basic Operations
```bash
make build          # Build the container image
make start          # Start the container
make stop           # Stop the container
make status         # Show container and service status
make health         # Run health check
```

### Maintenance
```bash
make clean          # Stop and remove container
make clean-output   # Remove bootc image output directories
make shell          # Open a shell inside the running container
make service-logs   # Show RHDH systemd service logs inside the container
make service-status # Show rhdh systemd service status inside the container
make service-logs-live # Follow rhdh service logs live (Ctrl+C to stop)
```

### Advanced Operations
```bash
# Registry Operations
make login          # Login to Quay.io registry
make push           # Push image to registry
make publish        # Build and push to registry

# Image Generation
make qcow2-macos    # Create ARM64 QCOW2 for macOS
make qcow2          # Create x86_64 QCOW2 for general use
make ami            # Create AWS AMI
make iso            # Create ISO installer

# Complete Workflows
make deploy-container # Complete container deployment
make deploy-vm       # Complete VM deployment
make test-container  # Test container deployment
make test-vm         # Test VM deployment
```

## 🔧 Configuration

### Environment Variables

The container uses environment variables defined in `default.env`:

```bash
# Key Configuration
BASE_URL=http://localhost:7007
AAP_HOST_URL=https://your-aap-instance.com
AAP_TOKEN=your-aap-token
OAUTH_CLIENT_ID=your-oauth-client-id
OAUTH_CLIENT_SECRET=your-oauth-client-secret
ENABLE_AUTH_PROVIDER_MODULE_OVERRIDE=true

# Optional Configuration
LOG_LEVEL=debug
NODE_TLS_REJECT_UNAUTHORIZED=0
BACKEND_SECRET=your-backend-secret-key-here-must-be-set
```

### Customization

1. **Update Environment Variables:**
   ```bash
   # Edit the default environment file
   vim default.env
   
   # Rebuild and restart
   make clean && make build && make start
   ```

2. **Modify App Configuration:**
   ```bash
   # Edit the main app config
   vim configs/app-config/app-config.yaml
   
   # Rebuild and restart
   make clean && make build && make start
   ```

3. **Update Dynamic Plugins:**
   ```bash
   # Edit plugin configuration
   vim configs/dynamic-plugins/dynamic-plugins.override.yaml
   
   # Rebuild and restart
   make clean && make build && make start
   ```

## 🏗️ Architecture

### Container Structure

```
/opt/app-root/src/                    # Main RHDH application
├── dynamic-plugins-root/             # Dynamic plugins directory (real directory)
├── configs/                          # Configuration files (symlink to /etc/rhdh/configs)
├── local-plugins/                    # Local Ansible plugins (symlink to /var/lib/rhdh/local-plugins)
└── default.env                       # Environment variables (symlink to /etc/rhdh/default.env)

/etc/rhdh/                            # Immutable configuration area
├── configs/                          # App and plugin configurations
├── default.env                       # Environment variables
└── ...

/var/lib/rhdh/                        # Variable data area
├── local-plugins/                    # Ansible plugin packages
└── ...
```

### Key Features

- ✅ **RHEL 10 bootc base** for immutable infrastructure
- ✅ **Systemd integration** with automatic service management
- ✅ **Dynamic plugin support** with proper directory handling
- ✅ **Ansible Self-Service Portal** with all plugins
- ✅ **Environment-based configuration** for easy customization
- ✅ **Health monitoring** and logging integration

## 🔍 Troubleshooting

### Common Issues

#### 1. Container Won't Start
```bash
# Check container status
make status
```

#### 2. RHDH Not Responding
```bash
# Run health check
make health

# Check if service is running
make status
```

#### 3. Authentication or Plugin Issues
- Verify your environment variables in `default.env`
- Verify app config in `configs/app-config/app-config.yaml`
  - Ensure auth and dynamic plugins sections are correctly set

### Debugging
- Check container logs: `podman logs -f rhdh-ansible-portal`
- Inspect container: `podman exec -it rhdh-ansible-portal bash`

## 🧪 Testing

### Health Checks

The container includes a health endpoint:

```bash
# Quick health check
make health
```

### Verification Steps

1. **Service Status:**
   ```bash
   make status
   # Should show: Active: active (running)
   ```

2. **Web Interface:**
   ```bash
   curl -s http://localhost:7007 | head -5
   # Should return HTML content
   ```

3. **Self-Service Portal:**
   ```bash
   curl -s http://localhost:7007/self-service
   # Should return portal content
   ```

## 🔄 Development Workflow

### Making Changes

1. **Modify configuration files** in this folder: `configs/`, `local-plugins/`, and `default.env`
2. **Rebuild and restart:**
   ```bash
   make clean
   make build
   make start
   ```
3. **Test changes:**
   ```bash
   make health
   ```

### Adding New Plugins

1. **Add plugin packages** to `local-plugins/`
2. **Update plugin configuration** in `configs/dynamic-plugins/dynamic-plugins.override.yaml`
3. **Rebuild:**
   ```bash
   make clean && make build && make start
   ```

## 📊 Monitoring

### Real-time Monitoring
```bash
# Monitor container status
watch make status

# Check resource usage
podman stats $(CONTAINER_NAME)
```

### Log Locations

- **Container logs:** `podman logs rhdh-ansible-portal`
- **Service logs:** `journalctl -u rhdh` (inside container)
- **Application logs:** Streamed to systemd journal

## 🧹 Cleanup

### Remove Everything
```bash
# Stop and remove container
make clean

# Remove all images
make remove-images

# Complete cleanup
make clean remove-images
```

### Reset to Clean State
```bash
# Remove container and rebuild from scratch
make clean && make build && make start
```

## 🆘 Support

### Getting Help

1. **Check this README** for common solutions
2. **Run debug command:** `make debug`
3. **Check logs:** `make service-logs`
4. **Verify configuration:** `make check-env`

### Reporting Issues

When reporting issues, please include:

1. **Debug output:** `make debug > debug.log`
2. **Environment info:** `make check-env`
3. **Service logs:** `make service-logs`
4. **Steps to reproduce** the issue

## 🚀 Advanced Deployment

### Publishing to Quay.io Registry

1. **Login to Quay.io:**
   ```bash
   make login
   ```

2. **Tag and push the image:**
   ```bash
   make push
   ```

3. **Complete build and push workflow:**
   ```bash
   make publish
   ```

### Creating Bootable Disk Images

Based on the [RHEL 10 Image Mode documentation](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/10/html/using_image_mode_for_rhel_to_build_deploy_and_manage_operating_systems/building-and-testing-rhel-bootc-images), you can create various disk image formats for different deployment scenarios:

#### Available Image Types

```bash
# List all supported image types
make list-image-types
```

#### Create Specific Image Types

**Virtualization Images:**
```bash
make qcow2          # QEMU/KVM disk image (for libvirt, OpenStack)
make vmdk           # VMware disk image (for vSphere, Workstation)
make vhd            # Hyper-V disk image (for Microsoft Azure)
make raw            # Raw disk image (for dd, bare metal)
```

**Cloud Images:**
```bash
make ami            # Amazon Machine Image (for AWS EC2)
make gce            # Google Compute Engine image
```

**Installation Images:**
```bash
make iso            # ISO installer image (for bare metal, PXE boot)
make anaconda-iso   # Anaconda-based ISO installer
```

#### Complete Deployment Workflow

```bash
# Build, push to registry, and create QCOW2 in one command
make deploy-qcow2
```

### Deploying the QCOW2 Image

```bash
# The QCOW2 image will be in output/ (x86_64) or output-macos/ (ARM64) directory
ls -la output/ output-macos/

# Deploy with virt-install (example)
sudo virt-install \
  --name rhdh-ansible-portal \
  --memory 4096 \
  --vcpus 2 \
  --disk path=output/qcow2/disk.qcow2,format=qcow2 \
  --import \
  --os-variant rhel10 \
  --network default
```

### Registry Image Details

- **Registry:** `quay.io/rhn_support_gnalawad/rhdh-ansible-bootc:v1`
- **Size:** ~6.37 GB
- **Base:** RHEL 10 bootc with RHDH 1.7 and Ansible plugins
- **Features:** Dynamic plugins, systemd integration, immutable infrastructure

## 📝 Important Notes

### Container Deployment
- **Startup time:** 1-2 minutes for full initialization
- **Access:** `http://localhost:7007`
- **Memory:** ~800MB-1GB during operation

### VM Deployment  
- **Startup time:** 3-5 minutes for complete boot and service initialization
- **Access:** `http://localhost:8008`
- **SSH:** `ssh -p 2225 admin@localhost` (password: `admin123`)
- **Console:** Login as `admin:admin123` or `root:root123`

### General
- **Security:** Uses development settings; not suitable for production
- **Persistence:** Container state is ephemeral; VM state persists

## 🔗 Related Documentation

- [RHDH Documentation](https://docs.redhat.com/en/documentation/red_hat_developer_hub)
- [Ansible Automation Platform](https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform)
- [RHEL Image Mode (bootc)](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/composing_installing_and_managing_rhel_for_edge_images)
- [Backstage Dynamic Plugins](https://backstage.io/docs/plugins/dynamic-plugins)

---

**Built with ❤️ for the Ansible and RHDH communities**
