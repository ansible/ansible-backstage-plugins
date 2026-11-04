import type { ReactElement } from 'react';

/** Decorative configuration icon for missing content sources. */
export function SettingsIcon(): ReactElement {
  return (
    <svg
      aria-hidden="true"
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 3 3-1 2 2 3-2v-3l3-2-1-4-3-1-1-3Z" />
      <circle cx="11" cy="11" r="3" />
    </svg>
  );
}

/** Decorative star; its enclosing action supplies the accessible name. */
export function StarIcon({
  selected = false,
}: {
  selected?: boolean;
}): ReactElement {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill={selected ? 'currentColor' : 'none'}
      stroke="currentColor"
    >
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z" />
    </svg>
  );
}
/** Decorative help icon; the enclosing control supplies its accessible name. */
export function HelpIcon(): ReactElement {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v1" />
    </svg>
  );
}

/** Decorative search icon for catalog empty states. */
export function SearchIcon(): ReactElement {
  return (
    <svg
      aria-hidden="true"
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 6 6" />
    </svg>
  );
}
