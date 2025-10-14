# RHDH Quadlet Architecture

This document explains the architectural design and technical details of the RHDH Quadlet deployment approach.

## Why Superuser Access is Required

This deployment uses **Podman Quadlet** and **bootc** technologies that operate at the **system level**:

### System-Level Operations

#### bootc-image-builder
- **Disk Image Creation**: Requires privileged access to create QCOW2/ISO disk images
- **Loop Device Management**: Needs to create and manage loop devices for disk operations
- **Filesystem Operations**: Must perform privileged filesystem operations during image creation
- **Container Storage Access**: Accesses rootful container storage at `/var/lib/containers/storage`

#### Quadlet Installation
- **System Service Files**: Service files must be installed in `/usr/share/containers/systemd/` (system directory)
- **systemd Integration**: Generates systemd services that run as system services, not user services
- **Service Dependencies**: Creates proper systemd dependencies between containers and network services

#### bootc Storage Management
- **Logically Bound Images**: Managed in `/usr/lib/bootc/storage` (system storage location)
- **Automatic Image Pulling**: bootc pulls and manages container images at the system level
- **Image Lifecycle**: System-level container image lifecycle management via bootc upgrade

#### VM Management (libvirt)
- **Network Management**: Creating and managing virtual networks requires system privileges
- **Storage Management**: VM disk image creation and management needs system access
- **Hypervisor Control**: KVM/QEMU virtualization requires system-level access

### Architecture Benefits

#### System Integration
- **Native systemd Services**: Containers run as proper systemd units with full dependency management
- **Service Ordering**: Proper startup ordering between network, database, and application services
- **Resource Management**: System-level resource controls and limits via systemd

#### Image Management
- **Atomic Updates**: bootc handles container image updates atomically at the system level
- **Automatic Discovery**: Logically bound images are automatically discovered and managed
- **Storage Efficiency**: Shared container image layers across system deployments

#### Security Model
- **Proper Isolation**: Clear separation between system services and user processes
- **Service Boundaries**: Each container runs in its own systemd service boundary
- **Network Isolation**: Dedicated container network with proper firewall integration

#### Persistence and Updates
- **Configuration Persistence**: System configuration survives bootc upgrades
- **Data Persistence**: Database and application data preserved across system updates
- **Rollback Support**: System-level rollback capabilities for both OS and container images

## Container Architecture

### Service Layout
```
┌─────────────────────────────────────────────────────────────┐
│                    RHEL 9 bootc System                     │
├─────────────────────────────────────────────────────────────┤
│                     systemd Services                       │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────┐ │
│  │ rhdh-network-   │  │   postgres.      │  │   rhdh.     │ │
│  │ network.service │  │   service        │  │   service   │ │
│  └─────────────────┘  └──────────────────┘  └─────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                   Container Network                         │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                  rhdh-network                           │ │
│  │  ┌──────────────────┐         ┌─────────────────────┐   │ │
│  │  │  rhdh-postgres   │◄────────┤       rhdh          │   │ │
│  │  │  (PostgreSQL)    │         │  (RHDH Application) │   │ │
│  │  │  Port: 5432      │         │  Port: 7007         │   │ │
│  │  └──────────────────┘         └─────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                 Persistent Storage                          │
│  ┌──────────────────┐         ┌─────────────────────────┐   │
│  │  postgres-data   │         │  Host Path Mounts       │   │
│  │  (Named Volume)  │         │  • /etc/rhdh/configs    │   │
│  │                  │         │  • /var/lib/rhdh/*      │   │
│  └──────────────────┘         └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Logically Bound Images
```
┌─────────────────────────────────────────────────────────────┐
│                 bootc Image Structure                       │
├─────────────────────────────────────────────────────────────┤
│  /usr/lib/bootc/bound-images.d/                            │
│  ├── rhdh.container        → RHDH application image        │
│  └── postgres.container    → PostgreSQL database image     │
├─────────────────────────────────────────────────────────────┤
│  /usr/lib/bootc/storage/    (bootc-managed image storage)  │
│  ├── registry.redhat.io/rhdh/rhdh-hub-rhel9:1.6           │
│  └── registry.redhat.io/rhel9/postgresql-15:latest         │
├─────────────────────────────────────────────────────────────┤
│  /usr/share/containers/systemd/                            │
│  ├── rhdh.container        (Quadlet service definition)    │
│  ├── postgres.container    (Quadlet service definition)    │
│  └── rhdh-network.network  (Quadlet network definition)    │
└─────────────────────────────────────────────────────────────┘
```

## Deployment Process

### Build Phase
1. **bootc Image Creation**: Creates RHEL 9 base image with Quadlet configurations
2. **Configuration Embedding**: Embeds service definitions and configuration files
3. **Bound Image References**: Creates symlinks for logically bound container images

### Disk Image Creation
1. **bootc-image-builder**: Converts bootc image to QCOW2/ISO disk image
2. **Image Discovery**: Automatically discovers logically bound images
3. **Storage Preparation**: Prepares bootc storage with container images

### VM Boot Sequence
1. **System Boot**: RHEL 9 boots from disk image
2. **bootc Initialization**: bootc initializes with bound images
3. **Quadlet Processing**: systemd processes Quadlet service definitions
4. **Service Startup**: Services start in dependency order:
   - `rhdh-network-network.service` (network)
   - `postgres.service` (database)
   - `rhdh.service` (application)

### Runtime Behavior
1. **Container Management**: Podman manages containers via systemd
2. **Network Communication**: Containers communicate via isolated network
3. **Data Persistence**: PostgreSQL data persists in named volume
4. **Health Monitoring**: systemd monitors container health and restarts as needed

## Comparison with Other Approaches

### vs. Traditional Container Deployment
| Aspect | Traditional Containers | Quadlet + bootc |
|--------|----------------------|-----------------|
| **Service Management** | Manual container management | Native systemd integration |
| **Updates** | Manual image pulls | Atomic bootc upgrades |
| **Dependencies** | Manual orchestration | systemd dependency management |
| **Persistence** | Manual volume management | System-integrated storage |
| **Rollback** | Manual process | Automatic bootc rollback |

### vs. Kubernetes/Podman Compose
| Aspect | K8s/Compose | Quadlet + bootc |
|--------|-------------|-----------------|
| **Complexity** | Additional orchestration layer | Native OS integration |
| **Resource Usage** | Higher overhead | Minimal system overhead |
| **Boot Integration** | Separate from OS boot | Integrated with OS boot |
| **System Updates** | Separate from container updates | Unified update mechanism |

## Registry Operations

### Image Publishing Workflow

The Makefile supports publishing bootc images to container registries for sharing and distribution:

```bash
# Complete workflow
make publish  # Builds image with registry tagging and pushes

# Step-by-step process
make login    # Authenticate to registry (default: quay.io)
make build    # Build with registry tagging  
make push     # Push to registry
```

### Registry Configuration

**Default Configuration**:
- **Registry**: `quay.io` (configurable)
- **Namespace**: `audgirka` (configurable)
- **Image Name**: `rhdh-bootc-quadlet`
- **Tag**: `latest`

**Customization**: Edit Makefile variables:
```makefile
REGISTRY := your-registry.com    # Any OCI-compatible registry
NAMESPACE := your-org           # Organization or username
```

### Deployment Strategies

#### Local Development
```bash
make deploy-vm-local    # Uses locally built image
```

#### Registry-Based Deployment
```bash
make deploy-vm-registry # Pulls from registry, creates VM
```

#### CI/CD Integration
```bash
# In CI pipeline
make login                    # Authenticate with service account
make publish                  # Build and push
make deploy-vm-registry       # Deploy from registry
```

### Use Cases

#### Team Collaboration
- **Share Images**: Team members pull pre-built bootc images
- **Consistent Environments**: Same image across dev/test/prod
- **Version Control**: Tagged images for different releases

#### Enterprise Deployment
- **Private Registries**: Use corporate container registries
- **Access Control**: Registry-based authentication and authorization
- **Compliance**: Signed and scanned images

#### CI/CD Pipelines
- **Automated Builds**: CI systems build and push images
- **Deployment Automation**: Pull images for automated deployments
- **Multi-Environment**: Different registries for different environments

### Registry Authentication

Since bootc images contain authentication for Red Hat Registry, published images include:
- **Embedded auth.json**: For VM upgrade operations
- **Base Image References**: Logically bound images pulled during deployment
- **Service Definitions**: Quadlet configurations embedded in image

**Security Consideration**: The embedded `auth.json` should use service accounts with minimal required permissions.

## PostgreSQL Architecture

Our PostgreSQL setup aligns with [RHDH's official external PostgreSQL configuration guide](https://docs.redhat.com/en/documentation/red_hat_developer_hub/1.6/html/configuring_red_hat_developer_hub/configuring-external-postgresql-databases). However, instead of using Kubernetes/OpenShift, we deploy PostgreSQL as a containerized service via Podman Quadlet.

**Key Differences from Standard RHDH Setup**:
- **Deployment Method**: Quadlet containers instead of Kubernetes pods  
- **Image Management**: Logically bound images via bootc instead of registry pulls
- **Service Management**: systemd services instead of Kubernetes services
- **Database Creation**: RHDH automatically creates plugin databases as needed

## Red Hat Registry Authentication

This deployment requires authenticated access to `registry.redhat.io` for the following images:
- `registry.redhat.io/rhel9/rhel-bootc:latest` (base bootc image)
- `registry.redhat.io/rhdh/rhdh-hub-rhel9:1.6` (RHDH application)
- `registry.redhat.io/rhel9/postgresql-15:latest` (PostgreSQL database)
- `registry.redhat.io/rhel9/bootc-image-builder` (image builder tool)

### Authentication Methods

#### Interactive Authentication
```bash
# Root authentication (REQUIRED - bootc-image-builder runs as root)
sudo podman login registry.redhat.io

# User authentication (optional, for convenience)
podman login registry.redhat.io
```

#### Service Account Authentication
For CI/CD pipelines and automated deployments:

1. **Create Registry Service Account**:
   - Go to [Red Hat Registry Service Accounts](https://access.redhat.com/terms-based-registry/)
   - Create a new service account
   - Download the credentials

2. **Authenticate with Service Account**:
   ```bash
   # Root level (REQUIRED - bootc-image-builder runs as root)
   sudo podman login registry.redhat.io --username="your-service-account" --password="your-token"
   
   # User level (optional, for convenience)
   podman login registry.redhat.io --username="your-service-account" --password="your-token"
   ```

#### Container Auth File Method
For pre-configured deployments:

```bash
# Copy auth file to system location
sudo mkdir -p /etc/containers
sudo cp ~/.config/containers/auth.json /etc/containers/auth.json

# Or set REGISTRY_AUTH_FILE environment variable
export REGISTRY_AUTH_FILE=/path/to/auth.json
```

#### Embedded Auth File (bootc Image)
The bootc image includes an embedded `auth.json` file for VM upgrade support:

**Location in bootc image**: `/etc/containers/auth.json`

**Purpose**: Enables `bootc upgrade` to pull updated container images without manual authentication

**Setup**: Update `image_mode/auth.json` before building:
```bash
# Method 1: Copy existing authentication
cp ~/.config/containers/auth.json /path/to/image_mode/auth.json

# Method 2: Create from credentials
echo '{
  "auths": {
    "registry.redhat.io": {
      "auth": "'$(echo -n "username:password" | base64 -w 0)'"
    }
  }
}' > /path/to/image_mode/auth.json

# Method 3: Use podman to generate
podman login registry.redhat.io
cp ~/.config/containers/auth.json /path/to/image_mode/auth.json
```

**Containerfile Integration**:
```dockerfile
# Copy registry authentication for bootc upgrade support
COPY ./auth.json /etc/containers/auth.json
```

### Authentication Storage Locations

#### User Authentication
- **Config Location**: `~/.config/containers/auth.json`
- **Used By**: Regular podman commands, user-level image operations

#### Root Authentication  
- **Config Location**: `/root/.config/containers/auth.json`
- **Used By**: `sudo podman` commands, bootc-image-builder, system operations

#### Embedded Authentication (bootc Image)
- **Build Location**: `image_mode/auth.json` (source file)
- **Runtime Location**: `/etc/containers/auth.json` (in bootc image)
- **Used By**: bootc upgrade operations, VM container image pulls

### Common Authentication Issues

#### Missing Root Authentication
**Problem**: Users authenticate only at user level, causing `bootc-image-builder` to fail with authentication errors.

**Solution**: **Root authentication is mandatory** for image building:
```bash
sudo podman login registry.redhat.io     # REQUIRED for bootc-image-builder
podman login registry.redhat.io          # Optional for user convenience
```

**Why**: `bootc-image-builder` runs as root and requires rootful podman access to pull base images and create disk images.

#### Token Expiration
**Problem**: Registry tokens expire, causing intermittent failures.

**Solution**: Set up token refresh or use longer-lived service accounts:
```bash
# Check current authentication
podman login registry.redhat.io --get-login
sudo podman login registry.redhat.io --get-login

# Re-authenticate if needed
podman login registry.redhat.io
sudo podman login registry.redhat.io
```

#### Network Connectivity
**Problem**: Corporate firewalls or proxies block registry access.

**Solution**: Configure proxy settings:
```bash
# Set proxy for podman
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080

# Or configure in containers.conf
sudo mkdir -p /etc/containers
echo '[engine]
proxy_env = ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"]' | sudo tee -a /etc/containers/containers.conf
```

### Verification Commands

#### Test Registry Access
```bash
# Test root-level access (CRITICAL - this is what bootc-image-builder uses)
sudo podman pull registry.redhat.io/rhel9/rhel-bootc:latest --quiet
echo "Root auth (required): $?"

# Test user-level access (optional)
podman pull registry.redhat.io/rhel9/rhel-bootc:latest --quiet
echo "User auth (optional): $?"

# Clean up test images
podman rmi registry.redhat.io/rhel9/rhel-bootc:latest 2>/dev/null
sudo podman rmi registry.redhat.io/rhel9/rhel-bootc:latest 2>/dev/null
```

#### Check Authentication Status
```bash
# Check root authentication (CRITICAL for bootc-image-builder)
sudo podman login registry.redhat.io --get-login 2>/dev/null && echo "Root: ✅ Authenticated (REQUIRED)" || echo "Root: ❌ Not authenticated (BUILD WILL FAIL)"

# Check user authentication (optional)
podman login registry.redhat.io --get-login 2>/dev/null && echo "User: ✅ Authenticated (optional)" || echo "User: ❌ Not authenticated (optional)"
```

## Security Considerations

### Isolation Model
- **Container Isolation**: Each service runs in separate container with resource limits
- **Network Isolation**: Dedicated container network isolated from host network
- **Storage Isolation**: Separate storage volumes with proper SELinux contexts

### Privilege Model
- **System Services**: Run as system services with minimal required privileges
- **Container Security**: SecurityLabelDisable only where necessary for compatibility
- **File Permissions**: Proper ownership and permissions for all mounted paths

### Update Security
- **Atomic Updates**: All updates applied atomically via bootc
- **Signed Images**: Support for signed container images
- **Rollback Capability**: Automatic rollback on update failures

## Performance Characteristics

### Startup Performance
- **System Boot**: ~30-60 seconds for complete system boot
- **Service Initialization**: ~2-3 minutes for all services to be ready
- **First Access**: Additional 30-60 seconds for application warmup

### Runtime Performance
- **Memory Usage**: ~1.5GB total (1GB RHDH, 500MB PostgreSQL)
- **CPU Usage**: Minimal when idle, scales with load
- **Network Latency**: Near-native performance via container networking

### Storage Performance
- **Database**: Native filesystem performance via named volumes
- **Application**: Efficient layered filesystem via container images
- **Updates**: Minimal downtime via atomic bootc upgrades

---

This architecture provides a production-ready, secure, and maintainable deployment model that combines the benefits of containerization with native OS integration.
