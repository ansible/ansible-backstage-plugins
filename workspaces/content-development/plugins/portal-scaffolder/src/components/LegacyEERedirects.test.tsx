import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { LegacyEERedirects } from './LegacyEERedirects';

function Destination() {
  const { pathname } = useLocation();
  return <div data-testid="destination">{pathname}</div>;
}

it.each([
  ['/self-service/ee', '/content/ee'],
  ['/self-service/ee/catalog', '/content/ee'],
  ['/self-service/ee/create', '/content/ee'],
  ['/self-service/ee/catalog/old-name', '/content/ee'],
  ['/self-service/ee/details/old-name', '/content/ee'],
  ['/self-service/ee/unknown/path', '/content/ee'],
  ['/self-service/ee/catalog/team/my-ee', '/content/ee/catalog/team/my-ee'],
])('redirects %s to %s', async (path, destination) => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/self-service/ee/*" element={<LegacyEERedirects />} />
        <Route path="/content/ee/*" element={<Destination />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByTestId('destination')).toHaveTextContent(
    destination,
  );
});
