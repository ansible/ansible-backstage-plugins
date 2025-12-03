import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import * as fs from 'fs/promises';
import * as path from 'path';
import yaml from 'js-yaml';
import semver from 'semver';
import { z } from 'zod';
import {
  CollectionRequirementsSchema,
  EEDefinitionSchema,
} from './helpers/schemas';
import { parseUploadedFileContent } from './utils/utils';
import { AuthService } from '@backstage/backend-plugin-api';
import { DiscoveryService } from '@backstage/backend-plugin-api';

interface Collection {
  name: string;
  version?: string;
  signatures?: string[];
  source?: string;
  type?: string;
}

const MCPSERVER_VARS = [
  {
    role: 'aws_ccapi_mcp',
    vars: {},
  },
  {
    role: 'aws_cdk_mcp',
    vars: {},
  },
  {
    role: 'aws_core_mcp',
    vars: {},
  },
  {
    role: 'aws_iam_mcp',
    vars: {},
  },
  {
    role: 'azure_mcp',
    vars: {
      azure_mcp_namespaces: ['az'],
    },
  },
  {
    role: 'common',
    vars: {
      common_mcp_base_path: '/opt/mcp',
      common_golang_version: 1.25,
      common_nodejs_min_version: 20,
      common_system_bin_path: '/usr/local/bin',
      common_uv_installer_url: 'https://astral.sh/uv/install.sh',
    },
  },
  {
    role: 'github_mcp',
    vars: {
      github_mcp_mode: 'local',
      github_mcp_build_repo: 'https://github.com/github/github-mcp-server.git',
      github_mcp_build_repo_branch: 'main',
      github_mcp_build_path: 'github/build',
    },
  },
];

interface AdditionalBuildStep {
  stepType:
    | 'prepend_base'
    | 'append_base'
    | 'prepend_galaxy'
    | 'append_galaxy'
    | 'prepend_builder'
    | 'append_builder'
    | 'prepend_final'
    | 'append_final';
  commands: string[];
}

interface EEDefinitionInput {
  eeFileName: string;
  eeDescription: string;
  customBaseImage?: string;
  tags: string[];
  publishToSCM: boolean;
  baseImage: string;
  collections?: Collection[];
  popularCollections?: string[];
  collectionsFile?: string;
  pythonRequirements?: string[];
  pythonRequirementsFile?: string;
  systemPackages?: string[];
  systemPackagesFile?: string;
  mcpServers?: string[];
  additionalBuildSteps?: AdditionalBuildStep[];
  owner?: string;
}

export function createEEDefinitionAction(options: {
  frontendUrl: string;
  auth: AuthService;
  discovery: DiscoveryService;
}) {
  const { frontendUrl, auth, discovery } = options;
  return createTemplateAction({
    id: 'ansible:create:ee-definition',
    description: 'Creates Ansible Execution Environment definition files',
    schema: {
      input: {
        type: 'object',
        required: ['values'],
        properties: {
          values: {
            type: 'object',
            required: [
              'baseImage',
              'eeFileName',
              'eeDescription',
              'publishToSCM',
            ],
            properties: {
              eeFileName: {
                title: 'Execution Environment File Name',
                description: 'Name of the execution environment file',
                type: 'string',
              },
              eeDescription: {
                title: 'Execution Environment Description',
                description: 'Description for the saved Execution Environment',
                type: 'string',
              },
              tags: {
                title: 'Tags',
                description:
                  'Tags to be included in the execution environment definition file',
                type: 'array',
                items: { type: 'string' },
              },
              publishToSCM: {
                title: 'Publish to a SCM repository',
                description:
                  'Publish the Execution Environment definition and template to a SCM repository',
                type: 'boolean',
              },
              customBaseImage: {
                title: 'Custom Base Image',
                description: 'Custom base image for the execution environment',
                type: 'string',
              },
              collections: {
                title: 'Ansible Collections',
                description: 'List of Ansible collections to include',
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: {
                      type: 'string',
                      description: 'Collection name (e.g., community.general)',
                    },
                    version: {
                      type: 'string',
                      description: 'Collection version (optional)',
                    },
                    source: {
                      type: 'string',
                      description: 'Collection source (optional)',
                    },
                    type: {
                      type: 'string',
                      description: 'Collection type (optional)',
                    },
                    signatures: {
                      type: 'array',
                      description: 'Collection signatures (optional)',
                      items: {
                        type: 'string',
                      },
                    },
                  },
                  required: ['name'],
                },
              },
              popularCollections: {
                title: 'Popular Collections',
                description: 'List of popular collection names to include',
                type: 'array',
                items: {
                  type: 'string',
                },
              },
              collectionsFile: {
                title: 'Collections File Content',
                description: 'Content of uploaded requirements.yml file',
                type: 'data-url',
              },
              pythonRequirements: {
                title: 'Python Requirements',
                description: 'List of Python package requirements',
                type: 'array',
                items: {
                  type: 'string',
                },
              },
              pythonRequirementsFile: {
                title: 'Python Requirements File Content',
                description: 'Content of uploaded requirements.txt file',
                type: 'data-url',
              },
              systemPackages: {
                title: 'System Packages',
                description: 'List of system packages to install',
                type: 'array',
                items: {
                  type: 'string',
                },
              },
              systemPackagesFile: {
                title: 'System Packages File Content',
                description: 'Content of uploaded bindep.txt file',
                type: 'data-url',
              },
              mcpServers: {
                title: 'MCP Servers',
                description: 'List of MCP servers to install',
                type: 'array',
                items: {
                  type: 'string',
                },
              },
              additionalBuildSteps: {
                title: 'Additional Build Steps',
                description: 'Custom build steps for the execution environment',
                type: 'array',
                default: [],
                items: {
                  type: 'object',
                  properties: {
                    stepType: {
                      type: 'string',
                      enum: [
                        'prepend_base',
                        'append_base',
                        'prepend_galaxy',
                        'append_galaxy',
                        'prepend_builder',
                        'append_builder',
                        'prepend_final',
                        'append_final',
                      ],
                    },
                    commands: {
                      type: 'array',
                      items: {
                        type: 'string',
                      },
                    },
                  },
                  required: ['stepType', 'commands'],
                },
              },
            },
          },
        },
      },
      output: {
        type: 'object',
        properties: {
          contextDirName: {
            title: 'Directory in the workspace where the files will created',
            type: 'string',
          },
          eeDefinitionContent: {
            title: 'EE Definition Content',
            type: 'string',
          },
          generatedEntityRef: {
            title:
              'Generated entity reference (for dynamically registered catalog entities ONLY)',
            type: 'string',
          },
          owner: {
            title: 'Owner of the execution environment',
            type: 'string',
          },
          readmeContent: {
            title: 'README Content',
            type: 'string',
          },
          mcpVarsContent: {
            title: 'MCP Vars Content',
            type: 'string',
          },
          catalogInfoPath: {
            title:
              'Relative path for the catalog-info.yaml file (for SCM publishing only)',
            type: 'string',
          },
        },
      },
    },
    async handler(ctx) {
      const { input, logger, workspacePath } = ctx;
      const values = input.values as unknown as EEDefinitionInput;
      const baseImage = values.baseImage;
      const collections = values.collections || [];
      const popularCollections = values.popularCollections || [];
      const collectionsFile = values.collectionsFile || '';
      const pythonRequirements = values.pythonRequirements || [];
      const pythonRequirementsFile = values.pythonRequirementsFile || '';
      const systemPackages = values.systemPackages || [];
      const systemPackagesFile = values.systemPackagesFile || '';
      const mcpServers = values.mcpServers || [];
      const additionalBuildSteps = values.additionalBuildSteps || [];
      const eeFileName = values.eeFileName || 'execution-environment';
      const eeDescription = values.eeDescription || 'Execution Environment';
      const tags = values.tags || [];
      const owner = values.owner || ctx.user?.ref || '';

      // required for catalog component registration
      ctx.output('owner', owner);

      // each EE created in a repository should be self contained in its own directory
      const contextDirName = (eeFileName || 'execution-environment')
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-')
        .replace(/-+/g, '-') // Replace multiple consecutive dashes with a single dash
        .replace(/^-|-$/g, ''); // Remove leading and trailing dashes

      ctx.output('contextDirName', contextDirName);

      // create the directory path for the EE files
      const eeDir = path.join(workspacePath, contextDirName);
      // Ensure the directory exists (recursively)
      await fs.mkdir(eeDir, { recursive: true });

      // create the path for the EE definition file
      const eeDefinitionPath = path.join(eeDir, `${eeFileName}.yaml`);
      // create the path for the ansible.cfg file
      const ansibleConfigPath = path.join(eeDir, 'ansible.cfg');
      // create the path for the README file
      const readmePath = path.join(eeDir, 'README.md');
      // create docs directory for techdocs
      const docsDir = path.join(eeDir, 'docs');
      await fs.mkdir(docsDir, { recursive: true });

      // symlink the README file to the docs directory so that techdocs can pick it up
      const docsMdPath = path.join(docsDir, 'index.md');

      logger.info(`[ansible:create:ee-definition] EE base image: ${baseImage}`);

      const decodedCollectionsContent =
        parseUploadedFileContent(collectionsFile);
      const decodedPythonRequirementsContent = parseUploadedFileContent(
        pythonRequirementsFile,
      );
      const decodedSystemPackagesContent =
        parseUploadedFileContent(systemPackagesFile);

      const parsedCollections = parseCollectionsFile(decodedCollectionsContent);
      const parsedPythonRequirements = parseTextRequirementsFile(
        decodedPythonRequirementsContent,
      );
      const parsedSystemPackages = parseTextRequirementsFile(
        decodedSystemPackagesContent,
      );

      // modify the additional build steps (generic)
      modifyAdditionalBuildSteps(additionalBuildSteps, mcpServers);

      // generate MCP builder steps
      // if any MCP servers are specified, we need to add the ansible.mcp ansible.mcp_builder collections
      // for that we use the parsedCollections list
      let mcpVarsContent: string = '';
      if (mcpServers.length > 0) {
        generateMCPBuilderSteps(
          mcpServers,
          parsedCollections,
          additionalBuildSteps,
        );

        // create mcp-vars.yaml content
        mcpVarsContent = generateMCPVarsContent(mcpServers);
      }

      try {
        // Merge collections from different sources
        const allCollections = mergeCollections(
          collections,
          popularCollections,
          parsedCollections,
        );

        // Merge requirements from different sources
        const allRequirements = mergeRequirements(
          pythonRequirements,
          parsedPythonRequirements,
        );

        // Merge packages from different sources
        const allPackages = mergePackages(systemPackages, parsedSystemPackages);
        logger.info(
          `[ansible:create:ee-definition] collections: ${JSON.stringify(allCollections)}`,
        );
        logger.info(
          `[ansible:create:ee-definition] pythonRequirements: ${JSON.stringify(allRequirements)}`,
        );
        logger.info(
          `[ansible:create:ee-definition] systemPackages: ${JSON.stringify(allPackages)}`,
        );
        logger.info(
          `[ansible:create:ee-definition] additionalBuildSteps: ${JSON.stringify(additionalBuildSteps)}`,
        );

        // Create merged values object
        const mergedValues = {
          ...values,
          // these are the merged/created/updated values from the different sources
          collections: allCollections,
          pythonRequirements: allRequirements,
          systemPackages: allPackages,
          additionalBuildSteps: additionalBuildSteps,
        };
        // Generate EE definition file
        const eeDefinition = generateEEDefinition(mergedValues);
        // validate the generated EE definition YAML content
        // this will throw an error if the generated EE definition YAML content is invalid
        validateEEDefinition(eeDefinition);

        await fs.writeFile(eeDefinitionPath, eeDefinition);
        logger.info(
          `[ansible:create:ee-definition] created EE definition file ${eeFileName}.yaml at ${eeDefinitionPath}`,
        );
        ctx.output('eeDefinitionContent', eeDefinition);

        // Generate README with instructions
        const readmeContent = generateReadme(
          mergedValues,
          mcpServers,
          values.publishToSCM,
        );
        await fs.writeFile(readmePath, readmeContent);
        ctx.output('readmeContent', readmeContent);

        // write MCP vars contents to mcp-vars.yaml
        if (mcpVarsContent.length > 0) {
          // create the path for the mcp-vars.yaml file
          const mcpVarsPath = path.join(eeDir, 'mcp-vars.yaml');
          await fs.writeFile(mcpVarsPath, mcpVarsContent);
          ctx.output('mcpVarsContent', mcpVarsContent);
        }

        // write README contents to docs/index.md
        await fs.writeFile(docsMdPath, readmeContent);

        // write ansible.cfg contents to ansible.cfg file
        const ansibleConfigContent = await generateAnsibleConfigContent();
        await fs.writeFile(ansibleConfigPath, ansibleConfigContent);

        const eeTemplateContent = generateEETemplate(mergedValues);

        // perform the following only if the user has chosen to publish to a SCM repository
        if (values.publishToSCM) {
          const templatePath = path.join(eeDir, `${eeFileName}-template.yaml`);
          await fs.writeFile(templatePath, eeTemplateContent);
          logger.info(
            `[ansible:create:ee-definition created EE template.yaml at ${templatePath}`,
          );
          // generate catalog descriptor file path for the Execution Environment
          // this is only needed if the user has chosen to publish to a SCM repository
          // and we are creating a catalog-info.yaml file using the built-in `catalog:write` action
          const catalogInfoPath = path.join(
            contextDirName,
            'catalog-info.yaml',
          );
          ctx.output('catalogInfoPath', catalogInfoPath);
        } else {
          // dynamically register the execution environment entity in the catalog
          const baseUrl = await discovery.getBaseUrl('catalog');
          const { token } = await auth.getPluginRequestToken({
            onBehalfOf: await auth.getOwnServiceCredentials(),
            targetPluginId: 'catalog',
          });

          // create the EE catalog entity dict
          const entity = generateEECatalogEntity(
            eeFileName,
            eeDescription,
            tags,
            owner,
            eeDefinition,
            readmeContent,
            mcpVarsContent,
            ansibleConfigContent,
            eeTemplateContent,
          );
          // register the EE catalog entity with the catalog
          const response = await fetch(`${baseUrl}/register_ee`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ entity }),
          });

          if (response.ok) {
            logger.info(
              `[ansible:create:ee-definition] successfully registered EE catalog entity ${eeFileName} in the catalog`,
            );
          } else if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to register EE definition: ${errorText}`);
          }
        }

        ctx.output(
          'generatedEntityRef',
          `${frontendUrl}/self-service/catalog/${eeFileName}`,
        );
        logger.info(
          '[ansible:create:ee-definition] successfully created all Execution Environment files',
        );
      } catch (error: any) {
        throw new Error(
          `[ansible:create:ee-definition] Failed to create EE definition files: ${error.message}`,
        );
      }
    },
  });
}

function generateEEDefinition(values: EEDefinitionInput): string {
  const collections = values.collections || [];
  const requirements = values.pythonRequirements || [];
  const packages = values.systemPackages || [];
  const additionalBuildSteps = values.additionalBuildSteps || [];
  let overridePkgMgrPath = false;
  let overridePythonInterpreter = false;

  if (
    values.baseImage
      .toString()
      .includes(
        'registry.redhat.io/ansible-automation-platform/ee-minimal-rhel',
      )
  ) {
    overridePkgMgrPath = true;
    overridePythonInterpreter = true;
  }

  // Build dependencies section using inline values (no separate files)
  let dependenciesContent = '';

  // Add Python requirements inline
  if (requirements.length > 0) {
    dependenciesContent += '\n  python:';
    requirements.forEach(req => {
      dependenciesContent += `\n    - ${req}`;
    });
  }

  // Add system packages inline
  if (packages.length > 0) {
    dependenciesContent += '\n  system:';
    packages.forEach(pkg => {
      dependenciesContent += `\n    - ${pkg}`;
    });
  }

  // Add galaxy collections inline
  if (collections.length > 0) {
    dependenciesContent += '\n  galaxy:\n    collections:';
    collections.forEach(collection => {
      dependenciesContent += `\n      - name: ${collection.name}`;
      if (collection.version) {
        dependenciesContent += `\n        version: ${collection.version}`;
      }
      if (collection.type) {
        dependenciesContent += `\n        type: ${collection.type}`;
      }
      if (collection.source) {
        dependenciesContent += `\n        source: ${collection.source}`;
      }
      if (collection.signatures && collection.signatures.length > 0) {
        dependenciesContent += `\n        signatures:`;
        collection.signatures.forEach(signature => {
          dependenciesContent += `\n          - ${signature}`;
        });
      }
    });
  }

  if (overridePythonInterpreter) {
    dependenciesContent += `\n  python_interpreter:\n    python_path: "/usr/bin/python3.11"`;
  }

  // Add dependencies: prefix if any dependencies exist
  if (dependenciesContent.length > 0) {
    dependenciesContent = `\ndependencies:${dependenciesContent}`;
  }

  let additional_build_files = `\nadditional_build_files:\n  - src: ./ansible.cfg\n    dest: configs`;
  if (values.mcpServers && values.mcpServers.length > 0) {
    additional_build_files += `\n  - src: ./mcp-vars.yaml\n    dest: configs`;
  }

  let content = `---
version: 3

images:
  base_image:
    name: '${values.baseImage}'
${dependenciesContent.trimEnd()}
${additional_build_files}
${overridePkgMgrPath ? `\noptions:\n  package_manager_path: /usr/bin/microdnf\n` : ''}`;

  // Add additional_build_steps if any are defined
  if (additionalBuildSteps.length > 0) {
    const buildStepsGroups: Record<string, string[]> = {};
    additionalBuildSteps.forEach(step => {
      if (!buildStepsGroups[step.stepType]) {
        buildStepsGroups[step.stepType] = [];
      }
      buildStepsGroups[step.stepType].push(...step.commands);
    });

    content.trimEnd();
    content += '\nadditional_build_steps:';
    Object.entries(buildStepsGroups).forEach(([stepType, commands]) => {
      content += `\n  ${stepType}:`;
      commands.forEach(command => {
        content += `\n    - ${command}`;
      });
    });
  }

  return `${content.trimEnd()}\n`;
}

function generateReadme(
  values: EEDefinitionInput,
  mcpServers: string[],
  publishToSCM: boolean,
): string {
  const eeFileName = values.eeFileName || 'execution-environment';

  return `# Ansible Execution Environment Definition File: Getting Started Guide

This file tells how to build your defined **execution environment (EE)** using **Ansible Builder** (the tool used to build EEs). An **EE** is a container image that bundles all the tools and collections your automation needs to run consistently.

## TL;DR: Build Your Execution Environment

**Quick Start**: Install \`ansible-builder\`, \`podman\` (or Docker), and \`ansible-navigator\`, then run:

\`\`\`bash
ansible-builder build --file ${eeFileName}.yaml --tag ${eeFileName}:latest --container-runtime podman
\`\`\`

**Important**: This quick start only builds the EE. Please continue reading to configure collection sources, test your EE, push it to a registry, and use it in AAP.

## Step 1: Review What Was Generated

First, let us review the files that were just created for you:

- **${values.eeFileName}.yaml**: This is your EE's "blueprint." It's the main definition file that ansible-builder will use to construct your image.
- **${values.eeFileName}-template.yaml**: This is the Ansible self-service automation portal template file that generated this. You can import it and use it as a base to create new templates for your portal.
- **ansible.cfg**: This Ansible configuration file specifies the sources from which your collections will be retrieved, by default it includes **Automation Hub** and **Ansible Galaxy**.
${mcpServers && mcpServers.length > 0 ? '- **mcp-vars.yaml**: This Ansible variables file contains variables for the selected **Model Context Protocol (MCP) servers** which will be used when installing them in the Execution Environment.' : ''}
${publishToSCM ? '- **catalog-info.yaml**: This is the Ansible self-service automation portal file that registers this as a "component" in your portal\'s catalog.' : ''}

## Step 2: Confirm Access to Collection Sources

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

For detailed instructions, refer to the official Red Hat Ansible Automation Platform 2.6 documentation for [managing automation content](https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform/2.6/html-single/managing_automation_content/index#proc-create-api-token-pah_cloud-sync).

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
# This command uses your '${values.eeFileName}.yaml' file to build an image
# and tags it as '${values.eeFileName}:latest'

ansible-builder build --file ${values.eeFileName}.yaml --tag ${values.eeFileName}:latest --container-runtime podman
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
ansible-navigator run playbook.yml --eei ${eeFileName}:latest --pull-policy missing
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

If you want to reuse this execution environment template for future projects, you can import the generated **${eeFileName}.yaml** file into your self-service automation portal.

#### Prerequisites:

- You must be logged in to self-service automation portal as an Ansible Automation Platform administrator

#### How to Import:

1. **Access the portal and add template**: Navigate to your self-service automation portal, go to the **Templates** page, and click **Add template**.
2. **Import from Git repository**: Enter the Git SCM URL containing your \`${eeFileName}.yaml\` file, click **Analyze** to validate, review the details, then click **Import**.
3. **Configure RBAC**: Set up Role-Based Access Control (RBAC) to allow users to view and run your custom Execution Environment template

Once imported and configured, other users can use your template as a starting point for their own execution environment projects, promoting consistency and best practices across your automation initiatives.

For detailed instructions, see the [self-service automation portal documentation](https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform/2.6/html/using_self-service_automation_portal/self-service-working-templates_aap-self-service-using#self-service-add-template_self-service-working-templates).
`;
}

function generateEETemplate(values: EEDefinitionInput): string {
  const collectionsJson = JSON.stringify(values.collections);
  const requirementsJson = JSON.stringify(values.pythonRequirements);
  const packagesJson = JSON.stringify(values.systemPackages);
  const buildStepsJson = JSON.stringify(values.additionalBuildSteps);
  const tagsJson = JSON.stringify(values.tags);
  const mcpServersJson = JSON.stringify(values.mcpServers);

  return `---
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: ${values.eeFileName}
  title: ${values.eeFileName}
  description: ${values.eeDescription || 'Saved Ansible Execution Environment Definition template'}
  annotations:
    ansible.io/saved-template: 'true'
  tags: ${tagsJson}
spec:
  type: execution-environment

  parameters:
    # Step 1: Base Image Selection
    - title: Base Image
      description: Configure the base image for your execution environment
      properties:
        baseImage:
          title: Base execution environment image
          type: string
          default: '${values.customBaseImage || values.baseImage}'
          enum:
            - 'registry.redhat.io/ansible-automation-platform/ee-minimal-rhel8:2.18'
            - 'registry.redhat.io/ansible-automation-platform/ee-minimal-rhel9:2.18'
            - 'registry.redhat.io/ansible-automation-platform/ee-minimal-rhel8:2.16'
            - 'registry.redhat.io/ansible-automation-platform/ee-minimal-rhel9:2.16'${values.customBaseImage?.trim() ? `\n            - '${values.customBaseImage}'` : ''}
          enumNames:
            - 'Red Hat Ansible Minimal EE - Ansible Core 2.18 (RHEL 8)'
            - 'Red Hat Ansible Minimal EE - Ansible Core 2.18 (RHEL 9)'
            - 'Red Hat Ansible Minimal EE - Ansible Core 2.16 (RHEL 8)'
            - 'Red Hat Ansible Minimal EE - Ansible Core 2.16 (RHEL 9)'${values.customBaseImage?.trim() ? `\n            - '${values.customBaseImage}'` : ''}
          ui:field: BaseImagePicker
      dependencies:
        baseImage:
          oneOf:
            # Case 1: When "Custom Image" is selected
            - properties:
                baseImage:
                  const: 'custom'
                customBaseImage:
                  title: Custom Base Image
                  type: string
                  description: Enter a custom execution environment base image
                  ui:
                    field: EntityNamePicker
                    options:
                    allowArbitraryValues: true
                    help: 'Format: [registry[:port]/][namespace/]name[:tag]'
                    placeholder: 'e.g., quay.io/org/custom-ee:latest'
              required:
                - customBaseImage

            # Case 2: When any predefined base image is selected
            - properties:
                baseImage:
                  not:
                    const: 'custom'

    # Step 2: Ansible Collections
    - title: Collections
      description: Add collections to be included in your execution environment definition file (optional).
      properties:
        popularCollections:
          title: Add Popular Collections
          type: array
          items:
            type: string
            enum:
              - 'community.general'
              - 'ansible.posix'
              - 'ansible.windows'
              - 'ansible.utils'
              - 'amazon.aws'
              - 'azure.azcollection'
              - 'google.cloud'
              - 'amazon.ai'
              - 'cisco.ios'
              - 'cisco.nxos'
              - 'arista.eos'
              - 'cisco.iosxr'
          uniqueItems: true
          ui:widget: checkboxes
          ui:options:
            layout: horizontal
        collections:
          title: Ansible Collections
          type: array
          default: ${collectionsJson}
          description: Add collections manually
          items:
            type: object
            properties:
              name:
                type: string
                title: Collection Name
                description: The name or source of the collection.
                ui:placeholder: 'e.g., amazon.aws, https://github.com/ansible-collections/cisco.ios'
              version:
                type: string
                title: Version (Optional)
                description: |
                  The version of the collection to install.
                  If not specified, the latest version will be installed.
                ui:placeholder: 'e.g., 7.2.1'
              source:
                type: string
                title: Source (Optional)
                description: |
                  The Galaxy URL to pull the collection from.
                  If type is 'file', 'dir', or 'subdirs', this should be a local path to the collection.
              type:
                type: string
                title: Type (Optional)
                description: Determines the source of the collection.
                enum:
                  - 'file'
                  - 'galaxy'
                  - 'git'
                  - 'url'
                  - 'dir'
                  - 'subdirs'
              signatures:
                type: array
                title: Signatures (Optional)
                description: |
                  A list of signature sources that are used to supplement those found on the Galaxy server during collection installation and ansible-galaxy collection verify.
                  Signature sources should be URIs that contain the detached signature.
                items:
                  type: string
                  title: Signature
                  description: URI of the signature file
          ui:field: CollectionsPicker
        collectionsFile:
          title: Upload a requirements.yml file
          description: Optionally upload a requirements file with collection details
          type: string
          format: data-url
          ui:field: FileUploadPicker
        specifyRequirements:
          title: Specify additional Python requirements and System packages
          type: boolean
          default: false
          ui:help: "Check this box to define additional Python or system dependencies to include in your EE."
      dependencies:
        specifyRequirements:
          oneOf:
            - properties:
                specifyRequirements:
                  const: true
                pythonRequirements:
                  title: Additional Python Requirements
                  type: array
                  default: ${requirementsJson}
                  description: |
                    Specify additional python packages that are required in addition to what the selected collections already specify as dependencies.
                    Packages already specified in the collections as a dependency should not be repeated here.
                  items:
                    type: string
                    title: Python package
                    description: Python package (with optional version specification)
                    ui:placeholder: 'e.g., requests>=2.28.0'
                  ui:field: PackagesPicker
                pythonRequirementsFile:
                  type: string
                  format: data-url
                  title: Pick a file with Python requirements
                  description: Upload a requirements.txt file with python package details
                  ui:field: FileUploadPicker
                systemPackages:
                  title: Additional System Packages
                  type: array
                  default: ${packagesJson}
                  description: |
                    Specify additional system-level packages that are required in addition to what the selected collections already specify as dependencies.
                    Packages already specified in the collections as a dependency should not be repeated here.
                  items:
                    type: string
                    title: System package
                    description: System package
                    ui:placeholder: 'e.g., libxml2-dev [platform:dpkg], libssh-devel [platform:rpm]'
                  ui:field: PackagesPicker
                systemPackagesFile:
                  type: string
                  format: data-url
                  title: Pick a file with system packages
                  description: Upload a bindep.txt file with system package details
                  ui:field: FileUploadPicker
            - properties:
                specifyRequirements:
                  const: false

    # Step 3: MCP servers
    - title: MCP servers
      description: Add MCP servers to be installed in the execution environment definition file (optional).
      properties:
        mcpServers:
          title: MCP Servers
          type: array
          default: ${mcpServersJson}
          items:
            type: string
            title: MCP Server
            enum:
              - aws_ccapi_mcp
              - aws_cdk_mcp
              - aws_core_mcp
              - aws_iam_mcp
              - azure_mcp
              - github_mcp
            enumNames:
              - AWS CCAPI
              - AWS CDK
              - AWS Core
              - AWS IAM
              - Azure
              - GitHub
          ui:field: MCPServersPicker

    # Step 4: Additional Build Steps
    - title: Additional Build Steps
      description: Add custom build steps that will be executed at specific points during the build process. These map to ansible-builder's additional_build_steps configuration.
      properties:
        additionalBuildSteps:
          title: Additional Build Steps
          type: array
          default: ${buildStepsJson}
          items:
            type: object
            properties:
              stepType:
                title: Step Type
                type: string
                description: When this build step should execute
                enum:
                  - 'prepend_base'
                  - 'append_base'
                  - 'prepend_galaxy'
                  - 'append_galaxy'
                  - 'prepend_builder'
                  - 'append_builder'
                  - 'prepend_final'
                  - 'append_final'
                enumNames:
                  - 'Prepend Base - Before base image dependencies'
                  - 'Append Base - After base image dependencies'
                  - 'Prepend Galaxy - Before Ansible collections'
                  - 'Append Galaxy - After Ansible collections'
                  - 'Prepend Builder - Before main build steps'
                  - 'Append Builder - After main build steps'
                  - 'Prepend Final - Before final image steps'
                  - 'Append Final - After final image steps'
                default: 'prepend_base'
              commands:
                title: Commands
                type: array
                description: List of commands to execute
                items:
                  type: string
            required: ['stepType', 'commands']
          ui:field: AdditionalBuildStepsPicker

    # Step 9: Repository Configuration
    - title: Generate and publish
      description: Generate and publish the EE definition file and template.
      properties:
        eeFileName:
          title: EE File Name
          type: string
          description: Name of the Execution Environment file.
          ui:field: EEFileNamePicker
          ui:help: "Specify the filename for the Execution Environment definition file."
        templateDescription:
          title: Description
          type: string
          description: |
            Description for the generated Execution Environment definition.
            This description is used when displaying the Execution Environment definition in the catalog.
            Additionally, this description is also used in the Software Template that is generated with SCM-based publishing.
        tags:
          title: Tags
          description: |
            Add tags to make this EE definition discoverable in the catalog.
            The default execution-environment tag identifies this as an EE component; keeping it is highly recommended
          type: array
          default:
            - 'execution-environment'
          items:
            type: string
          ui:
            options:
              addable: true
              orderable: true
              removable: true
            help: "Add one or more tags for the generated template."
        publishToSCM:
          title: Publish to a Git repository
          description: Publish the EE definition file and template to a Git repository.
          type: boolean
          default: true
          ui:help: "If unchecked, the EE definition file and template will not be pushed to a Git repository. Regardless of your selection, you will get a link to download the files locally."
      required:
        - eeFileName
        - templateDescription
      dependencies:
        publishToSCM:
          oneOf:
            - properties:
                publishToSCM:
                  const: true
                sourceControlProvider:
                  title: Select source control provider
                  description: Choose your source control provider
                  type: string
                  enum:
                    - Github
                    - Gitlab
                  ui:
                    component: select
                    help: Select the source control provider to publish the EE definition files to.
                repositoryOwner:
                  title: Git repository organization or username
                  type: string
                  description: The organization or username that owns the Git repository.
                repositoryName:
                  title: Repository Name
                  type: string
                  description: Specify the name of the repository where the EE definition files will be published.
                createNewRepository:
                  title: Create new repository
                  type: boolean
                  description: Create a new repository, if the specified one does not exist.
                  default: false
                  ui:help: "If unchecked, a new repository will not be created if the specified one does not exist. The generated files will not be published to a repository."
              required:
                - sourceControlProvider
                - repositoryOwner
                - repositoryName
                - createNewRepository
            - properties:
                publishToSCM:
                  const: false

  steps:
    # Step 1: Create EE definition files
    - id: create-ee-definition
      name: Create Execution Environment Definition
      action: ansible:create:ee-definition
      input:
        values:
          eeFileName: \${{ parameters.eeFileName }}
          eeDescription: \${{ parameters.templateDescription }}
          tags: \${{ parameters.tags or [] }}
          publishToSCM: \${{ parameters.publishToSCM }}
          baseImage: \${{ parameters.baseImage === 'custom' and parameters.customBaseImage or parameters.baseImage }}
          customBaseImage: \${{ parameters.customBaseImage or '' }}
          popularCollections: \${{ parameters.popularCollections or [] }}
          collections: \${{ parameters.collections or [] }}
          collectionsFile: \${{ parameters.collectionsFile or [] }}
          pythonRequirements: \${{ parameters.pythonRequirements or [] }}
          pythonRequirementsFile: \${{ parameters.pythonRequirementsFile or [] }}
          systemPackages: \${{ parameters.systemPackages or [] }}
          systemPackagesFile: \${{ parameters.systemPackagesFile or [] }}
          mcpServers: \${{ parameters.mcpServers or [] }}
          additionalBuildSteps: \${{ parameters.additionalBuildSteps or [] }}

    # Step 3: Validate the SCM repository (optional)
    - id: prepare-publish
      action: ansible:prepare:publish
      name: Prepare for publishing
      if: \${{ parameters.publishToSCM }}
      input:
        sourceControlProvider: \${{ parameters.sourceControlProvider }}
        repositoryOwner: \${{ parameters.repositoryOwner }}
        repositoryName: \${{ parameters.repositoryName }}
        createNewRepository: \${{ parameters.createNewRepository }}
        eeFileName: \${{ parameters.eeFileName }}
        contextDirName: \${{ steps['create-ee-definition'].output.contextDirName }}

    - id: create-catalog-info-file
      action: catalog:write
      if: \${{ parameters.publishToSCM }}
      name: Create catalog component file for the EE Definition
      input:
        filePath: \${{ steps['create-ee-definition'].output.catalogInfoPath }}
        entity:
          apiVersion: backstage.io/v1alpha1
          kind: Component
          metadata:
            name: \${{ parameters.eeFileName }}
            description: \${{ parameters.templateDescription }}
            tags: \${{ parameters.tags or [] }}
            annotations:
              backstage.io/techdocs-ref: dir:.
              backstage.io/managed-by-location: \${{ steps['prepare-publish'].output.generatedRepoUrl }}
              ansible.io/scm-provider: \${{ parameters.sourceControlProvider }}
          spec:
            type: execution-environment
            owner: \${{ steps['create-ee-definition'].output.owner }}
            lifecycle: production

    # Step 5: Create and publish to a new GitHub Repository
    - id: publish-github
      name: Create and publish to a new GitHub Repository
      action: publish:github
      if: \${{ (parameters.publishToSCM) and (steps['prepare-publish'].output.createNewRepo) and (parameters.sourceControlProvider == 'Github') }}
      input:
        description: \${{ parameters.templateDescription }}
        repoUrl: \${{ steps['prepare-publish'].output.generatedRepoUrl }}
        defaultBranch: 'main'
        repoVisibility: 'public'

    # Step 5: Create and publish to a new Gitlab Repository
    - id: publish-gitlab
      name: Create and publish to a new GitLab Repository
      action: publish:gitlab
      if: \${{ (parameters.publishToSCM) and (steps['prepare-publish'].output.createNewRepo) and parameters.sourceControlProvider == 'Gitlab' }}
      input:
        repoUrl: \${{ steps['prepare-publish'].output.generatedRepoUrl }}
        defaultBranch: 'main'
        repoVisibility: 'public'

    # Step 5: Publish generated files as a Github Pull Request
    - id: publish-github-pull-request
      name: Publish generated files as a Github Pull Request
      action: publish:github:pull-request
      if: \${{ parameters.publishToSCM and (not steps['prepare-publish'].output.createNewRepo) and (parameters.sourceControlProvider == 'Github') }}
      input:
        repoUrl: \${{ steps['prepare-publish'].output.generatedRepoUrl }}
        branchName: \${{ steps['prepare-publish'].output.generatedBranchName }}
        title: \${{ steps['prepare-publish'].output.generatedTitle }}
        description: \${{ steps['prepare-publish'].output.generatedDescription }}

    # Step 5: Publish generated files as a Gitlab Merge Request
    - id: publish-gitlab-merge-request
      name: Publish generated files as a Gitlab Merge Request
      action: publish:gitlab:merge-request
      if: \${{ parameters.publishToSCM and (not steps['prepare-publish'].output.createNewRepo) and (parameters.sourceControlProvider == 'Gitlab') }}
      input:
        repoUrl: \${{ steps['prepare-publish'].output.generatedRepoUrl }}
        branchName: \${{ steps['prepare-publish'].output.generatedBranchName }}
        title: \${{ steps['prepare-publish'].output.generatedTitle }}
        description: \${{ steps['prepare-publish'].output.generatedDescription }}

    - id: register-catalog-component
      name: Register published EE as a Catalog Component
      action: catalog:register
      if: \${{ parameters.publishToSCM }}
      input:
        catalogInfoUrl: \${{ steps['prepare-publish'].output.generatedCatalogInfoUrl }}
        optional: true

  output:
    text:
      - title: Next Steps
        content: |
          \${{ steps['create-ee-definition'].output.readmeContent }}
    links:
      - title: \${{ parameters.sourceControlProvider }} Repository
        url: \${{ steps['prepare-publish'].output.generatedFullRepoUrl }}
        if: \${{ (parameters.publishToSCM) and (steps['prepare-publish'].output.createNewRepo) }}
        icon: \${{ parameters.sourceControlProvider | lower }}

      - title: GitHub Pull Request
        url: \${{ steps['publish-github-pull-request'].output.remoteUrl }}
        if: \${{ (parameters.publishToSCM) and (not steps['prepare-publish'].output.createNewRepo) and (parameters.sourceControlProvider == 'Github') }}
        icon: github

      - title: GitLab Merge Request
        url: \${{ steps['publish-gitlab-merge-request'].output.mergeRequestUrl  }}
      if: \${{ (parameters.publishToSCM) and (not steps['prepare-publish'].output.createNewRepo) and (parameters.sourceControlProvider == 'Gitlab') }}

      - title: View details in catalog
        icon: catalog
        url: \${{ steps['create-ee-definition'].output.generatedEntityRef }}
        if: \${{ not (steps['publish-github-pull-request'].output.remoteUrl or steps['publish-gitlab-merge-request'].output.mergeRequestUrl) }}
`;
}

function generateAnsibleConfigContent(): string {
  return `[galaxy]
server_list=automation_hub_published, automation_hub_validated, release_galaxy

[galaxy_server.release_galaxy]
url=https://galaxy.ansible.com/

[galaxy_server.automation_hub_published]
url=https://console.redhat.com/api/automation-hub/content/published/
auth_url=https://sso.redhat.com/auth/realms/redhat-external/protocol/openid-connect/token
# Add the token for the automation hub published server
token=

[galaxy_server.automation_hub_validated]
url=https://console.redhat.com/api/automation-hub/content/validated/
auth_url=https://sso.redhat.com/auth/realms/redhat-external/protocol/openid-connect/token
# Add the token for the automation hub validated server
token=
`;
}

function generateEECatalogEntity(
  componentName: string,
  description: string,
  tags: string[],
  owner: string,
  eeDefinitionContent: string,
  readmeContent: string,
  mcpVarsContent: string,
  ansibleConfigContent: string,
  eeTemplateContent: string,
) {
  const catalogEntity: any = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: componentName,
      title: componentName,
      description: description,
      tags: tags,
      annotations: {
        'backstage.io/managed-by-location': `url:127.0.0.1`,
        'backstage.io/managed-by-origin-location': `url:127.0.0.1`,
        'ansible.io/download-experience': 'true',
      },
    },
    spec: {
      type: 'execution-environment',
      lifecycle: 'production',
      owner: owner,
      definition: eeDefinitionContent,
      template: eeTemplateContent,
      readme: readmeContent,
      ansible_cfg: ansibleConfigContent,
    },
  };

  if (mcpVarsContent !== '') {
    catalogEntity.spec.mcp_vars = mcpVarsContent;
  }
  return catalogEntity;
}

function mergeCollections(
  collections: Collection[],
  popularCollections: string[],
  parsedCollections: Array<Record<string, any>>,
): Collection[] {
  const collectionsRequirements: Collection[] = [];

  // Add individual collections
  if (collections) {
    collectionsRequirements.push(...collections);
  }

  // Add popular collections (convert string names to Collection objects)
  if (popularCollections) {
    const popularCollectionObjects = popularCollections.map(name => ({ name }));
    collectionsRequirements.push(...popularCollectionObjects);
  }

  // Add content from uploaded collection requirements file
  if (parsedCollections && Array.isArray(parsedCollections)) {
    parsedCollections.forEach(item => {
      if (item && typeof item === 'object' && 'name' in item) {
        collectionsRequirements.push(item as Collection);
      }
    });
  }

  // Remove duplicates based on collection name
  const uniqueCollections = Object.values(
    collectionsRequirements.reduce<Record<string, Collection>>((acc, curr) => {
      const existing = acc[curr.name];

      // If nothing stored yet, take current
      if (!existing) {
        acc[curr.name] = curr;
        return acc;
      }

      // Rule 1: Any entry without version wins immediately (no comparison needed)
      // the most recent version will automatically be pulled from AH/Galaxy
      if (!existing.version) {
        return acc; // existing stays
      }

      // if the current entry has no version, it wins
      // discarding the other ones
      if (!curr.version) {
        acc[curr.name] = curr; // curr wins due to no version
        return acc;
      }

      // Rule 2: Compare semantic versions, keep higher
      if (semver.gt(curr.version, existing.version)) {
        acc[curr.name] = curr;
      }

      return acc;
    }, {}),
  );

  return uniqueCollections;
}

function mergeRequirements(
  pythonRequirements: string[],
  parsedPythonRequirements: string[],
): string[] {
  const requirements: string[] = [];

  // Add individual requirements
  if (pythonRequirements) {
    requirements.push(...pythonRequirements);
  }

  // Add content from uploaded Python requirements file
  if (parsedPythonRequirements) {
    requirements.push(...parsedPythonRequirements);
  }

  // Remove duplicates
  return Array.from(new Set(requirements));
}

function mergePackages(
  systemPackages: string[],
  parsedSystemPackages: string[],
): string[] {
  const packages: string[] = [];

  // Add individual packages
  if (systemPackages) {
    packages.push(...systemPackages);
  }

  // Add content from uploaded Python requirements file
  if (parsedSystemPackages) {
    packages.push(...parsedSystemPackages);
  }

  // Remove duplicates
  return Array.from(new Set(packages));
}

function parseTextRequirementsFile(decodedContent: string): string[] {
  let parsedRequirements: string[] = [];
  try {
    if (decodedContent) {
      parsedRequirements = decodedContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'));
    }
  } catch (error: any) {
    throw new Error(
      `Failed to parse Python requirements file: ${error.message}`,
    );
  }
  return parsedRequirements;
}

function parseCollectionsFile(decodedCollectionsContent: string): Collection[] {
  if (!decodedCollectionsContent?.trim()) {
    return [];
  }

  try {
    const parsedYaml = yaml.load(decodedCollectionsContent.trim());

    const validated = CollectionRequirementsSchema.parse(parsedYaml);

    return validated.collections;
  } catch (err: any) {
    // this will result from the content not conforming to the schema defined above
    if (err instanceof z.ZodError) {
      throw new Error(
        `Invalid collections file structure:\n${err.issues.map(e => `- ${e.path.join('.')}: ${e.message}`).join('\n')}`,
      );
    }

    // this will result from the content not being valid YAML or any other error
    throw new Error(`Failed to parse collections file: ${err.message}`);
  }
}

function generateMCPBuilderSteps(
  mcpServers: string[],
  parsedCollections: Collection[],
  additionalBuildSteps: AdditionalBuildStep[],
) {
  // If mcpServers are specified, add them to the collections list
  // and add the MCP install playbook command to the additional build steps
  const mcpInstallCmd = `RUN ansible-playbook ansible.mcp_builder.install_mcp -e mcp_servers=${mcpServers.join(',')} -e @/tmp/mcp-vars.yaml`;

  parsedCollections.push(
    { name: 'ansible.mcp_builder' },
    { name: 'ansible.mcp' },
  );

  // Find if there's already a step with stepType 'append_final'
  const appendFinalStep = additionalBuildSteps.find(
    step => step.stepType === 'append_final',
  );

  if (appendFinalStep) {
    // If found, add the MCP install playbook command to its commands array as the first command
    appendFinalStep.commands.unshift(mcpInstallCmd);
  } else {
    // Otherwise, create a new step entry
    additionalBuildSteps.push({
      stepType: 'append_final',
      commands: [mcpInstallCmd],
    });
  }
}

function modifyAdditionalBuildSteps(
  additionalBuildSteps: AdditionalBuildStep[],
  mcpServers: string[],
) {
  // the ansible.cfg step is mandatory
  const prependBaseStepCommands: string[] = [
    'COPY _build/configs/ansible.cfg /etc/ansible/ansible.cfg',
  ];
  let appendFinalStepCommands: string = 'RUN rm -f /etc/ansible/ansible.cfg';

  if (mcpServers.length > 0) {
    // the mcp-vars.yaml step is required only if MCP servers are specified
    prependBaseStepCommands.push(
      'COPY _build/configs/mcp-vars.yaml /tmp/mcp-vars.yaml',
    );
    // remove the mcp-vars.yaml file after the build only if MCP servers are specified
    appendFinalStepCommands += ' /tmp/mcp-vars.yaml';
  }

  // Find if there's already a step with stepType 'prepend_base'
  const prependBaseStep = additionalBuildSteps.find(
    step => step.stepType === 'prepend_base',
  );

  if (prependBaseStep) {
    // If found, add the MCP install playbook command to its commands array
    prependBaseStep.commands.push(...prependBaseStepCommands);
  } else {
    // Otherwise, create a new step entry
    additionalBuildSteps.push({
      stepType: 'prepend_base',
      commands: prependBaseStepCommands,
    });
  }

  // Find if there's already a step with stepType 'append_final'
  const appendFinalStep = additionalBuildSteps.find(
    step => step.stepType === 'append_final',
  );

  if (appendFinalStep) {
    // If found, add the MCP install playbook command to its commands array
    appendFinalStep.commands.push(appendFinalStepCommands);
  } else {
    // Otherwise, create a new step entry
    additionalBuildSteps.push({
      stepType: 'append_final',
      commands: [appendFinalStepCommands],
    });
  }
}

function generateMCPVarsContent(mcpServers: string[]): string {
  // this does not need to be explicitly installed
  // but it's vars should be included in the MCP vars file
  mcpServers.push('common');

  // Filter sections matching roles
  const filtered = MCPSERVER_VARS.filter((entry: any) =>
    mcpServers.includes(entry.role),
  );

  // Build final YAML string
  let output: string = '---\n';

  for (const entry of filtered) {
    // Dump only the "vars" section (if it exists and is not empty)
    if (entry.vars && Object.keys(entry.vars).length > 0) {
      output += `# vars for ${entry.role}\n`;
      const varsYaml = yaml.dump(entry.vars);
      // Indentation safety: yaml.dump already returns valid YAML
      // yaml.dump adds a trailing newline, so we append it directly
      output += varsYaml;
      output += '\n';
    }
  }
  // drop common from the list of MCP servers
  // it was only added to get it's vars
  mcpServers.pop();

  // Ensure exactly one trailing newline (yaml.dump already adds one, but trim to be safe)
  return `${output.trimEnd()}\n`;
}

function validateEEDefinition(eeDefinition: string): boolean {
  if (!eeDefinition?.trim()) {
    throw new Error('EE definition content is empty');
  }

  // load the generated EE definition YAML content
  let parsed: {};
  try {
    parsed = yaml.load(eeDefinition.trim()) as {};
  } catch (e: any) {
    throw new Error(
      `Invalid YAML syntax in the generated EE definition: ${e.message}`,
    );
  }

  // validate the generated EE definition YAML content against the schema
  try {
    EEDefinitionSchema.parse(parsed);
    return true;
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      const formatted = e.issues
        .map(err => `- ${err.path.join('.')}: ${err.message}`)
        .join('\n');

      throw new Error(
        `Schema validation failed for the generated EE definition:\n${formatted}`,
      );
    }

    throw new Error(
      `Unknown error validating the generated EE definition: ${e.message}`,
    );
  }
}
