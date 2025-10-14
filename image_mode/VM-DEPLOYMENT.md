# RHDH Ansible Portal VM Deployment on macOS (Local QEMU)

This guide explains how to run the RHDH Ansible Portal as a local virtual machine on macOS using QEMU. No cloud resources are required.

Note: The QCOW2 image is produced by the bootc build under this `image_mode` directory. The output is `output/qcow2/disk.qcow2`.

## 🔐 Prerequisites

- macOS (Apple Silicon or Intel)
- Homebrew installed
- QEMU and socat
  ```bash
  brew install qemu socat
  ```

## 📦 Build or Obtain the QCOW2 Image

If you have already built and pushed the registry image configured in `image_mode/Makefile`, you can create the QCOW2 directly. Otherwise, publish first.

1) Optional: Publish the image (if not already pushed)
```bash
make login       # authenticate to your registry
make publish     # build and push image to registry
```

2) Create the macOS ARM64 QCOW2 image
```bash
make qcow2
# Output: image_mode/output/qcow2/disk.qcow2
```

## 🚀 Start the VM Locally

Use the provided macOS VM Makefile.

```bash
# From the image_mode directory
make -f MAC-VM-Makefile vm-interactive
```

- The Makefile expects the disk at `output/qcow2/disk.qcow2`.
- First boot can take 2–3 minutes for services to start.

## ✅ Test and Access RHDH

Quick test:
```bash
make -f MAC-VM-Makefile vm-test
```

Access the web UI:
```text
http://localhost:8008
```

SSH access:
```bash
# Root
ssh -p 2225 root@localhost    # password: root123
# Admin user
ssh -p 2225 admin@localhost   # password: admin123
```

## 🔧 Manage the VM

- Start: `make -f MAC-VM-Makefile vm-start`
- Stop: `make -f MAC-VM-Makefile vm-stop`
- Restart: `make -f MAC-VM-Makefile vm-restart`
- Status: `make -f MAC-VM-Makefile vm-status`
- Logs: `make -f MAC-VM-Makefile vm-logs`
- Interactive console: `make -f MAC-VM-Makefile vm-interactive`
- Debug mode: `make -f MAC-VM-Makefile vm-debug`
- Clean files: `make -f MAC-VM-Makefile vm-clean`

## 🧪 End-to-End Workflow (Example)

```bash
# 1) Build and push the container image (if needed)
make login
make publish

# 2) Generate QCOW2 for macOS (ARM64)
make qcow2-macos

# 3) Boot the VM and wait for RHDH to be ready
make -f MAC-VM-Makefile vm-start
make -f MAC-VM-Makefile vm-wait-ready

# 4) Verify
open http://localhost:8007
make -f MAC-VM-Makefile vm-test
```

## 🔍 Troubleshooting

- Ensure QEMU is installed:
  ```bash
  qemu-system-aarch64 --version
  ```
- Verify the QCOW2 path:
  ```bash
  ls -la output/qcow2/disk.qcow2
  ```
- Check for port conflicts on 8008 (HTTP) and 2225 (SSH).
- View VM logs:
  ```bash
  make -f MAC-VM-Makefile vm-logs
  ```
- First boot may take 5–10 minutes for bootc-based images on some systems.

## 📄 Notes

- Web UI: `http://localhost:8007`
- Default credentials (console): `admin:admin123` or `root:root123`
- The VM uses user-mode networking with host forwards:
  - `localhost:8007` → VM `:7007`
  - `localhost:2224` → VM `:22`

---

Built for running RHDH Ansible Portal locally on macOS with QEMU.

