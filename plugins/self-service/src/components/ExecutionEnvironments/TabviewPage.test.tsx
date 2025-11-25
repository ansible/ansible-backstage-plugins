import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --------- Mocks for Backstage core components to keep tests simple ----------
jest.mock('@backstage/core-components', () => ({
  Page: ({ children }: any) => <div data-testid="page">{children}</div>,
  Header: ({ title }: any) => <header data-testid="header">{title}</header>,
  // HeaderTabs: render a button per tab and call onChange(index) when clicked
  HeaderTabs: ({ selectedIndex, onChange, tabs }: any) => (
    <div data-testid="header-tabs">
      {tabs.map((t: any, i: number) => (
        <button
          key={i}
          data-testid={`tab-btn-${i}`}
          aria-pressed={selectedIndex === i}
          onClick={() => onChange(i)}
        >
          {/* tabs label may be JSX */}
          <span data-testid={`tab-label-${i}`}>
            {typeof t.label === 'string'
              ? t.label
              : (t.label?.props?.children ?? `tab-${i}`)}
          </span>
        </button>
      ))}
    </div>
  ),
  Content: ({ children }: any) => <main data-testid="content">{children}</main>,
}));

// --------- Mock the three content components used by EETabs -----------------
jest.mock('./catalog/CatalogContent', () => ({
  EntityCatalogContent: ({ onTabSwitch }: any) => (
    <div data-testid="entity-catalog-content">
      EntityCatalogContent
      <button data-testid="to-create" onClick={() => onTabSwitch(1)}>
        go-create
      </button>
    </div>
  ),
}));

jest.mock('./create/CreateContent', () => ({
  CreateContent: () => <div data-testid="create-content">CreateContent</div>,
}));

// --------- Mock useLocation so tests control location.state -----------------
// Keep a jest.fn() the tests can update per-case
const mockUseLocation = jest.fn().mockReturnValue({ pathname: '/', state: {} });

// Mock react-router-dom properly: preserve actual exports and override hooks we need.
// Note: place this mock BEFORE importing the component under test.
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    // useLocation returns the current value of mockUseLocation()
    useLocation: () => mockUseLocation(),
    // provide a navigate mock function so useNavigate() returns a function
    useNavigate: () => jest.fn(),
    // safe stubs for other router utilities/components your components may use
    useParams: () => ({}),
    Link: ({ children }: any) => children,
  };
});

// Now import the component under test after mocks are declared
import { EETabs, EEHeader } from './TabviewPage'; // adjust path if needed

describe('EETabs + EEHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders header and default Catalog tab content when no location.state', () => {
    // ensure useLocation returns {} state
    mockUseLocation.mockReturnValue({ pathname: '/', state: {} });

    render(<EETabs />);

    // Header exists
    expect(screen.getByTestId('header')).toBeInTheDocument();
    // Page and content exist
    expect(screen.getByTestId('page')).toBeInTheDocument();
    expect(screen.getByTestId('content')).toBeInTheDocument();

    // Default selected tab is Catalog (index 0) -> EntityCatalogContent should render
    const catalog = screen.getByTestId('entity-catalog-content');
    expect(catalog).toBeInTheDocument();

    // Ensure HeaderTabs shows tab buttons (now only Catalog and Create)
    expect(screen.getByTestId('header-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('tab-btn-0')).toBeInTheDocument();
    expect(screen.getByTestId('tab-btn-1')).toBeInTheDocument();
    // removed check for a third tab
  });

  test('honors initial tabIndex from location.state (Create tab)', () => {
    // simulate navigation state setting tabIndex to 1 (Create)
    mockUseLocation.mockReturnValue({ pathname: '/', state: { tabIndex: 1 } });

    render(<EETabs />);

    // Create content should be visible
    expect(screen.queryByTestId('create-content')).toBeInTheDocument();
    // Catalog content should not be present
    expect(
      screen.queryByTestId('entity-catalog-content'),
    ).not.toBeInTheDocument();
  });

  test('clicking header tab buttons switches content (Catalog -> Create)', async () => {
    // default state
    mockUseLocation.mockReturnValue({ pathname: '/', state: {} });

    render(<EETabs />);

    // Initially Catalog
    expect(screen.getByTestId('entity-catalog-content')).toBeInTheDocument();

    // Click on tab 1 (Create)
    await userEvent.click(screen.getByTestId('tab-btn-1'));

    // Create content should appear
    expect(screen.getByTestId('create-content')).toBeInTheDocument();
    // Catalog content should not be present now
    expect(
      screen.queryByTestId('entity-catalog-content'),
    ).not.toBeInTheDocument();
  });

  test('content can programmatically switch tabs using onTabSwitch callback', async () => {
    mockUseLocation.mockReturnValue({ pathname: '/', state: {} });

    render(<EETabs />);

    // Initially Catalog exists
    expect(screen.getByTestId('entity-catalog-content')).toBeInTheDocument();

    // Click the internal "go-create" button inside EntityCatalogContent which calls onTabSwitch(1)
    await userEvent.click(screen.getByTestId('to-create'));

    // After that, CreateContent should be shown
    expect(screen.getByTestId('create-content')).toBeInTheDocument();
  });
});

describe('EEHeader', () => {
  test('renders header title and technology preview badge', () => {
    render(<EEHeader />);

    // Header title is rendered inside the Header mock (we rendered children via Header's title prop)
    const header = screen.getByTestId('header');
    expect(header).toBeInTheDocument();

    // The title text should be present somewhere in the header's rendered title
    expect(
      screen.getByText(/Execution Environments definition files/i),
    ).toBeInTheDocument();
    // The Technology Preview badge text should be present
    expect(screen.getByText(/Technology Preview/i)).toBeInTheDocument();
  });
});
