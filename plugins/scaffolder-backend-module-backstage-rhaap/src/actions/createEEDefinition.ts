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
  sourceControlProvider?: string;
  repositoryOwner?: string;
  repositoryName?: string;
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
            required: ['baseImage', 'eeFileName'],
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
              sourceControlProvider: {
                title: 'Source Control Provider',
                description:
                  'Source control provider to use for the execution environment',
                type: 'string',
              },
              repositoryOwner: {
                title: 'Repository Owner',
                description:
                  'Owner of the repository to publish the execution environment definition files to',
                type: 'string',
              },
              repositoryName: {
                title: 'Repository Name',
                description:
                  'Name of the repository to publish the execution environment definition files to',
                type: 'string',
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
      const owner = ctx.user?.ref || '';
      const repositoryName = values.repositoryName || '';

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

      // generate MCP builder steps
      // if any MCP servers are specified, we need to add the ansible.mcp ansible.mcp_builder collections
      // for that we use the parsedCollections list
      generateMCPBuilderSteps(
        mcpServers,
        parsedCollections,
        additionalBuildSteps,
      );

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
          values.publishToSCM,
          contextDirName,
          repositoryName,
        );
        await fs.writeFile(readmePath, readmeContent);
        logger.info(
          `[ansible:create:ee-definition] created README.md at ${readmePath}`,
        );
        ctx.output('readmeContent', readmeContent);

        // write README contents to docs/index.md
        await fs.writeFile(docsMdPath, readmeContent);
        logger.info(
          `[ansible:create:ee-definition] created docs/index.md from README.md at ${docsMdPath}`,
        );

        // perform the following only if the user has chosen to publish to a SCM repository
        if (values.publishToSCM) {
          const templatePath = path.join(eeDir, 'template.yaml');
          const eeTemplateContent = generateEETemplate(mergedValues);
          await fs.writeFile(templatePath, eeTemplateContent);
          logger.info(
            `[ansible:create:ee-definition created EE template.yaml at ${templatePath}`,
          );
          // generate catalog descriptor file path for the Execution Environment
          // this is only needed if the user has chosen to publish to a SCM repository
          // and we are creating a catalog-info.yaml file using the built-in `catalog:write` action
          const catalogInfoPath = path.join(eeDir, 'catalog-info.yaml');
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
          );
          // register the EE catalog entity with the catalog
          const response = await fetch(`${baseUrl}/aap/register_ee`, {
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

  // Add dependencies: prefix if any dependencies exist
  if (dependenciesContent.length > 0) {
    dependenciesContent = `dependencies:${dependenciesContent}`;
  }

  let content = `---
version: 3

images:
  base_image:
    name: '${values.baseImage}'

${dependenciesContent}`.trimEnd();

  // Add additional_build_steps if any are defined
  if (additionalBuildSteps.length > 0) {
    const buildStepsGroups: Record<string, string[]> = {};
    additionalBuildSteps.forEach(step => {
      if (!buildStepsGroups[step.stepType]) {
        buildStepsGroups[step.stepType] = [];
      }
      buildStepsGroups[step.stepType].push(...step.commands);
    });

    content += '\n\nadditional_build_steps:';
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
  publishToSCM: boolean,
  contextDirName: string,
  repositoryName: string,
): string {
  const collections = values.collections || [];
  const requirements = values.pythonRequirements || [];
  const packages = values.systemPackages || [];
  const mcpServers = values.mcpServers || [];

  return `# Ansible Execution Environment Definition

${
  publishToSCM
    ? 'This directory contains the definition file for an Ansible Execution Environment.'
    : ''
}

${publishToSCM ? `## Files Generated` : '## Files available for download'}

- \`${values.eeFileName}.yaml\` - The Execution Environment definition file.
${
  publishToSCM
    ? `- \`template.yaml\` - The software template for Ansible Portal that allows reusing this Execution Environment definition file to create custom ones.
- \`catalog-info.yaml\` - The Catalog Entity Descriptor file that allows registering this Execution Environment as a catalog component in Ansible Portal.
`
    : '- `README.md` - contains instructions on how to build and use the Execution Environment.'
}

## Configuration

### Base Image
- **Base Image**: \`${values.baseImage}\`

${
  collections.length > 0
    ? `### Ansible Collections (${collections.length})
\`\`\`yaml
${collections
  .map(c => {
    let collectionContent = `- name: ${c.name}`;
    if (c.version) {
      collectionContent += `\n  version: v${c.version}`;
    }
    return collectionContent;
  })
  .join('\n')}
`
    : ''
}${
    mcpServers.length > 0
      ? `### MCP Servers (${mcpServers.length})
${mcpServers.map(mcpServer => `- \`${mcpServer}\``).join('\n')}

`
      : ''
  }${
    requirements.length > 0
      ? `### Python Requirements (${requirements.length})
${requirements.map(req => `- \`${req}\``).join('\n')}

`
      : ''
  }${
    packages.length > 0
      ? `### System Packages (${packages.length})
${packages.map(pkg => `- \`${pkg}\``).join('\n')}

`
      : ''
  }## Next Steps: Build and Use the Execution Environment

### Step 1: Install Required Tools

To build this Execution Environment, you need to have the following tools installed:

1. [ansible-builder](https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform/2.6/html/creating_and_using_execution_environments/assembly-using-builder)
2. Container Engine: [Podman](https://podman.io/getting-started/installation) (recommended) or [Docker](https://docs.docker.com/engine/install/)

### Step 2: Build the Execution Environment

${
  publishToSCM
    ? `1. Clone the repository and navigate to this directory.

\`\`\`bash
git clone <repository URL>
cd ${{ repositoryName }}/${{ contextDirName }}
\`\`\`
`
    : `1. Download the Execution Environment definition file.`
}

2. Customize the Execution Environment definition file as needed.

\`\`\`\n

If one or more collections specified in your Execution Environment definition are to be pulled from Automation Hub (or a custom Galaxy server),
please ensure that those servers are configured in a \`ansible.cfg\` file and included in the EE build.
You can refer to this documentation for more details: [Configure Red Hat automation hub as the primary content source](https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform/2.4/html/getting_started_with_automation_hub/configure-hub-primary#proc-configure-automation-hub-server-cli)

For reference, here is an example of an \`ansible.cfg\` file that includes the Red Hat Automation Hub server:

\`\`\`yaml
[galaxy]
server_list = automation_hub

[galaxy_server.automation_hub]
url=https://console.redhat.com/api/automation-hub/content/published/
auth_url=https://sso.redhat.com/auth/realms/redhat-external/protocol/openid-connect/token
token=<SuperSecretToken>
\`\`\`

To include an \`ansible.cfg\` file in your execution environment build specifying additional configuration such as Automation Hub settings, please add the following sections to the generated Execution Environment definition file:

\`\`\`yaml
additional_build_files:
  - src: /path-to/ansible.cfg
    dest: configs

additional_build_steps:
  prepend_galaxy:
    - COPY _build/configs/ansible.cfg /etc/ansible/ansible.cfg
\`\`\`

3. Run the following command to build the Execution Environment:
\`\`\`bash
ansible-builder build --file ${values.eeFileName}.yaml --tag ${values.eeFileName}:latest --container-runtime podman
\`\`\`

Please update the tag (specified after the \`--tag\` flag) to the desired tag for the built image and
the container runtime (specified after the \`--container-runtime\` flag) to the installed container runtime.

The \`ansible-builder\` CLI supports passing build-time arguments to the container runtime,
use the \`--build-arg\` flag to pass these arguments.

For the full list of supported flags, refer to the
[ansible-builder reference for \`build arguments\`](https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform/2.6/html/creating_and_using_execution_environments/assembly-using-builder)


### Step 3: Using the Execution Environment locally

1. Install [\`ansible-navigator\`](https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform/2.6/html/using_content_navigator/assembly-intro-navigator_ansible-navigator):

\`ansible-navigator\` is a part of Ansible development tools. The can be installed on a container inside VS Code or from a package on RHEL.

Please refer to the following documentations for more details:

[Installing Ansible development tools on a container inside VS Code](https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform/2.6/html/using_content_navigator/installing-devtools#devtools-install-container_installing-devtools)

[Installing Ansible development tools from a package on RHEL](https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform/2.6/html/using_content_navigator/installing-devtools#devtools-install_installing-devtools)

2. Run your playbook with the built Execution Environment:
\`\`\`bash
ansible-navigator run playbook.yml --execution-environment-image ${values.eeFileName}:latest
\`\`\`

### Step 4: Using the Execution Environment with Ansible Automation Platform

1. The built Execution Environment image must be pushed to a container registry.

2. Tag your local image for the target registry (e.g., \`quay.io/your-username/${values.eeFileName}:latest\`).

\`\`\`bash
podman tag ${values.eeFileName}:latest quay.io/your-username/${values.eeFileName}:latest
\`\`\`

3. Push the tagged image to the target registry:

\`\`\`bash
podman push quay.io/your-username/${values.eeFileName}:latest
\`\`\`

4. Create a new Execution Environment in Ansible Automation Platform using the tagged image and add it to a job template.
 See the [Add a execution environment to a job template](https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform/2.6/html/using_automation_execution/assembly-controller-execution-environments) documentation for more details.
`;
}

function generateEETemplate(values: EEDefinitionInput): string {
  const collectionsJson = JSON.stringify(values.collections);
  const requirementsJson = JSON.stringify(values.pythonRequirements);
  const packagesJson = JSON.stringify(values.systemPackages);
  const buildStepsJson = JSON.stringify(values.additionalBuildSteps);
  const tagsJson = JSON.stringify(values.tags);
  const mcpServersJson = JSON.stringify(values.mcpServers);

  return `apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: ${values.eeFileName}
  title: ${values.eeFileName}
  description: ${values.eeDescription || 'Saved Ansible Execution Environment Definition template'}
  annotations:
    ansible.io/template-type: execution-environment
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
            - 'registry.access.redhat.com/ubi9/python-311:latest'
            - 'registry.redhat.io/ansible-automation-platform-25/ee-minimal-rhel9:latest'${values.customBaseImage?.trim() ? `\n            - '${values.customBaseImage}'` : ''}
          enumNames:
            - 'Red Hat Universal Base Image 9 w/ Python 3.11 (Recommended)'
            - 'Red Hat Ansible Minimal EE base (RHEL 9) (Requires subscription)'${values.customBaseImage?.trim() ? `\n            - '${values.customBaseImage}'` : ''}
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
              - 'ansible.posix'
              - 'community.general'
              - 'community.crypto'
              - 'ansible.windows'
              - 'community.kubernetes'
              - 'community.docker'
              - 'cisco.ios'
              - 'arista.eos'
              - 'amazon.aws'
              - 'azure.azcollection'
              - 'google.cloud'
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
                description: The name of the collection in namespace.collection format
                pattern: '^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$'
                ui:placeholder: 'e.g., community.general'
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
                ui:placeholder: 'e.g., https://github.com/ansible-collections/community.general'
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
              - Github
              - AWS
              - Azure
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
          title: Publish to a SCM repository
          description: Publish the EE definition file and template to a SCM repository.
          type: boolean
          default: true
          ui:help: "If unchecked, the EE definition file and template will not be pushed to a SCM repository. Regardless of your selection, you will get a link to download the files locally."
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
                  title: SCM repository organization or username
                  type: string
                  description: The organization or username that owns the SCM repository
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
          sourceControlProvider: \${{ parameters.sourceControlProvider }}
          repositoryOwner: \${{ parameters.repositoryOwner }}
          repositoryName: \${{ parameters.repositoryName }}

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

    text:
      - title: Next Steps
        content: |
          \${{ steps['create-ee-definition'].output.readmeContent }}
    `;
}

function generateEECatalogEntity(
  componentName: string,
  description: string,
  tags: string[],
  owner: string,
  eeDefinitionContent: string,
  readmeContent: string,
) {
  return {
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
      readme: readmeContent,
    },
  };
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
  if (mcpServers.length > 0) {
    const mcpInstallCmd = `RUN ansible-playbook ansible.mcp_builder.install_mcp -e mcp_servers=${mcpServers
      .map(s => `${s.toLowerCase()}_mcp`)
      .join(',')}`;

    parsedCollections.push(
      { name: 'ansible.mcp_builder' },
      { name: 'ansible.mcp' },
    );

    // Find if there's already a step with stepType 'append_builder'
    const appendBuilderStep = additionalBuildSteps.find(
      step => step.stepType === 'append_builder',
    );

    if (appendBuilderStep) {
      // If found, add the MCP install playbook command to its commands array
      appendBuilderStep.commands.push(mcpInstallCmd);
    } else {
      // Otherwise, create a new step entry
      additionalBuildSteps.push({
        stepType: 'append_builder',
        commands: [mcpInstallCmd],
      });
    }
    // Find if there's already a step with stepType 'append_builder'
    const appendFinalStep = additionalBuildSteps.find(
      step => step.stepType === 'append_final',
    );

    const appendFinalMCPCommand = 'COPY --from=builder /opt/mcp /opt/mcp';

    if (appendFinalStep) {
      // If found, add the MCP install playbook command to its commands array
      appendFinalStep.commands.push(appendFinalMCPCommand);
    } else {
      // Otherwise, create a new step entry
      additionalBuildSteps.push({
        stepType: 'append_final',
        commands: [appendFinalMCPCommand],
      });
    }
  }
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
