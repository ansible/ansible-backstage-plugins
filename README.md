# RHDH Ansible Bootc Image Mode

This branch contains the **Image Mode** deployment configuration for Red Hat Developer Hub (RHDH) with Ansible Self-Service Portal.

## What's in this branch

This branch is a focused subset containing only the `image_mode/` directory from the main backstage-plugins-ansible repository. It provides a complete RHEL 10 bootc-based container image deployment solution.

## 🚀 Quick Start

```bash
# Clone this branch
git clone -b image_mode_quadlet https://github.com/ansible/backstage-plugins-ansible.git rhdh-image-mode
cd rhdh-image-mode/image_mode

# Container deployment (recommended)
make deploy-container

# VM deployment (QCOW2)
make deploy-vm
```

## 📁 Directory Structure

```
image_mode/
├── README.md                 # Complete documentation
├── Makefile                  # Container and image build automation
├── Containerfile.rhdh-ansible-bootc  # Main container definition
├── configs/                  # RHDH configuration files
├── quadlet/                  # RHEL quadlet deployment files
├── scripts/                  # Helper scripts
└── local-plugins/           # Ansible plugin packages
```

## 🎯 Deployment Options

### 1. Container Deployment
- **Target**: Development and testing
- **Requirements**: Podman/Docker
- **Access**: `http://localhost:7007`

### 2. VM Deployment (QCOW2)  
- **Target**: Production-like environments
- **Requirements**: QEMU/KVM, libvirt
- **Use cases**: Cloud deployment, bare metal

### 3. Quadlet Deployment
- **Target**: RHEL 9/10 systems with systemd
- **Requirements**: Podman 4.4+, systemd
- **Benefits**: Native systemd integration

## 📖 Documentation

All detailed documentation is in [`image_mode/README.md`](image_mode/README.md), including:

- Installation guides
- Configuration options  
- Troubleshooting
- Architecture details
- Security considerations

## 🔗 Related Repositories

- **Main repository**: Contains full Ansible Backstage plugins source code
- **Software Templates**: [Red Hat Developer Hub Software Templates](https://github.com/redhat-developer/red-hat-developer-hub-software-templates)
- **RHDH Documentation**: [Red Hat Developer Hub Docs](https://docs.redhat.com/en/documentation/red_hat_developer_hub/)

## 🆘 Support

For questions and issues:
1. Check the [detailed README](image_mode/README.md) 
2. Review [troubleshooting section](image_mode/README.md#troubleshooting)
3. Open an issue in the main repository

---

**Built with ❤️ for the Ansible and RHDH communities**
