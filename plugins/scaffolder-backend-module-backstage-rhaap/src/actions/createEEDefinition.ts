import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import * as fs from 'fs-extra';
import * as path from 'path';
import yaml from 'js-yaml';
import semver from 'semver';

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
}

export function createEEDefinitionAction() {
  return createTemplateAction({
    id: 'ansible:ee:create-definition',
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
              baseImage: {
                title: 'Base Image',
                description:
                  'Container base image for the execution environment',
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
          collections: {
            title: 'Collections',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                },
                version: {
                  type: 'string',
                },
              },
            },
          },
          pythonRequirements: {
            title: 'Python Requirements',
            type: 'array',
            items: {
              type: 'string',
            },
          },
          systemPackages: {
            title: 'System Packages',
            type: 'array',
            items: {
              type: 'string',
            },
          },
          contextDirName: {
            title: 'Directory in the workspace where the files will created',
            type: 'string',
          },
          buildCommand: {
            title: 'Ansible Builder Command',
            type: 'string',
          },
          eeDefinitionContent: {
            title: 'EE Definition Content',
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
      const collections = values.collections || [];
      const popularCollections = values.popularCollections || [];
      const collectionsFile = values.collectionsFile || '';
      const pythonRequirements = values.pythonRequirements || [];
      const pythonRequirementsFile = values.pythonRequirementsFile || '';
      const systemPackages = values.systemPackages || [];
      const systemPackagesFile = values.systemPackagesFile || '';
      const mcpServers = values.mcpServers || [];
      const additionalBuildSteps = values.additionalBuildSteps || [];

      // each EE created in a repository should be self contained in its own directory
      const contextDirName = (values.eeFileName || 'execution-environment')
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-');
      ctx.output('contextDirName', contextDirName);

      // create the directory path for the EE files
      const eeDir = path.join(workspacePath, contextDirName);
      // Ensure the directory exists (recursively)
      await fs.ensureDir(eeDir);

      // create the path for the EE definition file
      const eeDefinitionPath = path.join(eeDir, `${values.eeFileName}.yaml`);
      // create the path for the README file
      const readmePath = path.join(eeDir, 'README.md');

      // create docs directory for techdocs
      const docsDir = path.join(eeDir, 'docs');
      await fs.ensureDir(docsDir);

      // symlink the README file to the docs directory so that techdocs can pick it up
      const docsMdPath = path.join(docsDir, 'index.md');

      const baseImage = values.baseImage;
      logger.info(`[ansible:ee:create-definition] EE base image: ${baseImage}`);

      const decodedCollectionsContent = parseDataUrl(collectionsFile);
      const decodedPythonRequirementsContent = parseDataUrl(
        pythonRequirementsFile,
      );
      const decodedSystemPackagesContent = parseDataUrl(systemPackagesFile);

      const parsedCollections = parseCollectionsFile(decodedCollectionsContent);
      logger.info(
        `[ansible:ee:create-definition] parsedCollections: ${JSON.stringify(parsedCollections)}`,
      );
      const parsedPythonRequirements = parseTextRequirementsFile(
        decodedPythonRequirementsContent,
      );
      const parsedSystemPackages = parseTextRequirementsFile(
        decodedSystemPackagesContent,
      );

      // If mcpServers are specified, add them to the collections list
      // and add the MCP install playbook command to the additional build steps
      if (mcpServers.length > 0) {
        let mcpInstallCmd =
          'RUN ansible-playbook ansible.mcp_builder.install_mcp -e mcp_servers=' +
          mcpServers.map(s => `${s.toLowerCase()}_mcp`).join(',');

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

        // Set merged values as output variable for using when building the EE template
        ctx.output('collections', JSON.stringify(allCollections));
        ctx.output('pythonRequirements', JSON.stringify(allRequirements));
        ctx.output('systemPackages', JSON.stringify(allPackages));
        ctx.output(
          'additionalBuildSteps',
          JSON.stringify(additionalBuildSteps),
        );

        logger.info(
          `[ansible:ee:create-definition] collections: ${JSON.stringify(allCollections)}`,
        );
        logger.info(
          `[ansible:ee:create-definition] pythonRequirements: ${JSON.stringify(allRequirements)}`,
        );
        logger.info(
          `[ansible:ee:create-definition] systemPackages: ${JSON.stringify(allPackages)}`,
        );
        logger.info(
          `[ansible:ee:create-definition] additionalBuildSteps: ${JSON.stringify(additionalBuildSteps)}`,
        );

        // Create merged values object
        const mergedValues = {
          ...values,
          collections: allCollections,
          pythonRequirements: allRequirements,
          systemPackages: allPackages,
        };

        // Generate EE definition file
        const eeDefinition = generateEEDefinition(mergedValues);

        await fs.writeFile(eeDefinitionPath, eeDefinition);
        logger.info(
          `[ansible:ee:create-definition] created EE definition file ${values.eeFileName}.yaml at ${eeDefinitionPath}`,
        );
        ctx.output('eeDefinitionContent', eeDefinition);

        // Generate README with instructions
        const readmeContent = generateReadme(mergedValues);
        await fs.writeFile(readmePath, readmeContent);
        logger.info(
          `[ansible:ee:create-definition] created README.md at ${readmePath}`,
        );
        ctx.output('readmeContent', readmeContent);

        // write README contents to docs/index.md
        await fs.writeFile(docsMdPath, readmeContent);
        logger.info(
          `[ansible:ee:create-definition] created docs/index.md from README.md at ${docsMdPath}`,
        );

        logger.info(
          '[ansible:ee:create-definition] successfully created all Execution Environment files',
        );
      } catch (error: any) {
        logger.error(
          `[ansible:ee:create-definition] error creating EE definition files: ${error.message}`,
        );
        throw new Error(
          `[ansible:ee:create-definition] Failed to create EE definition files: ${error.message}`,
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

    if (dependenciesContent.length > 0) {
      dependenciesContent = `dependencies:${dependenciesContent}`;
    }
  }

  let content = `---
version: 3

images:
  base_image:
    name: '${values.baseImage}'

${dependenciesContent}`;

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

  content += '\n';
  return content;
}

function generateReadme(values: EEDefinitionInput): string {
  const collections = values.collections || [];
  const requirements = values.pythonRequirements || [];
  const packages = values.systemPackages || [];
  const mcpServers = values.mcpServers || [];

  return `# Ansible Execution Environment Definition

This directory contains the definition file for an Ansible Execution Environment.

## Files Generated

- \`${values.eeFileName}.yaml\` - The Execution Environment definition file
- \`template.yaml\` - The software template for Ansible Portal that allows reusing this Execution Environment definition file to create custom ones.
- \`catalog-info.yaml\` - The Catalog Entity Descriptor file that allows registering this Execution Environment as a catalog component in Ansible Portal.

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
\`\`\`\n

To include an \`ansible.cfg\` file in your execution environment build specifying additional configuration such as Automation Hub settings, please add the following sections to the generated Execution Environment definition file:

\`\`\`yaml
additional_build_files:
  - src: /path-to/ansible.cfg
    dest: configs

additional_build_steps:
  prepend_galaxy:
    - COPY _build/configs/ansible.cfg /etc/ansible/ansible.cfg
\`\`\`

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
2. Container Runtime: [Podman](https://www.redhat.com/en/topics/containers/what-is-podman)(recommended) or [Docker](https://www.docker.com/)

### Step 2: Build the Execution Environment

1. Clone the repository and navigate to this directory.

2. Run the following command to build the Execution Environment:
\`\`\`bash
ansible-builder build --file \${values.eeFileName}.yaml\ --tag ${values.eeFileName}:latest --container-runtime podman
\`\`\`

Please update the tag (specified after the \`--tag\` flag) to the desired tag for the built image and
the container runtime (specified after the \`--container-runtime\` flag) to the installed container runtime.

The \`ansible-builder\` CLI supports passing build-time arguments to the container runtime,
use the \`--build-arg\` flag to pass these arguments.

For the full list of supported flags, refer to the
[ansible-builder reference for \`build arguments\`](https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform/2.6/html/creating_and_using_execution_environments/assembly-using-builder)

### Step 3: Using the Execution Environment locally

1. Install [\`ansible-navigator\`](https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform/2.0-ea/html-single/ansible_navigator_creator_guide/index) using the following command:
\`\`\`bash
pip install ansible-navigator
\`\`\`

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

function parseDataUrl(dataUrl: string): string {
  // Start parsing of collections file content
  let decodedContent = '';

  if (typeof dataUrl === 'string' && dataUrl.includes('base64,')) {
    const matches = dataUrl.match(/^data:(.*?);base64,(.*)$/);
    if (!matches) {
      throw new Error('Invalid data URL format for the file uploaded');
    }
    const base64Data = matches[2];
    try {
      decodedContent = Buffer.from(base64Data, 'base64')
        .toString('utf-8')
        .trim();
    } catch (error: any) {
      throw new Error(`Failed to parse data URL: ${error.message}`);
    }
  }
  return decodedContent;
}

function parseCollectionsFile(decodedCollectionsContent: string): Collection[] {
  let parsedCollections: Collection[] = [];
  try {
    // a correct requirements.yml file will have a collections key
    // if it does not, we raise an error
    if (decodedCollectionsContent) {
      const parsed = yaml.load(decodedCollectionsContent.trim()) as {
        collections: Collection[];
      };
      if (parsed) {
        parsedCollections = parsed.collections as Collection[];
      }
    }
  } catch (error: any) {
    throw new Error(`Failed to parse collections file: ${error.message}`);
  }
  return parsedCollections;
}

function parseTextRequirementsFile(decodedContent: string): string[] {
  let parsedRequirements: string[] = [];
  try {
    if (decodedContent) {
      parsedRequirements = decodedContent.split('\n').map(line => line.trim());
    }
  } catch (error: any) {
    throw new Error(
      `Failed to parse Python requirements file: ${error.message}`,
    );
  }
  return parsedRequirements;
}
