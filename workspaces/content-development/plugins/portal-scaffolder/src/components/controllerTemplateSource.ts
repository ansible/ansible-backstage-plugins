export const CONTROLLER_TEMPLATE_TAG = 'use-in-controller';

export interface ControllerTemplateSource {
  name: string;
  image: string;
}

export function readControllerTemplateSource(
  search: string,
): ControllerTemplateSource | undefined {
  const params = new URLSearchParams(search);
  if (params.get('create') !== CONTROLLER_TEMPLATE_TAG) return undefined;

  const name = params.get('eeName')?.trim();
  const image = params.get('eeImage')?.trim();
  return name && image ? { name, image } : undefined;
}
