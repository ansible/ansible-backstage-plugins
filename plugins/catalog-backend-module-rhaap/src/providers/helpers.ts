export function normalizeTags(tags: string[]): string[] {
  return tags.map(tag =>
    tag
      .toLowerCase()
      .replaceAll(/[^a-z0-9+#-]/g, '-')
      .replaceAll(/-+/g, '-')
      .replaceAll(/^-|-$/g, ''),
  );
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replaceAll(/\/$/g, '');
}
