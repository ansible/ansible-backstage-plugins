export const CONTROLLER_TEMPLATE_TAG = 'use-in-controller';

export interface ControllerTemplateSource {
  name: string;
  image: string;
  controllerRepository?: { registry: string; repository: string };
}

export function readControllerTemplateSource(
  search: string,
): ControllerTemplateSource | undefined {
  const params = new URLSearchParams(search);
  if (params.get('create') !== CONTROLLER_TEMPLATE_TAG) return undefined;

  const name = params.get('eeName')?.trim();
  const image = params.get('eeImage')?.trim();
  if (!name || !image) return undefined;

  const registry = params.get('eeRegistry')?.trim();
  const repository = params.get('eeRepository')?.trim();
  return {
    name,
    image,
    ...(registry &&
      repository && { controllerRepository: { registry, repository } }),
  };
}

export function controllerTemplateNavigationState(
  source: ControllerTemplateSource,
) {
  const { controllerRepository, ...initialFormData } = source;
  return {
    initialFormData,
    ...(controllerRepository && { controllerRepository }),
  };
}
