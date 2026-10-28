/** Decorative star; its enclosing action supplies the accessible name. */
export function StarIcon({ selected = false }: { selected?: boolean }) {
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
