import { EEDefinitionInput } from '../types';

const PAH_SOURCE_PREFIX = 'Private Automation Hub';
const PAH_NORMALIZED_PREFIX = 'private_hub_';
const SCM_SOURCE_SEGMENT_COUNT = 4;

function registryHostForReadme(buildRegistry: string, pahBaseUrl: string): string {
  const reg = buildRegistry.trim();
  const base = pahBaseUrl.trim();
  if (reg.startsWith('Private Automation Hub') && base) {
    try {
      return new URL(base).host;
    } catch {
      return reg;
    }
  }
  return reg;
}

function buildAapUsageSteps(params: { imageRef: string }): string {
  const aapImageUrlStep = params.imageRef
    ? `2. Click **Create execution environment** and enter the image URL: \`${params.imageRef}\``
    : '2. Click **Create execution environment** and enter the image URL.';

  return `To use it in Ansible Automation Platform:

1. Go to **Automation Execution** > **Infrastructure** > **Execution Environments**.
${aapImageUrlStep}
3. Select this execution environment in your job templates.`;
}

function buildUseThisEeSection(params: {
  publishToSCM: boolean;
  hasAnsibleCfg: boolean;
  rawBuildRegistry: string;
  buildImageName: string;
  registryHost: string;
  imageRef: string;
}): string {
  const aapUsageSteps = buildAapUsageSteps({ imageRef: params.imageRef });

  if (!params.publishToSCM) {
    return `## Use this execution environment

To use this EE, build and push it to your container registry first, then add it in Ansible Automation Platform. If your EE uses collections from private sources, update the token settings in \`ansible.cfg\` before building.

${aapUsageSteps}`;
  }

  if (params.rawBuildRegistry && params.buildImageName && params.imageRef) {
    const ansibleCfgNote = params.hasAnsibleCfg
      ? 'If your EE uses collections from private sources (Automation Hub, private automation hub), update the token settings in `ansible.cfg` before building.'
      : '';
    const ansibleCfgNoteBlock = ansibleCfgNote ? `${ansibleCfgNote}\n\n` : '';

    return `## Use this execution environment

${ansibleCfgNoteBlock}
Log in to the registry and pull the image:

\`\`\`bash
podman login ${params.registryHost}
podman pull ${params.imageRef}
\`\`\`

If the registry uses a self-signed certificate, you may need to append \`--tls-verify=false\` to each \`podman\` command.

${aapUsageSteps}`;
  }

  return `## Use this execution environment

To use this EE, build and push it to your container registry first, then add it in Ansible Automation Platform under Automation Execution > Infrastructure > Execution Environments.

${aapUsageSteps}`;
}

export function generateReadme(
  values: EEDefinitionInput,
  publishToSCM: boolean,
  hasAnsibleCfg: boolean,
): string {
  const eeFileName = values.eeFileName || 'execution-environment';
  const eeDescription = values.eeDescription || '';
  const tags = values.tags || [];
  const baseImage = values.customBaseImage || values.baseImage || '';
  const rawBuildRegistry = values.buildRegistry || '';
  const pahBaseUrl = String((values as { pahBaseUrl?: string }).pahBaseUrl ?? '');
  const registryHost = registryHostForReadme(rawBuildRegistry, pahBaseUrl);
  const buildImageName = values.buildImageName?.trim() || '';
  const buildImageTag = values.buildImageTag?.trim() || 'latest';
  const imageRef =
    rawBuildRegistry && buildImageName
      ? `${registryHost}/${buildImageName}:${buildImageTag}`
      : '';

  const collections = values.collections || [];
  const pythonRequirements = values.pythonRequirements || [];
  const systemPackages = values.systemPackages || [];

  const BACKSLASH = String.fromCodePoint(92);
  const ESCAPED_BACKSLASH = String.raw`\\`;
  const ESCAPED_PIPE = String.raw`\|`;

  const escapeTableCell = (value: string) =>
    value
      .replaceAll(BACKSLASH, ESCAPED_BACKSLASH)
      .replaceAll('|', ESCAPED_PIPE);
  const getCollectionSourceDisplay = (source?: string, type?: string) => {
    if (!source) {
      return type ?? '-';
    }

    // PAH sources come from the UI as "Private Automation Hub / <repo>".
    // Render as "Private Automation Hub (<repo>)".
    if (source.startsWith(PAH_SOURCE_PREFIX)) {
      const parts = source.split('/').map(s => s.trim()).filter(Boolean);
      const repo = parts.length >= 2 ? parts.slice(1).join(' / ') : '';
      return repo ? `${PAH_SOURCE_PREFIX} (${repo})` : PAH_SOURCE_PREFIX;
    }

    // The action normalizes PAH sources for ansible-builder as "private_hub_<repo>".
    // If that leaks into the README input, still render a readable PAH label.
    if (source.startsWith(PAH_NORMALIZED_PREFIX)) {
      const repo = source.slice(PAH_NORMALIZED_PREFIX.length);
      return repo ? `${PAH_SOURCE_PREFIX} (${repo})` : PAH_SOURCE_PREFIX;
    }

    // SCM sources come from the UI as "<provider>/<canonical>/<org>/<repo>".
    // Render as "Provider (canonical-name)", e.g. Github (github-public).
    const segments = source.split('/').map(s => s.trim()).filter(Boolean);
    if (segments.length >= SCM_SOURCE_SEGMENT_COUNT) {
      const providerKey = segments[0].toLocaleLowerCase('en-US');
      const canonical = segments[1];
      const providerLabel =
        providerKey.length > 0
          ? providerKey[0].toLocaleUpperCase('en-US') + providerKey.slice(1)
          : canonical;
      return `${providerLabel} (${canonical})`;
    }

    return source;
  };

  const collectionsRows = collections
    .map(c => {
      const name = escapeTableCell(c.name ?? '');
      const version = escapeTableCell(c.version ?? '-');
      const source = escapeTableCell(getCollectionSourceDisplay(c.source, c.type));
      return `| ${name} | ${version} | ${source} |`;
    })
    .join('\n');

  const collectionsSection =
    collections.length > 0
      ? ['| Collection | Version | Source |', '|---|---|---|', collectionsRows].join(
          '\n',
        )
      : 'No additional collections. This EE uses only what the base image provides.';

  const pythonPackagesList = pythonRequirements
    .map(req => `- \`${req}\``)
    .join('\n');
  const pythonPackagesSection =
    pythonRequirements.length > 0
      ? ['### Python packages', '', pythonPackagesList].join('\n')
      : '';

  const systemPackagesList = systemPackages.map(pkg => `- \`${pkg}\``).join('\n');
  const systemPackagesSection =
    systemPackages.length > 0
      ? ['### System packages', '', systemPackagesList].join('\n')
      : '';

  const tagsText =
    tags.length > 0 ? tags.map(t => `\`${t}\``).join(', ') : 'None';
  const descriptionText =
    eeDescription && eeDescription !== 'Execution Environment'
      ? eeDescription
      : 'No description provided. Update the description in your EE template so others know what this execution environment is for.';

  const detailsImageRegistryLine =
    rawBuildRegistry && buildImageName
      ? `- **Image registry:** \`${imageRef}\``
      : '';
  const detailsExtraLines = detailsImageRegistryLine
    ? `\n${detailsImageRegistryLine}`
    : '';

  const useThisEeSection = buildUseThisEeSection({
    publishToSCM,
    hasAnsibleCfg,
    rawBuildRegistry,
    buildImageName,
    registryHost,
    imageRef,
  });

  return `# ${eeFileName}

${descriptionText}

## What's included

### Ansible collections

${collectionsSection}

${pythonPackagesSection}${pythonPackagesSection && systemPackagesSection ? '\n\n' : ''}${systemPackagesSection}

## Details

- **Tags:** ${tagsText}
${detailsExtraLines}

${useThisEeSection}

## Build details

- **Base image:** \`${baseImage}\`
- **Definition file:** \`${eeFileName}.yml\`
- **Template file:** \`${eeFileName}-template.yml\` - import this into Ansible automation portal to let others create EEs from the same starting point.

To make changes, use this EE's template in Ansible automation portal or rebuild manually with \`ansible-builder\` and the definition file.
`;
}
