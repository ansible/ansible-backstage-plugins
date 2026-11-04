import { render, screen } from '@testing-library/react';
import type { Collection } from '../../api';
import { CollectionEnvironmentsTable } from './CollectionEnvironmentsTable';
import styles from '../ExecutionEnvironments/details.module.css';

it('renders providing environments as visibly styled links', async () => {
  const environmentRef = 'registry.example.net/ansible/ee@sha256:abc';
  const version: Collection = {
    namespace: 'ansible',
    name: 'posix',
    fqcn: 'ansible.posix',
    version: '2.2.2',
    counts: { plugins: 23 },
    providedBy: [environmentRef],
  };

  render(
    <CollectionEnvironmentsTable
      versions={[version]}
      environmentBase="/content/ee"
    />,
  );

  const link = await screen.findByRole('link', { name: environmentRef });
  expect(link.getAttribute('href')).toBe(
    `/content/ee/${encodeURIComponent(environmentRef)}`,
  );
  expect(link.className.includes(styles.infoLink)).toBe(true);
});
