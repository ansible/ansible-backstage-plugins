/** Only http(s) URLs may become clickable links; registry content is semi-trusted. */
export function isHttpUrl(value: string | undefined): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const { protocol, username, password } = new URL(value);
    return (
      (protocol === 'http:' || protocol === 'https:') &&
      username === '' &&
      password === ''
    );
  } catch {
    return false;
  }
}
