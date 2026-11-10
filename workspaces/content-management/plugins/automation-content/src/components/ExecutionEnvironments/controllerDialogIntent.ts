/**
 * Remembers a "Use in Controller" intent across the OAuth login redirect.
 *
 * The AAP session is established before the dialog opens (the Backstage
 * login prompt cannot stack above a BUI modal). When that login redirects,
 * the page reloads and the dialog state is lost — so the intent is parked in
 * the URL, which the auth flow preserves in its redirect target, and taken
 * back on mount to reopen the dialog where the user left off.
 */
export const CONTROLLER_INTENT_PARAM = 'useInController';

/** Park the intent in the current URL before requesting the AAP session. */
export function setControllerIntent(ref: string): void {
  const params = new URLSearchParams(window.location.search);
  params.set(CONTROLLER_INTENT_PARAM, ref);
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}?${params}${window.location.hash}`,
  );
}

/**
 * Read the intent without clearing it. Used on mount: the value must survive
 * a further auth redirect, so it is only taken once the session resolves.
 */
export function peekControllerIntent(): string | null {
  return new URLSearchParams(window.location.search).get(
    CONTROLLER_INTENT_PARAM,
  );
}

/** Remove the intent from the URL; the caller decides what to do with it. */
export function clearControllerIntent(): void {
  const params = new URLSearchParams(window.location.search);
  if (!params.has(CONTROLLER_INTENT_PARAM)) return;
  params.delete(CONTROLLER_INTENT_PARAM);
  const query = params.toString();
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${query ? `?${query}` : ''}${
      window.location.hash
    }`,
  );
}

/**
 * Read and clear the intent, if any. Returns the parked value — the artifact
 * ref on the images page, a truthy marker on the details page where the ref
 * is already in the URL.
 */
export function takeControllerIntent(): string | null {
  const params = new URLSearchParams(window.location.search);
  const value = params.get(CONTROLLER_INTENT_PARAM);
  if (value === null) return null;
  clearControllerIntent();
  return value;
}
