import yaml from 'js-yaml';
import { EEDefinitionInput } from '../types';

export function generateEETemplate(values: EEDefinitionInput): string {
  const collectionsJson = JSON.stringify(values.collections);
  const requirementsJson = JSON.stringify(values.pythonRequirements);
  const packagesJson = JSON.stringify(values.systemPackages);
  const buildStepsJson = JSON.stringify(values.additionalBuildSteps);
  const tagsJson = JSON.stringify(values.tags);
  return `---
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: ${values.eeFileName}
  title: ${values.eeFileName}
  description: ${yaml.dump(values.eeDescription || 'Saved Ansible Execution Environment Definition template', { quotingType: '"', forceQuotes: true }).trim()}
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

    # Step 2: Configuration
    - title: Configuration
      description: Add collections to be included in your execution environment definition file (optional).
      properties:
        collections:
          title: Collections
          type: array
          description: Add collections to be included in your execution environment definition file (optional).
          default: ${collectionsJson}
          ui:field: CollectionsPicker
        advancedConfiguration:
          title: Advanced Configuration
          type: object
          ui:order:
            - specifyRequirements
            - pythonRequirements
            - pythonRequirementsFile
            - systemPackages
            - systemPackagesFile
            - addBuildSteps
            - additionalBuildSteps
            - "*"
          properties:
            specifyRequirements:
              title: Customize additional Python requirements and System packages
              type: boolean
              default: false
              ui:help: "Check this box to define additional Python or system dependencies to include in your EE."
            addBuildSteps:
              title: "Include additional build steps"
              type: boolean
              default: false
              ui:help: "Check this box to add custom build steps that will be executed at specific points during the build process. These map to ansible-builder's additional_build_steps configuration (optional step)."
          dependencies:
            specifyRequirements:
              oneOf:
                - properties:
                    specifyRequirements:
                      const: true
                    pythonRequirements:
                      title: Additional Python Requirements
                      type: array
                      description: |
                        Specify additional python packages that are required in addition to what the selected collections already specify as dependencies.
                        Packages already specified in the collections as a dependency should not be repeated here.
                      items:
                        type: string
                        title: Python package
                        description: Python package (with optional version specification)
                        ui:placeholder: 'e.g., requests>=2.28.0'
                      default: ${requirementsJson}
                      ui:field: PackagesPicker
                    pythonRequirementsFile:
                      type: string
                      format: data-url
                      title: Pick a file with Python requirements
                      description: Upload a requirements.txt file with python package details
                      ui:field: FileUploadPicker
                      ui:placeholder: Paste the full content of your requirements.txt file here. Alternatively, upload a file. Please verify formatting, as no syntax validation is applied.
                      ui:buttonText: Choose file
                    systemPackages:
                      title: Additional System Packages
                      type: array
                      description: |
                        Specify additional system-level packages that are required in addition to what the selected collections already specify as dependencies.
                        Packages already specified in the collections as a dependency should not be repeated here.
                      items:
                        type: string
                        title: System package
                        description: System package
                        ui:placeholder: 'e.g., libxml2-dev [platform:dpkg], libssh-devel [platform:rpm]'
                      default: ${packagesJson}
                      ui:field: PackagesPicker
                    systemPackagesFile:
                      type: string
                      format: data-url
                      title: Add system packages
                      description: Upload a bindep.txt file with system package details
                      ui:field: FileUploadPicker
                      ui:placeholder: Paste the full content of your bindep.txt file here. Alternatively, upload a file. Please verify formatting, as no syntax validation is applied.
                      ui:buttonText: Choose file
                - properties:
                    specifyRequirements:
                      const: false
            addBuildSteps:
              oneOf:
                - properties:
                    addBuildSteps:
                      const: true
                    additionalBuildSteps:
                      title: Additional Build Steps
                      type: array
                      default: ${buildStepsJson}
                      description: Add custom build steps that will be executed at specific points during the build process. These map to ansible-builder's additional_build_steps configuration.
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
                - properties:
                    addBuildSteps:
                      const: false

    # Step 3: Repository Configuration
    - title: Destination and Build
      description: Generate and publish the EE definition file and template.
      properties:
        eeFileName:
          title: EE Definition Name
          type: string
          ui:field: EEFileNamePicker
          ui:help: "Specify a name for the Execution Environment definition. This will also be used as the name of the EE definition file."
        templateDescription:
          title: Description
          type: string
          description: |
            Description for the generated Execution Environment definition.
            This description is used when displaying the Execution Environment definition in the catalog.
            Additionally, this description is also used in the Software Template that is generated with Git-based publishing.
        tags:
          title: Tags
          description: |
            Add tags to make this EE definition discoverable in the catalog. Tags must be 63 characters or less and can only contain lowercase letters, numbers, and hyphens.
            The default execution-environment tag identifies this as an EE component; keeping it is highly recommended.
          type: array
          default:
            - 'execution-environment'
          items:
            type: string
          ui:
            field: EETagsPicker
            options:
              addable: true
              orderable: true
              removable: true
            help: "Add one or more tags for the generated template."
        publishAndBuild:
          title: Publish and Build
          type: object
          properties:
            publishToSCM:
              title: Publish to a Git repository
              type: boolean
              default: true
              ui:help: "If unchecked, the generated files will not be pushed to a Git repository and you will get a link to download the files locally."
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
                      title: Git organization or username
                      type: string
                      description: The organization or username that owns the Git repository
                    repositoryName:
                      title: Target Repository Name
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
                  dependencies:
                    sourceControlProvider:
                      oneOf:
                        - properties:
                            sourceControlProvider:
                              const: Github
                            buildExecutionEnvironment:
                              title: Build Execution Environment
                              description: Trigger a build of the Execution Environment after publishing.
                              type: boolean
                              default: false
                              ui:help: "If checked, the Execution Environment will be built and pushed to the selected container registry."
                          dependencies:
                            buildExecutionEnvironment:
                              oneOf:
                                - properties:
                                    buildExecutionEnvironment:
                                      const: true
                                    buildRegistry:
                                      title: Registry
                                      description: Container registry to push the built EE image to.
                                      type: string
                                      default: 'Private Automation Hub (PAH)'
                                      enum:
                                        - 'Private Automation Hub (PAH)'
                                        - 'ghcr.io'
                                      ui:
                                        component: select
                                        help: Select the container registry where the built image will be pushed.
                                    buildImageName:
                                      title: Image Name
                                      type: string
                                      description: Name for the built Execution Environment image in namespace/name format. For example, 'my-namespace/my-custom-ee'.
                                    buildImageTag:
                                      title: Image Tag
                                      type: string
                                      description: Tag for the built Execution Environment image.
                                    registryTlsVerify:
                                      title: Verify TLS certificates
                                      type: boolean
                                      default: true
                                      description: Verify TLS certificates when interacting with container registries.
                                      ui:help: "Uncheck to disable TLS verification for registries using self-signed or untrusted certificates."
                                  required:
                                    - buildRegistry
                                    - buildImageName
                                - properties:
                                    buildExecutionEnvironment:
                                      const: false
                        - properties:
                            sourceControlProvider:
                              const: Gitlab
                - properties:
                    publishToSCM:
                      const: false
      required:
        - eeFileName
        - templateDescription

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
          publishToSCM: \${{ parameters.publishAndBuild.publishToSCM }}
          baseImage: \${{ parameters.baseImage === 'custom' and parameters.customBaseImage or parameters.baseImage }}
          customBaseImage: \${{ parameters.customBaseImage or '' }}
          collections: \${{ parameters.collections or [] }}
          pythonRequirements: \${{ parameters.advancedConfiguration.pythonRequirements or [] }}
          pythonRequirementsFile: \${{ parameters.advancedConfiguration.pythonRequirementsFile or '' }}
          systemPackages: \${{ parameters.advancedConfiguration.systemPackages or [] }}
          systemPackagesFile: \${{ parameters.advancedConfiguration.systemPackagesFile or '' }}
          additionalBuildSteps: \${{ parameters.advancedConfiguration.additionalBuildSteps or [] }}
          buildRegistry: \${{ parameters.publishAndBuild.buildRegistry or '' }}
          buildImageName: \${{ parameters.publishAndBuild.buildImageName or '' }}
          buildImageTag: \${{ parameters.publishAndBuild.buildImageTag or '' }}
          registryTlsVerify: \${{ parameters.publishAndBuild.registryTlsVerify }}

    # Step 3: Validate the SCM repository (optional)
    - id: prepare-publish
      action: ansible:prepare:publish
      name: Prepare for publishing
      if: \${{ parameters.publishAndBuild.publishToSCM }}
      input:
        sourceControlProvider: \${{ parameters.publishAndBuild.sourceControlProvider }}
        repositoryOwner: \${{ parameters.publishAndBuild.repositoryOwner }}
        repositoryName: \${{ parameters.publishAndBuild.repositoryName }}
        createNewRepository: \${{ parameters.publishAndBuild.createNewRepository }}
        eeFileName: \${{ parameters.eeFileName }}
        contextDirName: \${{ steps['create-ee-definition'].output.contextDirName }}

    - id: create-catalog-info-file
      action: catalog:write
      if: \${{ parameters.publishAndBuild.publishToSCM }}
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
              ansible.io/scm-provider: \${{ parameters.publishAndBuild.sourceControlProvider }}
          spec:
            type: execution-environment
            owner: \${{ steps['create-ee-definition'].output.owner }}
            lifecycle: production

    # Step 5: Create and publish to a new GitHub Repository
    - id: publish-github
      name: Create and publish to a new GitHub Repository
      action: publish:github
      if: \${{ (parameters.publishAndBuild.publishToSCM) and (steps['prepare-publish'].output.createNewRepo) and (parameters.publishAndBuild.sourceControlProvider == 'Github') }}
      input:
        description: \${{ parameters.templateDescription }}
        repoUrl: \${{ steps['prepare-publish'].output.generatedRepoUrl }}
        defaultBranch: 'main'
        repoVisibility: 'public'

    # Step 5: Create and publish to a new Gitlab Repository
    - id: publish-gitlab
      name: Create and publish to a new GitLab Repository
      action: publish:gitlab
      if: \${{ (parameters.publishAndBuild.publishToSCM) and (steps['prepare-publish'].output.createNewRepo) and parameters.publishAndBuild.sourceControlProvider == 'Gitlab' }}
      input:
        repoUrl: \${{ steps['prepare-publish'].output.generatedRepoUrl }}
        defaultBranch: 'main'
        repoVisibility: 'public'

    # Step 5: Publish generated files as a Github Pull Request
    - id: publish-github-pull-request
      name: Publish generated files as a Github Pull Request
      action: publish:github:pull-request
      if: \${{ parameters.publishAndBuild.publishToSCM and (not steps['prepare-publish'].output.createNewRepo) and (parameters.publishAndBuild.sourceControlProvider == 'Github') }}
      input:
        repoUrl: \${{ steps['prepare-publish'].output.generatedRepoUrl }}
        branchName: \${{ steps['prepare-publish'].output.generatedBranchName }}
        title: \${{ steps['prepare-publish'].output.generatedTitle }}
        description: \${{ steps['prepare-publish'].output.generatedDescription }}

    # Step 5: Publish generated files as a Gitlab Merge Request
    - id: publish-gitlab-merge-request
      name: Publish generated files as a Gitlab Merge Request
      action: publish:gitlab:merge-request
      if: \${{ parameters.publishAndBuild.publishToSCM and (not steps['prepare-publish'].output.createNewRepo) and (parameters.publishAndBuild.sourceControlProvider == 'Gitlab') }}
      input:
        repoUrl: \${{ steps['prepare-publish'].output.generatedRepoUrl }}
        branchName: \${{ steps['prepare-publish'].output.generatedBranchName }}
        title: \${{ steps['prepare-publish'].output.generatedTitle }}
        description: \${{ steps['prepare-publish'].output.generatedDescription }}

    - id: register-catalog-component
      name: Register published EE as a Catalog Component
      action: catalog:register
      if: \${{ parameters.publishAndBuild.publishToSCM }}
      input:
        catalogInfoUrl: \${{ steps['prepare-publish'].output.generatedCatalogInfoUrl }}
        optional: true

    - action: github:actions:dispatch
      name: Start EE Build Workflow
      if: \${{ parameters.publishAndBuild.buildExecutionEnvironment and (steps['prepare-publish'].output.createNewRepo) }}
      input:
        repoUrl: \${{ steps['prepare-publish'].output.generatedRepoUrl }}
        workflowId: ee-build.yml
        branchOrTagName: main

  output:
    text:
      - title: Next Steps
        content: |
          \${{ steps['create-ee-definition'].output.readmeContent }}
    links:
      - title: \${{ parameters.publishAndBuild.sourceControlProvider }} Repository
        url: \${{ steps['prepare-publish'].output.generatedFullRepoUrl }}
        if: \${{ (parameters.publishAndBuild.publishToSCM) and (steps['prepare-publish'].output.createNewRepo) }}
        icon: \${{ parameters.publishAndBuild.sourceControlProvider | lower }}

      - title: GitHub Pull Request
        url: \${{ steps['publish-github-pull-request'].output.remoteUrl }}
        if: \${{ (parameters.publishAndBuild.publishToSCM) and (not steps['prepare-publish'].output.createNewRepo) and (parameters.publishAndBuild.sourceControlProvider == 'Github') }}
        icon: github

      - title: GitLab Merge Request
        url: \${{ steps['publish-gitlab-merge-request'].output.mergeRequestUrl  }}
        if: \${{ (parameters.publishAndBuild.publishToSCM) and (not steps['prepare-publish'].output.createNewRepo) and (parameters.publishAndBuild.sourceControlProvider == 'Gitlab') }}

      - title: View details in catalog
        icon: catalog
        url: \${{ steps['create-ee-definition'].output.generatedEntityRef }}
        if: \${{ not (steps['publish-github-pull-request'].output.remoteUrl or steps['publish-gitlab-merge-request'].output.mergeRequestUrl) }}
`;
}
