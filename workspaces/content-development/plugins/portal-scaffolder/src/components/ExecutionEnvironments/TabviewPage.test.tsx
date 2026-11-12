import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EETabs } from './TabviewPage';

jest.mock('@backstage/core-components', () => ({
  Page: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Header: ({ title }: { title: React.ReactNode }) => <header>{title}</header>,
  Content: ({ children }: React.PropsWithChildren) => <main>{children}</main>,
}));

jest.mock('./catalog/CatalogContent', () => ({
  EntityCatalogContent: ({
    onTabSwitch,
  }: {
    onTabSwitch: (tab: number) => void;
  }) => (
    <button type="button" onClick={() => onTabSwitch(1)}>
      Create definition
    </button>
  ),
}));

it('renders the legacy definitions catalog and hands creation to the host', async () => {
  render(
    <MemoryRouter initialEntries={['/self-service/ee/catalog']}>
      <Routes>
        <Route path="/self-service/ee/catalog" element={<EETabs />} />
        <Route path="/create" element={<h1>Host scaffolder</h1>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(
    screen.getByRole('heading', {
      name: 'Execution Environments definition files',
    }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Create' })).toBeNull();
  await userEvent.click(
    screen.getByRole('button', { name: 'Create definition' }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Host scaffolder' }),
  ).toBeInTheDocument();
});
