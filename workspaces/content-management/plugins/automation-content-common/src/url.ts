/** Only http(s) URLs may become clickable links; registry content is semi-trusted. */
export function isHttpUrl(value: string | undefined): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
