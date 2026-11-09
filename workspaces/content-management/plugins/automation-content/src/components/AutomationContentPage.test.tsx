import '@testing-library/jest-dom';
import {
  fireEvent,
  render as renderComponent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { wrapInTestApp } from '@backstage/test-utils';
import { AutomationContentPage } from './AutomationContentPage';

jest.mock('./views', () => ({
  OverviewView: ({
    onOpenEnvironment,
  }: {
    onOpenEnvironment: (ref: string) => void;
  }) => (
    <button onClick={() => onOpenEnvironment('registry/ee@sha256:abc')}>
      Open EE
    </button>
  ),
  EnvironmentView: ({
    onOpenCollection,
  }: {
    onOpenCollection: (fqcn: string) => void;
  }) => (
    <button onClick={() => onOpenCollection('ansible.builtin')}>
      Open EE collection
    </button>
  ),
  CollectionView: ({
    onOpenItem,
  }: {
    onOpenItem: (fqcn: string, itemType: string) => void;
  }) => (
    <>
      <button
        onClick={() => onOpenItem('ansible.builtin.same_name', 'callback')}
      >
        Open callback row
      </button>
      <button onClick={() => onOpenItem('ansible.builtin.same_name', 'filter')}>
        Open filter row
      </button>
    </>
  ),
  ContentItemView: ({
    environmentRef,
    fqcn,
    itemType,
  }: {
    environmentRef: string;
    fqcn: string;
    itemType?: string;
  }) => (
    <div data-testid="selected-item">
      {environmentRef}|{fqcn}|{itemType ?? ''}
    </div>
  ),
}));

jest.mock('./ArtifactViews', () => ({
  ArtifactListView: ({
    type,
    onOpen,
  }: {
    type: string;
    onOpen: (ref: string) => void;
  }) => (
    <button onClick={() => onOpen('registry/skills@sha256:abc')}>
      Open {type} artifact
    </button>
  ),
  ArtifactDetailView: ({
    onOpenItem,
  }: {
    onOpenItem: (fqcn: string, itemType: string) => void;
  }) => (
    <>
      <button
        onClick={() => onOpenItem('ansible.builtin.same_name', 'callback')}
      >
        Open callback row
      </button>
      <button onClick={() => onOpenItem('ansible.builtin.same_name', 'filter')}>
        Open filter row
      </button>
    </>
  ),
}));

const LocationProbe = () => {
  const location = useLocation();
  return (
    <output data-testid="current-url">
      {location.pathname}
      {location.search}
    </output>
  );
};

const renderPage = (route: string) =>
  renderComponent(
    wrapInTestApp(
      <>
        <AutomationContentPage />
        <LocationProbe />
      </>,
      { routeEntries: [route] },
    ),
  );

const currentParams = () => {
  const url = screen.getByTestId('current-url').textContent ?? '';
  return new URLSearchParams(url.slice(url.indexOf('?') + 1));
};

describe('automation content URL navigation', () => {
  it('preserves legacy mode through artifact, item, crumb, and reload navigation', async () => {
    const route = `/automation-content?${new URLSearchParams({
      portalFrontend: 'legacy',
      type: 'skill',
      keep: 'yes',
    })}`;
    const rendered = renderPage(route);

    fireEvent.click(
      screen.getByRole('button', { name: 'Open skill artifact' }),
    );
    await waitFor(() =>
      expect(currentParams().get('portalFrontend')).toBe('legacy'),
    );
    expect(currentParams().get('keep')).toBe('yes');
    expect(currentParams().get('artifact')).toBe('registry/skills@sha256:abc');

    fireEvent.click(screen.getByRole('button', { name: 'Open callback row' }));
    await waitFor(() =>
      expect(currentParams().get('itemType')).toBe('callback'),
    );
    expect(currentParams().get('portalFrontend')).toBe('legacy');
    expect(currentParams().get('artifact')).toBe('registry/skills@sha256:abc');
    expect(screen.getByTestId('selected-item')).toHaveTextContent(
      'registry/skills@sha256:abc|ansible.builtin.same_name|callback',
    );

    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'breadcrumb' })).getByText(
        'Skills',
      ),
    );
    await waitFor(() => expect(currentParams().has('item')).toBe(false));
    expect(currentParams().get('portalFrontend')).toBe('legacy');
    expect(currentParams().get('keep')).toBe('yes');
    expect(currentParams().has('artifact')).toBe(false);
    expect(currentParams().has('itemType')).toBe(false);

    fireEvent.click(
      screen.getByRole('button', { name: 'Open skill artifact' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open filter row' }));
    await waitFor(() => expect(currentParams().get('itemType')).toBe('filter'));
    const deepLink = screen.getByTestId('current-url').textContent ?? '';

    rendered.unmount();
    renderPage(deepLink);
    expect(screen.getByTestId('selected-item')).toHaveTextContent(
      'registry/skills@sha256:abc|ansible.builtin.same_name|filter',
    );
    expect(currentParams().get('portalFrontend')).toBe('legacy');
  });

  it('clears stale selection when changing artifact tabs but keeps unrelated query state', async () => {
    const route = `/automation-content?${new URLSearchParams({
      portalFrontend: 'legacy',
      type: 'skill',
      artifact: 'registry/skills@sha256:abc',
      item: 'some.skill',
      itemType: 'skill',
      keep: 'yes',
    })}`;
    renderPage(route);

    fireEvent.click(screen.getByRole('tab', { name: 'Collection artifacts' }));

    await waitFor(() => expect(currentParams().get('type')).toBe('collection'));
    expect(currentParams().get('portalFrontend')).toBe('legacy');
    expect(currentParams().get('keep')).toBe('yes');
    for (const key of ['artifact', 'item', 'itemType', 'ee', 'collection']) {
      expect(currentParams().has(key)).toBe(false);
    }
  });

  it('keeps legacy EE deep links and selects duplicate FQCNs by type on the URL', async () => {
    const eeRef = 'registry/ee@sha256:abc';
    renderPage(
      `/automation-content?${new URLSearchParams({
        portalFrontend: 'legacy',
        ee: eeRef,
      })}`,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open EE collection' }));
    await waitFor(() =>
      expect(currentParams().get('collection')).toBe('ansible.builtin'),
    );
    expect(currentParams().get('ee')).toBe(eeRef);
    expect(currentParams().get('portalFrontend')).toBe('legacy');

    fireEvent.click(screen.getByRole('button', { name: 'Open filter row' }));
    await waitFor(() => expect(currentParams().get('itemType')).toBe('filter'));
    expect(currentParams().get('ee')).toBe(eeRef);
    expect(currentParams().get('portalFrontend')).toBe('legacy');
    expect(screen.getByTestId('selected-item')).toHaveTextContent(
      `${eeRef}|ansible.builtin.same_name|filter`,
    );

    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'breadcrumb' })).getByText(
        'ansible.builtin',
      ),
    );
    await waitFor(() => expect(currentParams().has('item')).toBe(false));
    expect(currentParams().get('collection')).toBe('ansible.builtin');
    expect(currentParams().get('itemType')).toBeNull();
    expect(currentParams().get('portalFrontend')).toBe('legacy');
  });
});
