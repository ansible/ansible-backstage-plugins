import { render, screen } from '@testing-library/react';

// Mock useAsync exactly where it's imported from in the component
jest.mock('react-use/esm/useAsync');

// Mock useApi from @backstage/core-plugin-api
jest.mock('@backstage/core-plugin-api', () => ({
  useApi: jest.fn(),
}));

// Mock useStarredEntities from @backstage/plugin-catalog-react
jest.mock('@backstage/plugin-catalog-react', () => ({
  useStarredEntities: jest.fn(),
  // keep other exports if any are imported elsewhere; not needed here
}));

// Mock InfoCard and Link from @backstage/core-components to simple wrappers
jest.mock('@backstage/core-components', () => ({
  InfoCard: ({ title, children }: any) => (
    <div data-testid="info-card">
      <div data-testid="info-card-title">{title}</div>
      <div>{children}</div>
    </div>
  ),
  Link: ({ to, children }: any) => <a href={to}>{children}</a>,
}));

// Also mock material-ui makeStyles since the component uses classes but rendering does not rely on CSS
jest.mock('@material-ui/core/styles', () => {
  const actual = jest.requireActual('@material-ui/core/styles');
  return {
    ...actual,
    makeStyles: () => () => ({}),
    withStyles: () => (Comp: any) => (props: any) => <Comp {...props} />,
  };
});

// Now import the mocked modules and the component under test
import useAsync from 'react-use/esm/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import { useStarredEntities } from '@backstage/plugin-catalog-react';
import { Favourites } from './Favourites';

// Type the mocks for convenience
const mockedUseAsync = useAsync as jest.MockedFunction<typeof useAsync>;
const mockedUseApi = useApi as jest.MockedFunction<any>;
const mockedUseStarredEntities = useStarredEntities as jest.MockedFunction<any>;

describe('Favourites component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows loading while useAsync loading is true', () => {
    // make useAsync return loading state
    mockedUseAsync.mockReturnValue({
      value: undefined,
      loading: true,
      error: undefined,
    } as any);

    // useStarredEntities can be a simple stub
    mockedUseStarredEntities.mockReturnValue({ isStarredEntity: () => false });

    // useApi mock not used directly, but provide to avoid runtime error
    mockedUseApi.mockReturnValue({
      getEntities: jest.fn(),
    });

    render(<Favourites />);

    expect(screen.getByText(/Loading\.\.\./i)).toBeInTheDocument();
  });

  test('shows error if useAsync returns error', async () => {
    mockedUseAsync.mockReturnValue({
      value: undefined,
      loading: false,
      error: { message: 'boom' },
    } as any);

    mockedUseStarredEntities.mockReturnValue({ isStarredEntity: () => false });
    mockedUseApi.mockReturnValue({ getEntities: jest.fn() });

    render(<Favourites />);

    expect(screen.getByText(/Error:/i)).toBeInTheDocument();
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });

  test('shows no-starred message when there are no starred entities', () => {
    const items = [
      {
        apiVersion: 'v1',
        kind: 'Component',
        metadata: { name: 'comp1', tags: ['ansible'] },
        spec: {},
      },
    ];

    // useAsync returns a successful result (structure: value may be items array OR object with items)
    // Original component expects catalogApi.getEntities() to return either array or { items } shape.
    // Here emulate the { items } shape.
    mockedUseAsync.mockReturnValue({
      value: { items },
      loading: false,
      error: undefined,
    } as any);

    // isStarredEntity returns false for all entities
    mockedUseStarredEntities.mockReturnValue({ isStarredEntity: () => false });
    mockedUseApi.mockReturnValue({ getEntities: jest.fn() });

    render(<Favourites />);

    // message shown when no starred entries
    expect(screen.getByTestId('no-starred-list')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Click the star beside an Ansible entity name to add it to this list!/i,
      ),
    ).toBeInTheDocument();
  });

  test('renders starred entities list with correct links for Template and Component', () => {
    // Prepare two entities: one Template and one Component
    const items = [
      {
        apiVersion: 'v1',
        kind: 'Template',
        metadata: { name: 'template-1', tags: ['ansible'] },
        spec: {},
      },
      {
        apiVersion: 'v1',
        kind: 'Component',
        metadata: { name: 'comp-2', tags: ['ansible'] },
        spec: {},
      },
    ];

    // useAsync returns { items }
    mockedUseAsync.mockReturnValue({
      value: { items },
      loading: false,
      error: undefined,
    } as any);

    // isStarredEntity returns true for both items
    mockedUseStarredEntities.mockReturnValue({
      isStarredEntity: (entity: any) =>
        ['template-1', 'comp-2'].includes(entity.metadata.name),
    } as any);

    mockedUseApi.mockReturnValue({ getEntities: jest.fn() });

    render(<Favourites />);

    // starred list should exist
    const list = screen.getByTestId('starred-list');
    expect(list).toBeInTheDocument();

    // The two entity names should be present as links
    const templateLink = screen.getByText('template-1') as HTMLAnchorElement;
    const compLink = screen.getByText('comp-2') as HTMLAnchorElement;

    expect(templateLink).toBeInTheDocument();
    expect(compLink).toBeInTheDocument();

    // Because our mocked Link renders <a href={to}>, verify the hrefs follow component logic
    // For Template:
    expect(templateLink.closest('a')).toHaveAttribute(
      'href',
      '../../../create/templates/default/template-1',
    );

    // For Component:
    expect(compLink.closest('a')).toHaveAttribute(
      'href',
      '../../../catalog/default/component/comp-2',
    );

    // Also, kind labels should appear for each entry (Template / Component)
    expect(screen.getAllByText('Template').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Component').length).toBeGreaterThanOrEqual(1);
  });
});
