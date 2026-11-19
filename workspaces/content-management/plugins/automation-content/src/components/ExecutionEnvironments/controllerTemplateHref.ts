export function controllerTemplateHref(
  templatesPath: string,
  registry: string,
  repository: string,
  pullReference: string,
): string {
  const params = new URLSearchParams({
    create: 'use-in-controller',
    eeName: repository.substring(repository.lastIndexOf('/') + 1),
    eeImage: pullReference,
    eeRegistry: registry,
    eeRepository: repository,
  });
  return `${templatesPath}?${params}`;
}
