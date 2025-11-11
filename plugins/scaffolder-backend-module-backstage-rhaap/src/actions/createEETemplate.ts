import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import * as fs from 'fs/promises';
import * as path from 'path';

interface createEETemplateInput {
  contextDirName: string;
  collections: string;
  pythonRequirements: string;
  systemPackages: string;
  mcpServers: string[];
  additionalBuildSteps: string;
  tags: string[];
  templateDescription: string;
  baseImage: string;
  customBaseImage?: string;
  eeFileName: string;
}

/**
 * Saves an EE template configuration as a Template entity in the catalog database
 */
export function createEETemplateAction() {
  return createTemplateAction({
    id: 'ansible:ee:create-template',
    description:
      'Saves an Ansible EE template configuration as a Template entity in the catalog database',
    schema: {
      input: {
        type: 'object',
        required: ['values'],
        properties: {
          values: {
            type: 'object',
            properties: {
              contextDirName: {
                title:
                  'Directory in the workspace where the files will created',
                description:
                  'Name of the directory in the workspace where the files will created',
                type: 'string',
              },
              baseImage: {
                title: 'Base Image',
                description: 'Base image for the execution environment',
                type: 'string',
              },
              collections: {
                title: 'Collections',
                description:
                  'Collections to be included in the execution environment definition file',
                type: 'string',
              },
              pythonRequirements: {
                title: 'Python Requirements',
                description:
                  'Python requirements to be included in the execution environment definition file',
                type: 'string',
              },
              systemPackages: {
                title: 'System Packages',
                description:
                  'System packages to be included in the execution environment definition file',
                type: 'string',
              },
              mcpServers: {
                title: 'MCP Servers',
                description:
                  'MCP servers to be installed in the execution environment definition file',
                type: 'array',
                items: { type: 'string' },
              },
              additionalBuildSteps: {
                title: 'Additional Build Steps',
                description:
                  'Additional build steps to be executed at specific points during the build process',
                type: 'string',
              },
              tags: {
                title: 'Tags',
                description:
                  'Tags to be included in the execution environment definition file',
                type: 'array',
                items: { type: 'string' },
              },
              templateName: {
                title: 'Template Name',
                description: 'Name of the template',
                type: 'string',
              },
              templateDescription: {
                title: 'Template Description',
                description: 'Description for the saved template',
                type: 'string',
              },
            },
          },
        },
      },
      output: {
        type: 'object',
        properties: {
          templateContent: {
            title: 'Content of the generated template',
            type: 'string',
          },
        },
      },
    },
    async handler(ctx) {
      const { input, logger, workspacePath } = ctx;
      const values = input.values as unknown as createEETemplateInput;

      try {
        // Generate complete software template YAML
        const templateYaml = generateCompleteTemplate(values);

        // This directory should already exist from previous steps, but just in case
        const eeDir = path.join(workspacePath, values.contextDirName);
        await fs.mkdir(eeDir, { recursive: true });

        // Write the template file to workspace
        const templatePath = path.join(eeDir, 'template.yaml');
        await fs.writeFile(templatePath, templateYaml);

        ctx.output('templateContent', templateYaml);

        logger.info(`$Template created successfully!`);
      } catch (error: any) {
        throw new Error(`Failed when creating template.yaml: ${error.message}`);
      }
    },
  });
}

function generateCompleteTemplate(values: createEETemplateInput): string {
  const collectionsJson = values.collections;
  const requirementsJson = values.pythonRequirements;
  const packagesJson = values.systemPackages;
  const buildStepsJson = values.additionalBuildSteps;
  const tagsJson = JSON.stringify(values.tags);
  const mcpServersJson = JSON.stringify(values.mcpServers);

  return `apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: ${values.eeFileName}
  title: ${values.eeFileName}
  description: ${values.templateDescription || 'Saved Ansible Execution Environment Definition template'}
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
          default: '${values.baseImage || values.customBaseImage}'
          enum:
            - 'registry.access.redhat.com/ubi9/python-311:latest'
            - 'registry.redhat.io/ansible-automation-platform-25/ee-minimal-rhel9:latest'${values.customBaseImage?.trim() ? `\n            - '${values.customBaseImage}'` : ''}
          enumNames:
            - 'Red Hat Universal Base Image 9 w/ Python 3.11 (Recommended)'
            - 'Red Hat Ansible Minimal EE base (RHEL 9) (Requires subscription)'${values.customBaseImage?.trim() ? `\n            - '${values.customBaseImage}'` : ''}
          ui:widget: radio
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
                description: Collection name in namespace.collection format
                pattern: '^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$'
                ui:placeholder: 'e.g., community.general'
              version:
                type: string
                title: Version (Optional)
                description: Specific version of the collection
                ui:placeholder: 'e.g., 7.2.1'
          ui:options:
            addable: true
            orderable: true
            removable: true
        collectionsFile:
          title: Upload a requirements.yml file
          description: Optionally upload a requirements file with collection details
          type: string
          format: data-url
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
                  title: Python Requirements
                  type: array
                  default: ${requirementsJson}
                  description: Add Python requirements to be included in the execution environment definition file (optional).
                  items:
                    type: string
                    title: Python package
                    description: Python package (with optional version specification)
                    ui:placeholder: 'e.g., requests>=2.28.0'
                  ui:options:
                    addable: true
                    orderable: true
                    removable: true
                pythonRequirementsFile:
                  type: string
                  format: data-url
                  title: Pick a file with Python requirements
                  description: Upload a requirements.txt file with python package details
                systemPackages:
                  title: System Packages
                  type: array
                  default: ${packagesJson}
                  description: Add system packages/binaries to be included in the execution environment definition file (optional).
                  items:
                    type: string
                    title: System package
                    description: System package
                    ui:placeholder: 'e.g., libxml2-dev [platform:dpkg], libssh-devel [platform:rpm]'
                  ui:options:
                    addable: true
                    orderable: true
                    removable: true
                systemPackagesFile:
                  type: string
                  format: data-url
                  title: Pick a file with system packages
                  description: Upload a bindep.txt file with system package details
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
            ui:widget: select
            ui:help: "Update placeholder values within the YAML file once the EE definition file is created."
          ui:options:
            addable: true
            orderable: true
            removable: true
      dependencies:
        mcpServers:
          oneOf:
            # Case: at least one item selected
            - properties:
                mcpServers:
                  minItems: 1
              ui:help: ""
            # Case: no selection yet
            - properties:
                mcpServers:
                  maxItems: 0
              ui:help: ""

    # Step 3: Additional Build Steps
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
                  title: Command
                  ui:placeholder: 'e.g., RUN dnf update'
                ui:options:
                  addable: true
                  orderable: true
                  removable: true
            required: ['stepType', 'commands']
          ui:options:
            addable: true
            orderable: true
            removable: true

    # Step 9: Repository Configuration
    - title: Generate (and Publish)
      description: Generate and publish the EE definition file and template.
      properties:
        eeFileName:
          title: EE File Name
          type: string
          description: Name of the Execution Environment file.
          ui:help: "Specify the filename for the EE definition file."
        templateDescription:
          title: Template Description
          type: string
          description: Description for the generated template.
          ui:help: "Helps others understand when to use this template."
        tags:
          title: Tags for the generated template
          description: Enter one or more tags.
          type: array
          default: ${tagsJson}
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
      action: ansible:ee:create-definition
      input:
        values:
          eeFileName: \${{ parameters.eeFileName }}
          baseImage: \${{ parameters.baseImage === 'custom' and parameters.customBaseImage or parameters.baseImage }}
          popularCollections: \${{ parameters.popularCollections or [] }}
          collections: \${{ parameters.collections or [] }}
          collectionsFile: \${{ parameters.collectionsFile or [] }}
          pythonRequirements: \${{ parameters.pythonRequirements or [] }}
          pythonRequirementsFile: \${{ parameters.pythonRequirementsFile or [] }}
          systemPackages: \${{ parameters.systemPackages or [] }}
          systemPackagesFile: \${{ parameters.systemPackagesFile or [] }}
          mcpServers: \${{ parameters.mcpServers or [] }}
          additionalBuildSteps: \${{ parameters.additionalBuildSteps or [] }}

    # Step 2: Generate EE definition template
    - id: create-template
      name: Generating Template for the EE Definition
      action: ansible:ee:create-template
      input:
        values:
          contextDirName:  \${{ steps['create-ee-definition'].output.contextDirName }}
          eeFileName: \${{ parameters.eeFileName }}
          baseImage: \${{ parameters.baseImage or '' }}
          customBaseImage: \${{ parameters.customBaseImage or '' }}
          collections: \${{ steps['create-ee-definition'].output.collections }}
          pythonRequirements: \${{ steps['create-ee-definition'].output.pythonRequirements }}
          systemPackages: \${{ steps['create-ee-definition'].output.systemPackages }}
          mcpServers: \${{ parameters.mcpServers or [] }}
          additionalBuildSteps: \${{ steps['create-ee-definition'].output.additionalBuildSteps }}
          tags: \${{ parameters.tags or [] }}

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

    # Step 4: Generate catalog-info file
    - id: create-catalog-info
      action: ansible:ee:create-catalog-info
      name: Creating Catalog Info Component for the EE Definition
      input:
        componentName: \${{ parameters.eeFileName }}
        description: \${{ parameters.templateDescription }}
        tags: \${{ parameters.tags or [] }}
        repoUrl: \${{ steps['prepare-publish'].output.generatedRepoUrl or ''}}
        contextDirName: \${{ steps['create-ee-definition'].output.contextDirName }}
        publishToSCM: \${{ parameters.publishToSCM }}
        eeDefinitionContent: \${{ steps['create-ee-definition'].output.eeDefinitionContent }}
        readmeContent: \${{ steps['create-ee-definition'].output.readmeContent }}

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
        entityRef: \${{ steps['register-catalog-component'].output.entityRef or steps['create-catalog-info'].output.generatedEntityRef }}

    text:
      - title: Next Steps
        content: |
          \`\`\`md
          \${{ steps['create-ee-definition'].output.readmeContent }}
          \`\`\`
    `;
}
