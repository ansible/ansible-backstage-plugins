# RHDH Quadlet Deployment

Red Hat Developer Hub with PostgreSQL database using Podman Quadlet and RHEL 9 bootc.

## Overview

This deployment approach uses **logically bound images** with Podman Quadlet for:
- **Automatic image management** via bootc
- **Native systemd integration** for container services  
- **Atomic updates** for both system and applications
- **PostgreSQL database** for persistent data storage

## Quick Start

### Prerequisites
- **Podman** v5.4.1+ with rootful access (`sudo`)
- **Red Hat Registry** authentication (see Authentication section below)
- **8GB+ RAM** and network connectivity

### Red Hat Registry Authentication

This deployment requires images from `registry.redhat.io`. Authentication is needed at **two levels**:

#### 1. Superuser Authentication (Required for Building)
```bash
# REQUIRED: Authenticate as root for bootc-image-builder
sudo podman login registry.redhat.io

# Also authenticate as user for convenience
podman login registry.redhat.io
```

#### 2. Embedded Auth File (Required for VM Upgrades)
Update the embedded `auth.json` file before building:

```bash
# Option A: Copy root's auth.json (after sudo podman login)
sudo cp /root/.config/containers/auth.json ../auth.json

# Option B: Create auth.json manually with your credentials
cat > ../auth.json << 'EOF'
{
    "auths": {
        "registry.redhat.io": {
            "auth": "BASE64_ENCODED_CREDENTIALS"
        }
    }
}
EOF
```

#### Service Account Method (CI/CD)
```bash
# REQUIRED: Authenticate as root with service account (for bootc-image-builder)
sudo podman login registry.redhat.io --username="your-service-account" --password="your-token"

# Also authenticate as user for convenience
podman login registry.redhat.io --username="your-service-account" --password="your-token"

# Update embedded auth.json with service account credentials
echo '{"auths":{"registry.redhat.io":{"auth":"'$(echo -n "your-service-account:your-token" | base64 -w 0)'"}}}' > ../auth.json
```

#### Verify Authentication
```bash
# Test access to required images (must use sudo - same as bootc-image-builder)
sudo podman pull registry.redhat.io/rhel9/rhel-bootc:latest --quiet && echo "✅ Root registry access confirmed"
```

> **⚠️ Critical**: `bootc-image-builder` runs as **root**, so `sudo podman login` is **required** for building. The embedded `auth.json` enables VM upgrade operations without manual authentication.

### Superuser Access Required

This deployment uses **Podman Quadlet** and **bootc** for system-level container management. Most commands require `sudo` because they interact with system-level container and virtualization infrastructure.

> **📖 Architecture Details**: For complete technical details about why superuser access is required and the architectural benefits, see [Architecture Guide](ARCHITECTURE.md)

### Deploy VM with PostgreSQL

```bash
# Complete deployment (builds bootc image + creates VM)
make deploy-vm-local

# Monitor deployment
make vm-status

# Access RHDH (after 3-5 minutes)
# Open http://VM-IP:7007 in browser
# SSH: ssh admin@VM-IP (password: admin123)
```

## Available Commands

### Complete Workflows
```bash
make deploy-vm-local    # Complete local development deployment workflow  
make deploy-vm-registry # Complete registry-based deployment workflow
```

### Build and Image Creation
```bash
make build-local        # Build bootc image locally using build-quadlet.sh
make qcow2-local        # Create QCOW2 from local image (requires sudo/root)
make validate           # Validate Quadlet configuration files
```

### VM Management
```bash
make vm-create-local    # Create VM from local QCOW2 (requires libvirt)
make vm-start           # Start VM
make vm-stop            # Stop VM gracefully
make vm-status          # Show VM status and info
make vm-ip              # Get VM IP address
make vm-destroy-local   # Destroy local VM and cleanup
```

### Testing and Validation
```bash
make test-vm            # Test RHDH in VM (requires VM to be running)
make info               # Show configuration and status
```

### Image Management
```bash
make pull-all-images    # Check and pull all container images used in quadlet setup
make list-quadlet-images # List all container images used in the quadlet setup
make check-image-status # Check availability status of all quadlet images
```

### PostgreSQL Management
```bash
make postgres-setup     # Setup PostgreSQL data directory and permissions
make postgres-start     # Start PostgreSQL container service
make postgres-stop      # Stop PostgreSQL container service
make postgres-status    # Check PostgreSQL container status
make postgres-logs      # Show PostgreSQL container logs
make postgres-connect   # Connect to PostgreSQL database
make postgres-destroy   # Stop and remove PostgreSQL container and data
```

### Cleanup
```bash
make clean              # Clean up images and temporary files
make clean-outputs      # Clean output directories
make clean-all          # Complete cleanup including VM
```

## Architecture

### Container Services
- **RHDH**: `registry.redhat.io/rhdh/rhdh-hub-rhel9:1.6` (container: `rhdh`)
- **PostgreSQL**: `registry.redhat.io/rhel9/postgresql-15:latest` (container: `rhdh-postgres`)
- **Network**: `rhdh-network` (isolated bridge network)
- **PostgreSQL Storage**: Named volume `postgres-data` mounted to `/var/lib/pgsql/data`
- **RHDH Storage**: Multiple host paths mounted for configuration and plugins

### Key Files
- `Containerfile.rhdh-bootc-quadlet` - Bootc image definition
- `rhdh.container` - RHDH service configuration (creates `rhdh.service`)
- `postgres.container` - PostgreSQL service configuration (creates `postgres.service`)
- `rhdh-network.network` - Network definition (creates `rhdh-network-network.service`)
- `rhdh.env` - Environment variables
- `config.toml` - Disk configuration for VM

### Generated Services
When deployed, Quadlet automatically creates these systemd services:
- `rhdh.service` - RHDH application container
- `postgres.service` - PostgreSQL database container  
- `rhdh-network-network.service` - Isolated network for containers

### Logically Bound Images
Images are **referenced** (not copied) in the bootc image:
- Automatically pulled by bootc during deployment
- Stored in `/usr/lib/bootc/storage`
- Updated atomically via `bootc upgrade`

## Configuration

### Environment Variables
Edit `rhdh.env` for RHDH configuration:

```bash
# Core Configuration
BASE_URL=http://localhost:7007  # Auto-detected at startup
AAP_HOST_URL=https://your-aap-instance.com
AAP_TOKEN=your-aap-token
OAUTH_CLIENT_ID=your-oauth-client-id
OAUTH_CLIENT_SECRET=your-oauth-client-secret
BACKEND_SECRET=your-backend-secret-key-here-must-be-set

# PostgreSQL Database Connection (connects to rhdh-postgres container)
POSTGRES_HOST=rhdh-postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=secure_admin_password_123
POSTGRES_DB=rhdh_backstage
```

### PostgreSQL Configuration
PostgreSQL container uses inline environment variables in `postgres.container`:

```bash
# PostgreSQL Red Hat format (in postgres.container file)
POSTGRESQL_DATABASE=rhdh_backstage
POSTGRESQL_USER=rhdh_user
POSTGRESQL_PASSWORD=secure_rhdh_password_123
POSTGRESQL_ADMIN_PASSWORD=secure_admin_password_123
```

**Important**: RHDH connects as `postgres` superuser, PostgreSQL creates `rhdh_user` for application use.

### Database Configuration
PostgreSQL is configured by default. For external databases or advanced setup:
- **[PostgreSQL Setup Guide](EXTERNAL-POSTGRES-SETUP.md)** - External database configuration
- **[RHDH PostgreSQL Docs](https://docs.redhat.com/en/documentation/red_hat_developer_hub/1.6/html/configuring_red_hat_developer_hub/configuring-external-postgresql-databases)** - Official RHDH PostgreSQL configuration guide

### Network Configuration
VM automatically detects IP address and configures CORS settings. Manual override:
```bash
BASE_URL=http://specific-ip:7007
```

## Deployment Process

1. **Image Build**: Creates bootc image with Quadlet definitions
2. **VM Creation**: Converts bootc image to QCOW2 disk image
3. **Service Startup**: Systemd starts postgres.service and rhdh.service
4. **Image Management**: bootc automatically manages bound images

## Troubleshooting

### Quick Diagnostics
```bash
# Check VM status and get IP
make vm-status

# Get VM IP address
make vm-ip

# Validate configuration
make validate

# Test RHDH accessibility
make test-vm
```

### Common Issues

| Issue | Solution |
|-------|----------|
| **Authentication failed** | Run both `podman login registry.redhat.io` and `sudo podman login registry.redhat.io` |
| **Image pull fails** | Verify registry access: See Authentication section above |
| **Build fails** | Check rootful podman: `sudo podman version` |
| **Permission denied** | Use `sudo` - Quadlet/bootc requires system-level access |
| **VM won't start** | Check VM resources: `make vm-status` |
| **RHDH not accessible** | Wait 3-5 minutes, check `make test-vm` |
| **Database errors** | See [PostgreSQL Setup Guide](EXTERNAL-POSTGRES-SETUP.md#troubleshooting) |

### Service Debugging
```bash
# Get VM IP address
make vm-ip

# SSH into VM (use IP from above command)
ssh admin@VM-IP

# Check service status (on VM)
sudo systemctl status postgres.service
sudo systemctl status rhdh.service

# View service logs (on VM)
sudo journalctl -u postgres.service -f
sudo journalctl -u rhdh.service -f

# Check containers (on VM)
sudo podman ps -a | grep -E "(rhdh|postgres)"
```

## Production Considerations

### Security
- Change default passwords in `rhdh.env` and `postgres.container` environment variables
- Configure TLS certificates for HTTPS
- Review firewall settings and network security
- Use external secret management for production

### Performance
- Allocate adequate VM resources (4+ vCPUs, 8GB+ RAM)
- Monitor disk space for PostgreSQL data
- Consider external PostgreSQL for high availability

### Backup
```bash
# Backup PostgreSQL data
sudo podman exec rhdh-postgres pg_dump -U postgres rhdh_backstage > backup.sql

# Backup PostgreSQL data volume
sudo podman volume export postgres-data --output postgres-data-backup.tar

# Backup VM disk image
cp output/qcow2/disk.qcow2 backup/disk-$(date +%Y%m%d).qcow2
```

## Advanced Operations

### Updates
```bash
# Update bootc system and bound images (on VM)
sudo bootc upgrade

# Manual image update
sudo podman pull --storage-opt=additionalimagestore=/usr/lib/bootc/storage registry.redhat.io/rhdh/rhdh-hub-rhel9:1.6
sudo systemctl restart rhdh.service
```

### Registry Operations

#### Push to Container Registry
```bash
# Complete workflow: build and push to registry
make publish

# Or step-by-step:
make login          # Login to registry (default: quay.io)
make build          # Build with registry tagging
make push           # Push to registry
```

#### Configure Your Registry
Edit Makefile variables for your registry:
```makefile
REGISTRY := quay.io                    # Change to your registry
NAMESPACE := your-username             # Change to your namespace/org
```

#### Deploy from Registry
```bash
# Deploy VM using pushed registry image
make deploy-vm-registry
```

#### Supported Registries
- **Quay.io** (default): `quay.io/your-username/rhdh-bootc-quadlet:latest`
- **Docker Hub**: `docker.io/your-username/rhdh-bootc-quadlet:latest`
- **GitHub Container Registry**: `ghcr.io/your-username/rhdh-bootc-quadlet:latest`
- **Private Registries**: Any OCI-compatible registry

> **Use Cases**: Share bootc images with teams, CI/CD deployments, backup storage, multi-environment deployments

### Custom Disk Size
Edit `config.toml`:
```toml
[[customizations.filesystem]]
mountpoint = "/"
minsize = "20GiB"
```

## Success Checklist

1. **VM Status**: `make vm-status` shows VM running
2. **IP Address**: `make vm-ip` returns valid IP
3. **RHDH Test**: `make test-vm` connects successfully  
4. **Web Access**: Open `http://VM-IP:7007` in browser
5. **Services**: SSH to VM and check `sudo systemctl status rhdh.service postgres.service`

---

## 📚 Documentation

- **[PostgreSQL Setup Guide](EXTERNAL-POSTGRES-SETUP.md)** - Database configuration and troubleshooting
- **[Architecture Guide](ARCHITECTURE.md)** - Technical details and system design