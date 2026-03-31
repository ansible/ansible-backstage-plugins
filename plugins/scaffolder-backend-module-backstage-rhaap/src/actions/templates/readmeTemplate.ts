import { EEDefinitionInput } from '../types';

export function generateReadme(
  values: EEDefinitionInput,
  publishToSCM: boolean,
  hasAnsibleCfg: boolean,
): string {
  const eeFileName = values.eeFileName || 'execution-environment';

  return `# Ansible Execution Environment Definition File: Getting Started Guide

This file tells how to build your defined **execution environment (EE)** using **Ansible Builder** (the tool used to build EEs). An **EE** is a container image that bundles all the tools and collections your automation needs to run consistently.

## TL;DR: Build Your Execution Environment

**Quick Start**: Install \`ansible-builder\`, \`podman\` (or Docker), and \`ansible-navigator\`, then run:

\`\`\`bash
ansible-builder build --file ${eeFileName}.yml --tag ${eeFileName.toLowerCase()}:latest --container-runtime podman
\`\`\`

**Important**: This quick start only builds the EE. Please continue reading to configure collection sources, test your EE, push it to a registry, and use it in AAP.

## Step 1: Review What Was Generated

First, let us review the files that were just created for you:

- **${values.eeFileName}.yml**: This is your EE's "blueprint." It's the main definition file that ansible-builder will use to construct your image.
- **${values.eeFileName}-template.yml**: This is the Ansible self-service automation portal template file that generated this. You can import it and use it as a base to create new templates for your portal.
${hasAnsibleCfg ? '- **ansible.cfg**: This Ansible configuration file specifies the sources from which your collections will be retrieved, by default it includes **Automation Hub** and **Ansible Galaxy**.' : ''}
${publishToSCM ? '- **catalog-info.yaml**: This is the Ansible self-service automation portal file that registers this as a "component" in your portal\'s catalog.' : ''}

${hasAnsibleCfg ? `## Step 2: Confirm Access to Collection Sources

If your execution environment (EE) uses only collections that are available in Ansible Galaxy (such as \`community.general\`), you can skip this step and continue to **Step 3**.

If your EE relies on collections from **Automation Hub**, **Private Automation Hub** or another private Galaxy server, you must update the generated **ansible.cfg** file so that \`ansible-builder\` can authenticate and download those collections.

**Configure Automation Hub access**

**Automation Hub** is already configured as a source in the generated **ansible.cfg** file. Open the file in your favorite text editor and update both the \`token\` fields with your **Automation Hub** token. If you already have a token, please ensure that it has not expired.

If you do not have a token, please follow these steps:

1. Navigate to [Ansible Automation Platform on the Red Hat Hybrid Cloud Console](https://console.redhat.com/ansible/automation-hub/token/).
2. From the navigation panel, select **Automation Hub** → **Connect to Hub**.
3. Under **Offline token**, click **Load Token**.
4. Click the [**Copy to clipboard**] icon to copy the offline token.
5. Paste the token into a file and store in a secure location.

**Configure Private Automation Hub access**

If you do not have a **Private Automation Hub (PAH)** or the EE does not require collection(s) to be installed from one you can skip this step and continue to **Step 3**.

For **PAH**, an additional entry needs to be added to the generated **ansible.cfg** file in the same format as the existing Automation Hub entries with the appropriate \`url\`, \`auth_url\` and \`token\` for your **PAH**.

To obtain your **Private Automation Hub** token:

1. Log in to your private automation hub.
2. From the navigation panel, select **Automation Content** → **API token**.
3. Click **[Load Token]**.
4. To copy the API token, click the **[Copy to clipboard]** icon.

For detailed instructions, refer to the official Red Hat Ansible Automation Platform 2.6 documentation for [managing automation content](https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform/2.6/html-single/managing_automation_content/index#proc-create-api-token-pah_cloud-sync).` : `## Step 2: Confirm Access to Collection Sources

No \`ansible.cfg\` file was generated for this scaffold, so collection-source token configuration steps are omitted.

If your EE needs private Galaxy sources (Automation Hub/PAH/custom Galaxy), create or add an \`ansible.cfg\` file with the required server and token settings before building.`}

## Step 3: Install Required Tools

With your configuration ready, you'll need the following tools on your local machine to build the image:

- **ansible-builder** (The tool that builds the EE)
- **A container engine**: Podman (recommended) or Docker
- **ansible-navigator** (For testing your EE)

### Red Hat Supported Installation (Recommended for RHEL/AAP environments)

For Red Hat Enterprise Linux systems with Red Hat Ansible Automation Platform subscriptions:

\`\`\`bash
# Install all tools via system package manager (Red Hat supported)
sudo dnf install -y ansible-core podman ansible-builder ansible-navigator
\`\`\`

**Note**: \`ansible-builder\` and \`ansible-navigator\` availability via \`dnf\` depends on your RHEL version and AAP subscription. If not available via \`dnf\`, use the community method below.

### Community-supported Installation Method

For other systems or when Red Hat packages are not available:

\`\`\`bash
# Install Ansible tools via pip
pip install ansible-core ansible-builder ansible-navigator
\`\`\`

## Step 4: Build Your Execution Environment

Now you're ready to build. Open your terminal in this directory and run the build command:

\`\`\`bash
# This command uses your '${values.eeFileName}.yml' file to build an image
# and tags it as '${values.eeFileName.toLowerCase()}:latest'

ansible-builder build --file ${values.eeFileName}.yml --tag ${values.eeFileName.toLowerCase()}:latest --container-runtime podman
\`\`\`

### Command Options:
- You can change the \`tag\` (e.g., --tag my-custom-ee:1.0)
- If you're using Docker, change the runtime (\`--container-runtime docker\`)
- Add \`--verbosity 2\` for more detailed build output

## Step 5 (Recommended): Test Your EE Locally

This is the best way to verify your EE works before you share it. To do this, you can use \`ansible-navigator\`.

### Create a Test Playbook

Create a file named \`playbook.yaml\` in this directory:

\`\`\`yaml
---
- name: Test my new EE
  hosts: localhost
  connection: local
  gather_facts: false
  tasks:
    - name: Print ansible version
      ansible.builtin.command: ansible --version
      register: ansible_version

    - name: Display version
      ansible.builtin.debug:
        var: ansible_version.stdout_lines

    - name: Test collection availability
      ansible.builtin.debug:
        msg: "EE is working correctly!"
\`\`\`

### Run the Test Playbook

\`\`\`bash
ansible-navigator run playbook.yaml --eei ${eeFileName}:latest --pull-policy missing
\`\`\`

If it runs successfully, your EE is working!

**Note**: The playbook provided is a generic example compatible with all correctly built EEs. You may tailor it to better match the EE you have built.

## Step 6: Push to a Container Registry

To use this EE in Ansible Automation Platform (AAP), it must live in a registry. Red Hat recommends using **Private Automation Hub** as your primary registry for enterprise environments.

### Private Automation Hub (Recommended for Red Hat AAP)

Private Automation Hub is the Red Hat supported registry for execution environments in enterprise AAP deployments.

\`\`\`bash
# Tag the image for your Private Automation Hub
podman tag ${eeFileName}:latest your-pah-hostname/${eeFileName}:latest

# Login to your Private Automation Hub
podman login your-pah-hostname

# Push the image
podman push your-pah-hostname/${eeFileName}:latest
\`\`\`

### Internal/Corporate Registry

\`\`\`bash
# Use your organization's internal registry URL
podman tag ${eeFileName}:latest your-internal-registry.com/${eeFileName}:latest
podman login your-internal-registry.com
podman push your-internal-registry.com/${eeFileName}:latest
\`\`\`

## Step 7: Use Your EE in Ansible Automation Platform

Once your execution environment is built and pushed to a registry, you need to register it in AAP.

#### Adding Your EE to AAP Controller:

1. Log into **AAP**
2. Navigate to **Automation Execution** → **Infrastructure**  → **Execution Environments**
3. Click **Create execution environment** and provide the details of your execution environment.

#### Using Your EE in Job Templates:

1. Navigate to **Automation Execution** → **Templates**
2. Create a new AAP Job Template or edit an existing one
3. In the **Execution Environment** field, select your newly added EE from the dropdown
4. Save and launch - your playbooks now run in your custom environment

For detailed instructions, see the official Red Hat Ansible Automation Platform documentation:

- [Creating and using execution environments](https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform/2.6/html/creating_and_using_execution_environments/index)
- [Ansible Automation Platform Job Templates](https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform/2.6/html/using_automation_execution/controller-job-templates#controller-create-job-template)

## Step 8 (Optional): Import EE template into self-service automation portal

If you want to reuse this execution environment template for future projects, you can import the generated **${eeFileName}.yml** file into your self-service automation portal.

#### Prerequisites:

- You must be logged in to self-service automation portal as an Ansible Automation Platform administrator

#### How to Import:

1. **Access the portal and add template**: Navigate to your self-service automation portal, go to the **Templates** page, and click **Add template**.
2. **Import from Git repository**: Enter the Git SCM URL containing your \`${eeFileName}.yml\` file, click **Analyze** to validate, review the details, then click **Import**.
3. **Configure RBAC**: Set up Role-Based Access Control (RBAC) to allow users to view and run your custom Execution Environment template

Once imported and configured, other users can use your template as a starting point for their own execution environment projects, promoting consistency and best practices across your automation initiatives.

For detailed instructions, see the [self-service automation portal documentation](https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform/2.6/html/using_self-service_automation_portal/self-service-working-templates_aap-self-service-using#self-service-add-template_self-service-working-templates).
`;
}
