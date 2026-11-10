/**
 * Copy text to the clipboard, falling back to the legacy execCommand path.
 *
 * The async Clipboard API is permission-gated and denied in some embedded
 * browsers (the portal's in-app preview among them). The deprecated
 * execCommand copy still works there during a real user gesture, so it is
 * the fallback. Both paths failing means the caller should tell the user to
 * select and copy the text manually.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand('copy');
      area.remove();
      return copied;
    } catch {
      return false;
    }
  }
}
