# CI Pipeline Flow - Jenkins to Provisioner

Understanding how Jenkins library orchestrates the provisioner playbooks and which variables are passed to each stage.

## Pipeline Overview

**Jenkins Library** → **Provisioner Playbooks** → **Ansible Roles**

The `aap-jenkins-shared-library` defines pipeline stages that call different provisioner playbooks, each with different variables.

## Key Variables by Branch

| Variable | Main Branch | Release 2.3 | Release 2.2 | Release 2.1 |
|----------|-------------|-------------|-------------|-------------|
| `image_tag` | `main` | `2.3` | `2.2` | `2.1` |
| `backstage_plugin_repo_branch` | `main` | `release-2.3` | `release-2.2` | `release-2.1` |
| `ansible_portal_chart_repo_branch` | `main` | `release-2.3` | `release-2.2` | `release-2.1` |
| `rhdh_version` | `1.10` | `1.10` | `1.9` | `1.9` |

## Pipeline Stages & Variables

### Stage: "Seed AAP Data"
**Playbook:** `aapqa.developer_hub.seed_aap_data`

**Variables passed:**
- `aap_gateway_url`
- `aap_admin_password`
- `aap_admin_username`
- `aap_seeding_profile` (e.g., `tiny`)
- `aap_user_password` (always `redhat123`)
- `aap_seeding_clean` (true/false)

**What it does:**
- Runs `bulk-seed.py` to create orgs, users, teams, templates
- Writes `seeding-manifest.json` with credentials

---

### Stage: "Deploy Red Hat Developer Hub and install Ansible Plugins"
**Playbook:** `aapqa.developer_hub.deploy_ansible_portal`

**Variables passed:**
- `openshift_project`
- `aap_name`
- `ansible_portal_chart_repo_fork`
- `ansible_portal_chart_repo_branch` ✅
- `image_tag` ✅
- `rhdh_version`
- `install_ansible_portal=true`
- `ansible_test_environment`
- `seeding_manifest_path` (if seeding ran)

**Key roles called:**
- `aapqa.developer_hub.core` → `tasks/install_ansible_portal.yml`

**Variables available in `install_ansible_portal.yml`:**
- ✅ `image_tag` (use this for branch checks)
- ✅ `ansible_portal_chart_repo_branch`
- ✅ `rhdh_version`
- ❌ `backstage_plugin_repo_branch` (NOT available here)

---

### Stage: "Run UI Tests"
**Playbook:** `aapqa.developer_hub.run_ui_tests`

**Variables passed:**
- `openshift_project`
- `aap_name`
- `backstage_plugin_repo_branch` ✅
- `backstage_plugin_fork`
- `ansible_deployment_type=ansible-portal`

**Key roles called:**
- `aapqa.developer_hub.core` → `tasks/run_tests.yml`

**Variables available in `run_tests.yml`:**
- ✅ `backstage_plugin_repo_branch` (use this for branch checks)
- ✅ `backstage_plugin_fork`
- ✅ `ansible_deployment_type`
- ❌ `image_tag` (NOT available here)

---

## Making Changes Conditional on Branch

**Rule:** Use the variable that's actually available in the playbook context.

### In `install_ansible_portal.yml`:
```yaml
when:
  - ansible_deployment_type | default('rhdh+plugins') == 'ansible-portal'
  - image_tag == 'main'  # ✅ This variable is available
```

### In `run_tests.yml`:
```yaml
when:
  - ansible_deployment_type | default('rhdh+plugins') == 'ansible-portal'
  - backstage_plugin_repo_branch == 'main'  # ✅ This variable is available
```

## How to Investigate

**Before changing provisioner code:**

1. **Find which playbook calls your task:**
   ```bash
   grep -r "include_role\|import_role" ansible_collections/aapqa/developer_hub/playbooks/
   ```

2. **Check Jenkins library to see what variables are passed:**
   - Search for the playbook name in `aap-jenkins-shared-library`
   - Look for the `ansible-playbook` command with `-e` flags

3. **Verify in Jenkins logs:**
   ```bash
   grep "ansible-playbook aapqa.developer_hub.<playbook_name>" /path/to/build.log
   ```
   This shows the exact `-e` variables passed

4. **Check role defaults:**
   ```bash
   cat ansible_collections/aapqa/developer_hub/roles/core/defaults/main.yml
   ```
   Understand default values vs passed values

## Common Mistakes

❌ **Using `backstage_plugin_repo_branch` in `install_ansible_portal.yml`**
- This variable is NOT passed to `deploy_ansible_portal` playbook
- Will use default value `"main"` from `defaults/main.yml`
- Condition will always be true (even for release branches)

❌ **Using `image_tag` in `run_tests.yml`**
- This variable is NOT passed to `run_ui_tests` playbook
- Will use default or be undefined
- Condition will fail or behave unexpectedly

✅ **Use the correct variable for each file**
- Check what the calling playbook actually receives
- Verify in Jenkins logs before submitting MR

## Related Work

- **MR !2342**: Multi-org conditional fix - correctly uses different variables per file
- **MR !2331**: Original multi-org enablement (broke release branches)
- **Jenkins library**: `aap-jenkins-shared-library` defines all pipeline stages

## Testing Your Changes

Before submitting an MR that makes changes conditional on branch:

1. **Check Jenkins logs from all branch types:**
   - Main build
   - Release 2.3 build
   - Release 2.2 build
   - Release 2.1 build

2. **Verify variables passed to your playbook:**
   ```bash
   grep "ansible-playbook aapqa.developer_hub.YOUR_PLAYBOOK" build.log
   ```

3. **Confirm the variable you're checking is in the `-e` list**

4. **Test locally if possible:**
   - Run the playbook with `-e image_tag=2.3` to simulate release 2.3 branch
   - Run the playbook with `-e image_tag=2.2` to simulate release 2.2 branch
   - Verify your conditional skips as expected
