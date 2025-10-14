# RHDH Ansible Bootc Image Mode

This branch contains the **Image Mode** deployment configuration for Red Hat Developer Hub (RHDH) with Ansible Self-Service Portal using **Podman Quadlet** and **RHEL bootc**.

## What's in this branch

This branch provides a production-ready RHDH deployment using:
- **Podman Quadlet** for systemd-native container management
- **RHEL 9/10 bootc** for atomic system updates
- **PostgreSQL database** for persistent data storage
- **Logically bound images** for automatic image management

## 🚀 Quick Start

```bash
# Clone this branch
git clone -b image_mode_quadlet https://github.com/ansible/backstage-plugins-ansible.git rhdh-image-mode
cd rhdh-image-mode/image_mode/quadlet

# Prerequisites: Login to Red Hat registry (required)
sudo podman login registry.redhat.io
podman login registry.redhat.io

# Local development deployment (builds locally)
make deploy-vm-local

# Production deployment (uses registry)
make deploy-vm-registry

# Monitor deployment
make vm-status

# Get VM IP and access RHDH
make vm-ip
# Open http://VM-IP:7007 in browser
```

## 📁 Directory Structure

```
image_mode/
├── quadlet/                              # 🎯 PRIMARY: Quadlet deployment (START HERE)
│   ├── README.md                         # Complete Quadlet documentation
│   ├── Makefile                          # Quadlet deployment automation
│   ├── Containerfile.rhdh-bootc-quadlet # Bootc image definition
│   ├── rhdh.container                    # RHDH service configuration
│   ├── postgres.container                # PostgreSQL service configuration
│   ├── rhdh-network.network              # Network configuration
│   ├── rhdh.env                          # Environment variables
│   ├── postgres.env                      # PostgreSQL configuration
│   ├── build-quadlet.sh                  # Build script
│   ├── validate-quadlet.sh               # Validation script
│   ├── ARCHITECTURE.md                   # Technical architecture details
│   └── EXTERNAL-POSTGRES-SETUP.md        # Database setup guide
├── configs/                              # RHDH configuration files
│   ├── app-config/                       # Application configuration
│   ├── catalog-entities/                 # Catalog entities and docs
│   └── dynamic-plugins/                  # Dynamic plugin configuration
├── scripts/                              # Helper scripts
└── local-plugins/                        # Ansible plugin packages
```

## 🎯 Deployment Architecture

This deployment uses **Podman Quadlet** for production-grade systemd integration:

### Key Features
- ✅ **Systemd Integration**: Services managed natively by systemd
- ✅ **Atomic Updates**: bootc provides atomic system and application updates
- ✅ **PostgreSQL Database**: Persistent data storage with dedicated container
- ✅ **Automatic Image Management**: Logically bound images pulled automatically
- ✅ **Network Isolation**: Dedicated bridge network for container communication
- ✅ **Production Ready**: RHEL 9/10 based with full enterprise support

### Available Make Commands

#### Complete Workflows
```bash
make deploy-vm-local       # Build locally → Create QCOW2 → Deploy VM
make deploy-vm-registry    # Build for registry → Create QCOW2 → Deploy VM
```

#### Individual Steps
```bash
make build-local           # Build bootc image locally
make qcow2-local           # Create QCOW2 from local image
make vm-create-local       # Create VM from local QCOW2
make vm-status             # Check VM status and info
make vm-ip                 # Get VM IP address
make test-vm               # Test RHDH accessibility
```

#### PostgreSQL Management
```bash
make postgres-setup        # Setup PostgreSQL data directory
make postgres-start        # Start PostgreSQL service
make postgres-status       # Check PostgreSQL status
make postgres-logs         # View PostgreSQL logs
```

#### Image Management
```bash
make validate              # Validate Quadlet configuration
make check-image-status    # Check which images are available
make pull-all-images       # Pull all required images
```

See [`image_mode/quadlet/README.md`](image_mode/quadlet/README.md) for complete command reference.

## 📖 Documentation

Primary documentation is in the **quadlet directory**:

- **[Quadlet README](image_mode/quadlet/README.md)** - Complete deployment guide, prerequisites, and available commands
- **[Architecture Guide](image_mode/quadlet/ARCHITECTURE.md)** - Technical details, design decisions, and system architecture
- **[PostgreSQL Setup](image_mode/quadlet/EXTERNAL-POSTGRES-SETUP.md)** - Database configuration and troubleshooting

Additional resources:
- **[Image Mode README](image_mode/README.md)** - Overview of container deployment options

## 🔗 Related Repositories

- **Main repository**: Contains full Ansible Backstage plugins source code
- **Software Templates**: [Red Hat Developer Hub Software Templates](https://github.com/redhat-developer/red-hat-developer-hub-software-templates)
- **RHDH Documentation**: [Red Hat Developer Hub Docs](https://docs.redhat.com/en/documentation/red_hat_developer_hub/)

## 🆘 Support

For questions and issues:
1. Check the [Quadlet README](image_mode/quadlet/README.md) for deployment instructions
2. Review the [Troubleshooting section](image_mode/quadlet/README.md#troubleshooting) for common issues
3. See the [Architecture Guide](image_mode/quadlet/ARCHITECTURE.md) for technical details
4. Consult the [PostgreSQL Setup Guide](image_mode/quadlet/EXTERNAL-POSTGRES-SETUP.md) for database issues
5. Open an issue in the main repository

---

**Built with ❤️ for the Ansible and RHDH communities**
