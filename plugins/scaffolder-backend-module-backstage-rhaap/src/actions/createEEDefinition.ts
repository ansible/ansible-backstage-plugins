import {
  createTemplateAction,
  executeShellCommand,
} from '@backstage/plugin-scaffolder-node';
import * as fs from 'fs/promises';
import * as path from 'path';
import semver from 'semver';
import { parseUploadedFileContent } from './utils/utils';
import {
  AuthService,
  DiscoveryService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { BackendServiceAPI } from './utils/api';
import {
  getServiceUrlFromAnsibleConfig,
  validateAnsibleConfig,
} from './utils/config';
import {
  Collection,
  AdditionalBuildStep,
  EEDefinitionInput,
  ScmServer,
} from './types';
import { generateReadme } from './templates/readmeTemplate';
import { generateEETemplate } from './templates/eeTemplate';

const PAH_SOURCE_PREFIX = 'Private Automation Hub';

/**
 * Creates the `ansible:create:ee-definition` scaffolder action.
 *
 * This action orchestrates the full lifecycle of generating an Ansible
 * Execution Environment (EE) definition:
 *
 * 1. Validates and normalises user inputs (collections, packages, build steps).
 * 2. Calls the external `ansible-creator` service to scaffold the EE project
 *    (definition file, ansible.cfg, CI workflow, etc.).
 * 3. Distributes scaffolded artefacts between the EE subdirectory and
 *    workspace root, then patches the CI workflow with the correct `ee_dir`.
 * 4. Generates a custom README and a re-importable Backstage template YAML.
 * 5. Either publishes to SCM (template + catalog-info) or registers a
 *    catalog entity directly via the catalog backend API.
 *
 * @param options.frontendUrl - Base URL of the Backstage frontend, used to
 *   build entity reference links.
 * @param options.auth - Backstage {@link AuthService} for obtaining service
 *   credentials and plugin request tokens.
 * @param options.discovery - Backstage {@link DiscoveryService} for resolving
 *   backend plugin URLs (e.g. the catalog API).
 * @param options.config - Backstage {@link Config} containing `ansible.*` and
 *   `catalog.providers.rhaap.*` settings.
 * @returns A Backstage scaffolder `TemplateAction`.
 */
export function createEEDefinitionAction(options: {
  frontendUrl: string;
  auth: AuthService;
  discovery: DiscoveryService;
  config: Config;
}) {
  const { frontendUrl, auth, discovery, config } = options;
  return createTemplateAction({
    id: 'ansible:create:ee-definition',
    description: 'Creates Ansible Execution Environment definition files',
    schema: {
      input: {
        values: z => z.custom<EEDefinitionInput>(),
      },
      output: {
        contextDirName: z => z.string().optional(),
        generatedEntityRef: z => z.string().optional(),
        owner: z => z.string().optional(),
        catalogInfoPath: z => z.string().optional(),
        readmeContent: z => z.string().optional(),
      },
    },
    async handler(ctx) {
      const { input, logger, workspacePath } = ctx;
      const values = input.values as unknown as EEDefinitionInput;
      const baseImage = values.baseImage || values.customBaseImage || '';
      const collections = values.collections || [];
      const pythonRequirements = values.pythonRequirements || [];
      const pythonRequirementsFile = values.pythonRequirementsFile || '';
      const systemPackages = values.systemPackages || [];
      const systemPackagesFile = values.systemPackagesFile || '';
      const additionalBuildSteps = values.additionalBuildSteps || [];
      const eeFileNameSlug = canonicalizeEEDefinitionName(
        values.eeFileName || 'execution-environment',
      );
      const eeFileName = validateSafeEEDefinitionName(eeFileNameSlug);
      const eeDescription = values.eeDescription || 'Execution Environment';
      const tags = values.tags || [];
      const owner = values.owner || ctx.user?.ref || '';
      const buildRegistry = values.buildRegistry || '';
      const buildImageName = values.buildImageName || '';
      const registryTlsVerify = values.registryTlsVerify ?? true;

      ctx.output('owner', owner);

      const contextDirName = eeFileName;

      ctx.output('contextDirName', contextDirName);

      const eeDir = path.join(workspacePath, contextDirName);
      await fs.mkdir(eeDir, { recursive: true });

      const eeDefinitionPath = resolvePathWithinDirectory(
        eeDir,
        `${eeFileName}.yml`,
      );
      const ansibleConfigPath = path.join(eeDir, 'ansible.cfg');
      const readmePath = path.join(eeDir, 'README.md');

      logger.info(`[ansible:create:ee-definition] EE base image: ${baseImage}`);

      const decodedPythonRequirementsContent = parseUploadedFileContent(
        pythonRequirementsFile,
      );
      const decodedSystemPackagesContent =
        parseUploadedFileContent(systemPackagesFile);

      const parsedPythonRequirements = parseTextRequirementsFile(
        decodedPythonRequirementsContent,
      );
      const parsedSystemPackages = parseTextRequirementsFile(
        decodedSystemPackagesContent,
      );

      try {
        const { scmCollections, nonScmCollections } =
          partitionCollectionsBySourceType(collections);
        const allCollections = normalizeCollectionSources(
          mergeCollections(nonScmCollections),
        );
        const { collections: transformedScmCollections, scmServers } =
          transformScmCollections(scmCollections, config);
        const allRequirements = mergeRequirements(
          pythonRequirements,
          parsedPythonRequirements,
        );
        const allPackages = mergePackages(systemPackages, parsedSystemPackages);

        logger.debug(
          `[ansible:create:ee-definition] collections: ${JSON.stringify(allCollections)}`,
        );
        logger.debug(
          `[ansible:create:ee-definition] scmCollections: ${JSON.stringify(transformedScmCollections)}`,
        );
        logger.debug(
          `[ansible:create:ee-definition] pythonRequirements: ${JSON.stringify(allRequirements)}`,
        );
        logger.debug(
          `[ansible:create:ee-definition] systemPackages: ${JSON.stringify(allPackages)}`,
        );
        logger.debug(
          `[ansible:create:ee-definition] additionalBuildSteps: ${JSON.stringify(additionalBuildSteps)}`,
        );

        const pahBaseUrl =
          config.getOptionalString('ansible.rhaap.baseUrl') ?? '';

        const galaxyServers = buildGalaxyServersFromConfig(
          logger,
          config,
          pahBaseUrl,
        );

        const eeConfig = buildEEConfig({
          baseImage,
          eeFileName,
          collections: allCollections,
          scmCollections: transformedScmCollections,
          scmServers,
          pythonDeps: allRequirements,
          systemPackages: allPackages,
          additionalBuildSteps,
          galaxyServers,
          buildRegistry,
          buildImageName,
          registryTlsVerify,
          pahBaseUrl,
        });

        // Call the creator service to scaffold the EE definition
        validateAnsibleConfig(config);
        const creatorServiceUrl = getServiceUrlFromAnsibleConfig(config);
        const api = new BackendServiceAPI();
        const tarName = 'ee-scaffold.tar';

        logger.info(
          `[ansible:create:ee-definition] calling creator service at ${creatorServiceUrl}`,
        );

        // Download and extract the scaffold to a temp dir first, then
        // distribute files: repo-root items (.github, .gitignore, …) stay at
        // workspacePath; EE-specific files go into eeDir (contextDirName/).
        const tempDir = path.join(workspacePath, '.ee-scaffold-tmp');
        await fs.mkdir(tempDir, { recursive: true });

        await api.downloadEEScaffold(
          tempDir,
          logger,
          creatorServiceUrl,
          eeConfig,
          tarName,
        );
        await executeShellCommand({
          command: 'tar',
          args: ['-xvf', tarName],
          options: { cwd: tempDir },
        });
        await executeShellCommand({
          command: 'rm',
          args: [tarName],
          options: { cwd: tempDir },
        });
        logger.info(
          `[ansible:create:ee-definition] extracted creator service scaffold to temp dir`,
        );

        const EE_DIR_FILES = new Set([
          `${eeFileName}.yml`,
          'execution-environment.yml',
          'README.md',
          'ansible.cfg',
          'NEXT_STEPS.md',
        ]);

        // Move EE-specific files to the EE directory, and other files to the workspace root
        const entries = await fs.readdir(tempDir, { withFileTypes: true });
        for (const entry of entries) {
          const src = path.join(tempDir, entry.name);
          if (EE_DIR_FILES.has(entry.name)) {
            await fs.rename(src, path.join(eeDir, entry.name));
          } else {
            await fs.rename(src, path.join(workspacePath, entry.name));
          }
        }

        await fs.rm(tempDir, { recursive: true, force: true });
        logger.info(
          '[ansible:create:ee-definition] distributed scaffold files to workspace',
        );

        // Patch the ee-build.yml workflow so the `ee_dir` input
        // defaults to the EE subdirectory instead of the repo root (".").
        await patchWorkflowEeDir(workspacePath, contextDirName);

        // Create merged values for template generation
        const mergedValues = {
          ...values,
          eeFileName,
          collections: [...allCollections, ...scmCollections],
          pythonRequirements: allRequirements,
          systemPackages: allPackages,
          additionalBuildSteps,
        };

        // Read EE definition and ansible.cfg (if present)
        // for catalog entity generation (non-SCM publishing)
        const eeDefinition = await fs.readFile(eeDefinitionPath, 'utf-8');

        let ansibleConfigContent = '';
        let hasAnsibleCfg = true;
        try {
          ansibleConfigContent = await fs.readFile(ansibleConfigPath, 'utf-8');
        } catch {
          hasAnsibleCfg = false;
          logger.info(
            '[ansible:create:ee-definition] no ansible.cfg in scaffold output',
          );
        }

        // This is a temporary patch until https://github.com/ansible/ansible/issues/86694
        // is resolved and backported to downstream ansible-core versions.
        if (ansibleConfigContent) {
          ansibleConfigContent =
            patchAnsibleCfgGalaxyIgnoreCerts(ansibleConfigContent);
          await fs.writeFile(ansibleConfigPath, ansibleConfigContent);
        }

        const readmeContent = generateReadme(
          mergedValues,
          values.publishToSCM,
          hasAnsibleCfg,
        );
        await fs.writeFile(readmePath, readmeContent);
        ctx.output('readmeContent', readmeContent);

        const eeTemplateContent = generateEETemplate(mergedValues);

        if (values.publishToSCM) {
          const templatePath = resolvePathWithinDirectory(
            eeDir,
            `${eeFileName}-template.yml`,
          );
          await fs.writeFile(templatePath, eeTemplateContent);
          logger.info(
            `[ansible:create:ee-definition] created EE template.yml at ${templatePath}`,
          );
          const catalogInfoPath = path.join(
            contextDirName,
            'catalog-info.yaml',
          );
          ctx.output('catalogInfoPath', catalogInfoPath);
        } else {
          const baseUrl = await discovery.getBaseUrl('catalog');
          const { token } = await auth.getPluginRequestToken({
            onBehalfOf: await auth.getOwnServiceCredentials(),
            targetPluginId: 'catalog',
          });

          const entity = generateEECatalogEntity(
            eeFileName,
            eeDescription,
            tags,
            owner,
            eeDefinition,
            readmeContent,
            ansibleConfigContent,
            eeTemplateContent,
          );
          const response = await fetch(`${baseUrl}/ansible/ee`, {
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
          } else {
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

/**
 * Builds a Backstage catalog entity object for a locally-registered
 * Execution Environment (non-SCM publishing path).
 *
 * The returned entity follows the `backstage.io/v1alpha1` Component schema
 * and embeds the full EE definition, README, ansible.cfg, and scaffolder
 * template as spec fields so the catalog can serve them without an external
 * repository.
 *
 * @param componentName - Unique entity name (also used as the display title).
 * @param description - Human-readable description shown in the catalog.
 * @param tags - Discovery tags (e.g. `['execution-environment']`).
 * @param owner - Entity reference of the owning user or group.
 * @param eeDefinitionContent - Raw YAML content of the EE definition file.
 * @param readmeContent - Generated README markdown.
 * @param ansibleConfigContent - Contents of `ansible.cfg` (may be empty).
 * @param eeTemplateContent - Re-importable Backstage template YAML.
 * @returns A plain object conforming to the Backstage Component entity schema.
 */
function generateEECatalogEntity(
  componentName: string,
  description: string,
  tags: string[],
  owner: string,
  eeDefinitionContent: string,
  readmeContent: string,
  ansibleConfigContent: string,
  eeTemplateContent: string,
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
      template: eeTemplateContent,
      readme: readmeContent,
      ansible_cfg: ansibleConfigContent,
    },
  };
}

/**
 * Deduplicates a list of Ansible collections by name, applying precedence
 * rules to decide which entry survives when duplicates exist.
 *
 * Precedence (highest to lowest):
 * 1. An entry **without** a version always wins — it signals "use the latest
 *    available from the configured Galaxy server".
 * 2. When both entries carry a version, the higher semver wins.
 *
 * @param collections - Raw collection list that may contain duplicate names.
 * @returns A new array with at most one entry per collection name.
 */
function mergeCollections(collections: Collection[]): Collection[] {
  if (!collections || collections.length === 0) {
    return [];
  }

  const uniqueCollections = Object.values(
    collections.reduce<Record<string, Collection>>((acc, curr) => {
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

/**
 * Normalises collection `source` values from the UI-friendly format used by
 * the Collections Picker into the identifier format expected by
 * `ansible-creator`'s EE builder.
 *
 * Transformation rules:
 * - `"Private Automation Hub / <repo>"` → `"private_hub_<repo>"` (lowercased,
 *   spaces replaced with underscores).
 * - `"Private Automation Hub"` (no repo suffix) → the `source` key is removed
 *   entirely so the builder falls back to its default behaviour.
 * - All other sources are passed through unchanged.
 *
 * @param collections - Collections with raw source values from the UI.
 * @returns A new array with normalised source fields.
 */
function normalizeCollectionSources(collections: Collection[]): Collection[] {
  return collections.map(c => {
    if (!c.source?.startsWith(PAH_SOURCE_PREFIX)) {
      return c;
    }
    const parts = c.source.split('/');
    const repo = normalizePahRepoIdentifier(parts[1] ?? '');
    if (!repo) {
      const { source: _, ...rest } = c;
      return rest as Collection;
    }
    return { ...c, source: `private_hub_${repo}` };
  });
}

/**
 * The minimum number of `/`-separated segments in a collection `source`
 * value for it to be recognised as an SCM reference.
 *
 * Format: `<SCM Provider> / <Host canonical name> / <Organization> / <Repository>`
 */
const SCM_SOURCE_SEGMENT_COUNT = 4;

/**
 * Partitions a collection list into SCM-sourced and non-SCM-sourced groups.
 *
 * A collection is considered SCM-sourced when its `source` field contains at
 * least {@link SCM_SOURCE_SEGMENT_COUNT} `/`-separated segments **and** does
 * not start with the {@link PAH_SOURCE_PREFIX}.  Everything else (PAH, Galaxy,
 * no source) falls into the non-SCM bucket.
 *
 * SCM collections are kept out of {@link mergeCollections} (which relies on
 * semver comparison — incompatible with branch/tag refs like `main`) and out
 * of {@link normalizeCollectionSources} (which only understands PAH sources).
 */
function partitionCollectionsBySourceType(collections: Collection[]): {
  scmCollections: Collection[];
  nonScmCollections: Collection[];
} {
  const scmCollections: Collection[] = [];
  const nonScmCollections: Collection[] = [];

  for (const c of collections) {
    if (
      c.source &&
      !c.source.startsWith(PAH_SOURCE_PREFIX) &&
      c.source.split('/').length >= SCM_SOURCE_SEGMENT_COUNT
    ) {
      scmCollections.push(c);
    } else {
      nonScmCollections.push(c);
    }
  }

  return { scmCollections, nonScmCollections };
}

/**
 * Converts an identifier string into the uppercase, underscore-separated
 * format used for EE builder token environment variable names.
 *
 * All non-alphanumeric characters are replaced with underscores, repeated
 * underscores are collapsed, and leading/trailing underscores are trimmed.
 */
function toEnvVarSegment(value: string): string {
  return value
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]+/g, '_')
    .replaceAll(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Transforms SCM-sourced collections into the tokenized git URL format
 * expected by `ansible-builder`.
 *
 * For each collection whose `source` follows the
 * `<SCM Provider> / <canonical name> / <org> / <repo>` pattern, the
 * `name` field is rewritten to:
 *
 *   `https://${AAP_EE_BUILDER_<PROVIDER>_<CANONICAL>_<ORG>_TOKEN}@<host>/<org>/<repo>`
 *
 * The host is resolved from the Backstage config via
 * {@link lookupScmHostFromConfig}.  The original collection `name` is
 * discarded (replaced by the git URL), `version` is preserved (branch or
 * tag ref), and `type` is set to `"git"`.
 *
 * @param collections - SCM-sourced collections (already partitioned).
 * @param config - Backstage configuration root.
 * @returns Transformed collections ready for the EE config payload.
 */
function transformScmCollections(
  collections: Collection[],
  config: Config,
): { collections: Collection[]; scmServers: ScmServer[] } {
  const seenServers = new Map<string, ScmServer>();

  const transformed = collections.map(c => {
    const parts = c.source!.split('/').map(s => s.trim());
    const provider = parts[0];
    const canonicalName = parts[1];
    const org = parts[2];
    const repo = parts[3];

    const host = lookupScmHostFromConfig(
      config,
      provider.toLowerCase(),
      canonicalName,
    );

    const tokenVar = `AAP_EE_BUILDER_${toEnvVarSegment(provider)}_${toEnvVarSegment(canonicalName)}_${toEnvVarSegment(org)}_TOKEN`;
    const gitUrl = `https://\${${tokenVar}}@${host}/${org}/${repo}`;

    if (!seenServers.has(tokenVar)) {
      seenServers.set(tokenVar, {
        id: tokenVar.toLowerCase(),
        hostname: host,
        token_env_var: tokenVar,
      });
    }

    const col: Collection = {
      name: gitUrl,
      type: 'git',
    };
    if (c.version) {
      // The UI may append display metadata after a "/" (e.g. "main / v1.2.3");
      // only the segment before the first "/" is the actual git ref.
      col.version = c.version.split('/')[0].trim();
    }
    return col;
  });

  return { collections: transformed, scmServers: [...seenServers.values()] };
}

/**
 * Merges manually-entered Python requirements with those parsed from an
 * uploaded `requirements.txt` file, removing exact duplicates.
 *
 * @param pythonRequirements - Requirements entered individually in the UI.
 * @param parsedPythonRequirements - Requirements extracted from the uploaded file.
 * @returns A deduplicated array preserving insertion order.
 */
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

/**
 * Merges manually-entered system packages with those parsed from an
 * uploaded `bindep.txt` file, removing exact duplicates.
 *
 * @param systemPackages - Packages entered individually in the UI.
 * @param parsedSystemPackages - Packages extracted from the uploaded file.
 * @returns A deduplicated array preserving insertion order.
 */
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

/**
 * Parses a plain-text requirements/bindep file into individual package lines.
 *
 * Blank lines and comment lines (starting with `#`) are stripped.
 *
 * @param decodedContent - UTF-8 decoded file content (may be empty).
 * @returns An array of trimmed, non-empty, non-comment lines.
 * @throws If the content cannot be split (should not occur in practice).
 */
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

/**
 * Reads Private Automation Hub (PAH) repository names from the Backstage
 * configuration and builds `galaxy_server` entries for the creator service's
 * EE config payload.
 *
 * Iterates over every environment defined under
 * `catalog.providers.rhaap.<envId>.sync.pahCollections.repositories` and
 * produces one server entry per unique repository name. Environments where
 * `pahCollections.enabled` is explicitly `false` are skipped.
 *
 * @param logger - Logger instance for diagnostic messages.
 * @param config - Backstage configuration root.
 * @param pahBaseUrl - Base URL of the PAH instance (e.g.
 *   `https://pah.example.com`). If empty, no servers are returned.
 * @returns An array of galaxy server objects with `id`, `url`, and
 *   `token_required` fields, ready for the creator service payload.
 */
function buildGalaxyServersFromConfig(
  logger: LoggerService,
  config: Config,
  pahBaseUrl: string,
): Record<string, any>[] {
  if (!pahBaseUrl) {
    return [];
  }
  let base = pahBaseUrl.trim();
  while (base.endsWith('/')) {
    base = base.slice(0, -1);
  }

  const providerConfigs = config.getOptionalConfig('catalog.providers.rhaap');
  if (!providerConfigs) {
    return [];
  }

  const servers: Record<string, any>[] = [];
  const seen = new Set<string>();

  for (const envId of providerConfigs.keys()) {
    const envConfig = providerConfigs.getConfig(envId);
    if (
      envConfig.has('sync.pahCollections.enabled') &&
      !envConfig.getBoolean('sync.pahCollections.enabled')
    ) {
      continue;
    }
    if (!envConfig.has('sync.pahCollections.repositories')) {
      logger.info(
        `[ansible:create:ee-definition] env "${envId}" has no pahCollections.repositories, skipping`,
      );
      continue;
    }
    const entries =
      envConfig.getOptionalConfigArray('sync.pahCollections.repositories') ??
      [];
    for (const entry of entries) {
      const repoName = entry.getString('name');
      const normalizedRepo = normalizePahRepoIdentifier(repoName);
      if (!normalizedRepo || seen.has(normalizedRepo)) {
        continue;
      }
      seen.add(normalizedRepo);
      servers.push({
        id: `private_hub_${normalizedRepo}`,
        url: `${base}/api/galaxy/content/${repoName}/`,
        token_required: true,
      });
    }
  }
  return servers;
}

/**
 * Looks up the host for an SCM provider's canonical name from the Backstage
 * configuration.
 *
 * Iterates over every environment defined under
 * `catalog.providers.rhaap.<envId>.sync.ansibleGitContents.providers.<provider>`
 * and returns the `host` for the first entry whose `name` matches
 * `canonicalName`.
 *
 * @param config - Backstage configuration root.
 * @param provider - Lowercased SCM provider key (e.g. `"github"`, `"gitlab"`).
 * @param canonicalName - The canonical host name to match (e.g. `"github-public"`).
 * @returns The resolved host string (e.g. `"github.com"`).
 * @throws If the canonical name cannot be found in any environment.
 */
function lookupScmHostFromConfig(
  config: Config,
  provider: string,
  canonicalName: string,
): string {
  const providerConfigs = config.getOptionalConfig('catalog.providers.rhaap');
  if (!providerConfigs) {
    throw new Error(
      `[ansible:create:ee-definition] Cannot resolve SCM host: no catalog.providers.rhaap config found (provider="${provider}", canonicalName="${canonicalName}")`,
    );
  }

  for (const envId of providerConfigs.keys()) {
    const envConfig = providerConfigs.getConfig(envId);
    const configPath = `sync.ansibleGitContents.providers.${provider}`;
    if (!envConfig.has(configPath)) {
      continue;
    }
    const entries = envConfig.getOptionalConfigArray(configPath) ?? [];
    for (const entry of entries) {
      const name = entry.getString('name');
      if (name === canonicalName) {
        const host = entry.getOptionalString('host') ?? `${provider}.com`;
        return host;
      }
    }
  }

  throw new Error(
    `[ansible:create:ee-definition] Cannot resolve SCM host: canonical name "${canonicalName}" not found under any catalog.providers.rhaap.*.sync.ansibleGitContents.providers.${provider}`,
  );
}

/**
 * Normalizes a PAH repository name into the shared identifier format used in
 * both collection sources and generated galaxy_server IDs.
 *
 * Rules:
 * - Lowercase the input.
 * - Replace one or more non-alphanumeric characters with a single underscore.
 * - Trim leading/trailing underscores.
 * - Collapse repeated underscores.
 *
 * @param repo - Raw repository string.
 * @returns Normalized identifier (empty string when input has no alphanumerics).
 */
function normalizePahRepoIdentifier(repo: string): string {
  const normalized = repo
    .toString()
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/_+/g, '_');

  // Use index scanning instead of regex to trim underscores to guarantee
  // linear time and avoid potential regex backtracking (ReDoS) risks.
  // Trim leading/trailing underscores with index scans to keep runtime linear.
  let start = 0;
  let end = normalized.length;
  while (start < end && normalized[start] === '_') {
    start += 1;
  }
  while (end > start && normalized[end - 1] === '_') {
    end -= 1;
  }

  return normalized.slice(start, end);
}

/**
 * Constructs the EE configuration payload sent to the `ansible-creator`
 * service's `/ee` scaffold endpoint.
 *
 * The payload maps user-facing inputs into the snake_case schema expected
 * by the creator service. Conditional fields (collections, python deps, etc.)
 * are only included when non-empty so the service applies its own defaults.
 *
 * Special handling:
 * - When `buildRegistry` starts with `"Private Automation Hub"` and a PAH
 *   base URL is configured, the registry is resolved to the PAH hostname
 *   (protocol prefix stripped).
 * - `registry_tls_verify` is always set explicitly (defaults to `true`).
 *
 * @param params.baseImage - Fully-qualified base container image reference.
 * @param params.eeFileName - Desired EE definition file name (without extension).
 * @param params.collections - Normalised and deduplicated PAH/Galaxy collection list.
 * @param params.scmCollections - SCM-sourced collections with tokenized git URLs.
 * @param params.scmServers - Deduplicated SCM server entries with id, hostname,
 *   and token environment variable name.
 * @param params.pythonDeps - Merged Python requirements.
 * @param params.systemPackages - Merged system packages.
 * @param params.additionalBuildSteps - Custom build steps keyed by phase.
 * @param params.galaxyServers - Galaxy server entries from PAH config.
 * @param params.buildRegistry - Target container registry name.
 * @param params.buildImageName - Target image name (namespace/name format).
 * @param params.registryTlsVerify - Whether to verify TLS for registry
 *   operations (login, pull, push, and image builds).
 * @param params.pahBaseUrl - PAH base URL used to resolve PAH registry entries.
 * @returns A plain object conforming to the creator service's EE config schema.
 */
function buildEEConfig(params: {
  baseImage: string;
  eeFileName: string;
  collections: Collection[];
  scmCollections: Collection[];
  scmServers: ScmServer[];
  pythonDeps: string[];
  systemPackages: string[];
  additionalBuildSteps: AdditionalBuildStep[];
  galaxyServers: Record<string, any>[];
  buildRegistry: string;
  buildImageName: string;
  registryTlsVerify: boolean;
  pahBaseUrl: string;
}): Record<string, any> {
  const eeConfig: Record<string, any> = {
    base_image: params.baseImage,
    ee_file_name: `${params.eeFileName}.yml`,
  };

  // EE content and build steps configuration
  if (params.collections.length > 0) {
    eeConfig.collections = params.collections.map(c => {
      const col: Record<string, any> = { name: c.name };
      if (c.version) col.version = c.version;
      if (c.source) col.source = c.source;
      if (c.type) col.type = c.type;
      return col;
    });
  }
  if (params.scmCollections.length > 0) {
    if (!eeConfig.collections) {
      eeConfig.collections = [];
    }
    eeConfig.collections.push(
      ...params.scmCollections.map(c => {
        const col: Record<string, any> = { name: c.name, type: 'git' };
        if (c.version) col.version = c.version;
        return col;
      }),
    );
  }
  if (params.pythonDeps.length > 0) {
    eeConfig.python_deps = params.pythonDeps;
  }
  if (params.systemPackages.length > 0) {
    eeConfig.system_packages = params.systemPackages;
  }
  if (params.additionalBuildSteps.length > 0) {
    eeConfig.additional_build_steps = buildStepsToObject(
      params.additionalBuildSteps,
    );
  }
  if (params.galaxyServers.length > 0) {
    eeConfig.galaxy_servers = params.galaxyServers;
  }
  if (params.scmServers.length > 0) {
    eeConfig.scm_servers = params.scmServers;
  }

  // EE build and publish configuration
  if (params.buildRegistry) {
    if (
      params.buildRegistry.startsWith('Private Automation Hub') &&
      params.pahBaseUrl
    ) {
      eeConfig.registry = new URL(params.pahBaseUrl).host;
    } else {
      eeConfig.registry = params.buildRegistry;
    }
  }
  if (params.buildImageName) {
    eeConfig.image_name = params.buildImageName;
  }
  eeConfig.registry_tls_verify = params.registryTlsVerify;
  return eeConfig;
}

/**
 * Converts an array of {@link AdditionalBuildStep} objects into the grouped
 * object format expected by `ansible-builder`'s `additional_build_steps`
 * configuration.
 *
 * Multiple steps with the same `stepType` are merged by concatenating their
 * command arrays in encounter order.
 *
 * @param steps - Flat list of build step objects from the UI.
 * @returns An object keyed by step type (e.g. `prepend_base`) whose values
 *   are the concatenated command arrays for that phase.
 */
function buildStepsToObject(
  steps: AdditionalBuildStep[],
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const step of steps) {
    if (!result[step.stepType]) {
      result[step.stepType] = [];
    }
    result[step.stepType].push(...step.commands);
  }
  return result;
}

/**
 * Canonicalizes a user-supplied EE definition name into a stable slug used
 * for both the EE file basename and the workspace directory name.
 *
 * Canonicalization rules:
 * - Trim leading/trailing whitespace.
 * - Keep only the basename component (drop any leading path).
 * - Remove a single trailing `.yml` or `.yaml` extension (case-insensitive).
 * - Lowercase and normalize non `[a-z0-9-_]` characters to `-`.
 * - Collapse repeated dashes and trim edge dashes.
 *
 * @param value - Raw EE definition name from input.
 * @returns Canonical EE slug with no extension.
 * @throws If canonicalization results in an empty slug.
 */
function canonicalizeEEDefinitionName(value: string): string {
  const trimmed = value.toString().trim();
  const baseName = path.basename(trimmed);
  const withoutExtension = baseName.replace(/\.ya?ml$/i, '');
  const canonicalSlug = withoutExtension
    .toLowerCase()
    .replaceAll(/[^a-z0-9-_]/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/(?:^-)|(?:-$)/g, '');

  if (!canonicalSlug) {
    throw new Error(
      '[ansible:create:ee-definition] Invalid eeFileName: canonical name is empty',
    );
  }

  return canonicalSlug;
}

/**
 * Validates the EE definition name provided by the user before it is used in
 * any filesystem path operations.
 *
 * Security constraints:
 * - Must not be absolute.
 * - Must not contain path separators (`/` or `\\`).
 * - Must not resolve to `.` / `..` or contain traversal segments.
 * - Must not contain NUL bytes.
 *
 * @param value - Raw EE definition name from user input.
 * @returns A trimmed, validated file-safe name.
 * @throws If the name is unsafe for filesystem usage.
 */
function validateSafeEEDefinitionName(value: string): string {
  const trimmed = value.toString().trim();
  if (!trimmed) {
    throw new Error(
      '[ansible:create:ee-definition] Invalid eeFileName: value is empty',
    );
  }
  if (trimmed.includes('\0')) {
    throw new Error(
      '[ansible:create:ee-definition] Invalid eeFileName: contains NUL byte',
    );
  }
  if (path.isAbsolute(trimmed)) {
    throw new Error(
      '[ansible:create:ee-definition] Invalid eeFileName: absolute paths are not allowed',
    );
  }
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error(
      '[ansible:create:ee-definition] Invalid eeFileName: path separators are not allowed',
    );
  }
  const normalized = path.posix.normalize(trimmed.replaceAll(/\\/g, '/'));
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  ) {
    throw new Error(
      '[ansible:create:ee-definition] Invalid eeFileName: path traversal is not allowed',
    );
  }
  return trimmed;
}

/**
 * Resolves a target path under a base directory and verifies that the
 * resolved target remains inside that directory.
 *
 * @param baseDir - Intended parent directory.
 * @param fileName - Relative file name to resolve under `baseDir`.
 * @returns Absolute path safely contained within `baseDir`.
 * @throws If resolution escapes the base directory.
 */
function resolvePathWithinDirectory(baseDir: string, fileName: string): string {
  const resolvedBaseDir = path.resolve(baseDir);
  const resolvedTargetPath = path.resolve(baseDir, fileName);
  const relativePath = path.relative(resolvedBaseDir, resolvedTargetPath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(
      '[ansible:create:ee-definition] Invalid path resolution: target escapes EE directory',
    );
  }

  return resolvedTargetPath;
}

/**
 * Patches the scaffolded `.github/workflows/ee-build.yml` CI workflow so
 * that the `ee_dir` input defaults to the EE subdirectory name instead of
 * the repository root (`"."`).
 *
 * Uses a targeted regex replacement rather than a full YAML parse/dump cycle
 * to preserve comments, formatting, and anchors in the workflow file.
 *
 * No-ops gracefully if the workflow file does not exist (e.g. when the
 * creator service did not produce one).
 *
 * @param workspacePath - Absolute path to the scaffolder workspace root.
 * @param contextDirName - Sanitised EE subdirectory name to set as the default.
 */
async function patchWorkflowEeDir(
  workspacePath: string,
  contextDirName: string,
): Promise<void> {
  const workflowPath = path.join(
    workspacePath,
    '.github',
    'workflows',
    'ee-build.yml',
  );

  let content: string;
  try {
    content = await fs.readFile(workflowPath, 'utf-8');
  } catch {
    return;
  }

  // Regex over YAML parse+dump to preserve comments, formatting, and anchors
  const patched = content.replace(
    /^(\s+default:\s*)"\."\s*$/m,
    `$1"${contextDirName}"`,
  );

  if (patched !== content) {
    await fs.writeFile(workflowPath, patched);
  }
}

/**
 * Injects `ignore_certs = true` immediately after the `[galaxy]` section
 * header in an `ansible.cfg` file.
 *
 * This is a temporary workaround for
 * {@link https://github.com/ansible/ansible/issues/86694} where
 * `ansible-builder` does not honour per-server `ssl_verify` settings during
 * collection installation. Once the upstream fix is resolved and backported
 * to downstream ansible-core versions, this patch can be removed.
 *
 * If the `[galaxy]` section is not present the content is returned unchanged.
 *
 * @param content - Raw `ansible.cfg` file content.
 * @returns The patched content with `ignore_certs = true` inserted.
 */
function patchAnsibleCfgGalaxyIgnoreCerts(content: string): string {
  return content.replace(/^(\[galaxy\]\s*$)/m, '$1\nignore_certs = true');
}
