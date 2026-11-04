import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';
import styles from './StatusBadge.module.css';

it.each([
  ['Available', 'success'],
  ['Syncing', 'info'],
  ['Failed', 'danger'],
  ['Stale', 'warning'],
  ['Definition file', 'info'],
  ['External registry', 'neutral'],
] as const)('renders %s with the %s tone', (label, tone) => {
  const { container } = render(<StatusBadge tone={tone}>{label}</StatusBadge>);
  expect(screen.getByText(label)).toBeTruthy();
  expect(container.querySelector(`[data-status="${tone}"]`)).toBeTruthy();
});

it('defaults to a small filled badge with the native metadata shape', () => {
  const { container } = render(
    <StatusBadge tone="neutral">External registry</StatusBadge>,
  );
  const badge = container.querySelector('.bui-Badge');

  expect(badge?.getAttribute('data-size')).toBe('small');
  expect(badge?.classList.contains(styles.neutral)).toBe(true);
  expect(badge?.classList.contains(styles.withIcon)).toBe(false);
  expect(badge?.classList.contains(styles.outline)).toBe(false);
});

it('keeps the existing filled status treatment as the default', () => {
  const { container } = render(
    <StatusBadge tone="success">Available</StatusBadge>,
  );
  const badge = container.querySelector('.bui-Badge');

  expect(badge?.classList.contains(styles.success)).toBe(true);
  expect(badge?.classList.contains(styles.withIcon)).toBe(false);
  expect(badge?.classList.contains(styles.outline)).toBe(false);
  expect(badge?.getAttribute('data-size')).toBe('small');
});

it('renders its icon inside a small outlined status pill', () => {
  const { container } = render(
    <StatusBadge
      tone="success"
      icon={<span data-testid="status-icon">✓</span>}
      size="small"
      variant="outline"
    >
      Available
    </StatusBadge>,
  );
  const badge = container.querySelector('.bui-Badge');

  expect(screen.getByText('Available')).toBeTruthy();
  expect(badge?.classList.contains(styles.success)).toBe(true);
  expect(badge?.classList.contains(styles.withIcon)).toBe(true);
  expect(badge?.classList.contains(styles.outline)).toBe(true);
  expect(badge?.getAttribute('data-size')).toBe('small');
  expect(
    badge
      ?.querySelector('.bui-BadgeIcon')
      ?.contains(screen.getByTestId('status-icon')),
  ).toBe(true);
});
