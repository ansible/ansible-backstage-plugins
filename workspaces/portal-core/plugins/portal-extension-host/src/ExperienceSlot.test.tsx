import { render, screen } from '@testing-library/react';
import { ExperienceCardSlot, ExperienceTabContent } from './ExperienceSlot';
import type {
  CardContribution,
  TabContribution,
} from '@ansible/portal-extension-api';

// ── Mock portal-extension-api hooks ──────────────────────────────────────────

jest.mock('@ansible/portal-extension-api', () => ({
  useExtensionCards: jest.fn(() => []),
  useExtensionTabs: jest.fn(() => []),
}));

import {
  useExtensionCards,
  useExtensionTabs,
} from '@ansible/portal-extension-api';

const mockUseExtensionCards = useExtensionCards as jest.Mock;
const mockUseExtensionTabs = useExtensionTabs as jest.Mock;

// ── Test fixtures ─────────────────────────────────────────────────────────────

const CardA = () => <div>Card A content</div>;
const CardB = () => <div>Card B content</div>;
const TabContent = () => <div>Tab content</div>;

const makeCardContribution = (
  id: string,
  component: React.ComponentType<any>,
): CardContribution => ({
  id,
  slot: 'overview-left',
  component,
});

const makeTabContribution = (
  id: string,
  component: React.ComponentType<any>,
): TabContribution => ({
  id,
  label: id,
  component,
});

// ── ExperienceCardSlot ────────────────────────────────────────────────────────

describe('ExperienceCardSlot', () => {
  beforeEach(() => {
    mockUseExtensionCards.mockReturnValue([]);
    mockUseExtensionTabs.mockReturnValue([]);
  });

  it('returns null when there are no registered card contributions', () => {
    const { container } = render(
      <ExperienceCardSlot extensionPoint="test-ext-point" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a single card contribution', () => {
    mockUseExtensionCards.mockReturnValue([
      makeCardContribution('card-a', CardA),
    ]);

    render(<ExperienceCardSlot extensionPoint="test-ext-point" />);
    expect(screen.getByText('Card A content')).toBeInTheDocument();
  });

  it('renders multiple card contributions', () => {
    mockUseExtensionCards.mockReturnValue([
      makeCardContribution('card-a', CardA),
      makeCardContribution('card-b', CardB),
    ]);

    render(<ExperienceCardSlot extensionPoint="test-ext-point" />);
    expect(screen.getByText('Card A content')).toBeInTheDocument();
    expect(screen.getByText('Card B content')).toBeInTheDocument();
  });

  it('wraps contributions in the provided slotWrapper', () => {
    mockUseExtensionCards.mockReturnValue([
      makeCardContribution('card-a', CardA),
    ]);

    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <section data-testid="slot-wrapper">{children}</section>
    );

    render(
      <ExperienceCardSlot
        extensionPoint="test-ext-point"
        slotWrapper={Wrapper}
      />,
    );
    expect(screen.getByTestId('slot-wrapper')).toBeInTheDocument();
    expect(screen.getByText('Card A content')).toBeInTheDocument();
  });

  it('passes entity and contentType to the hook', () => {
    const entity = { kind: 'Component', metadata: { name: 'test' } } as any;
    render(
      <ExperienceCardSlot
        extensionPoint="test-ext-point"
        entity={entity}
        contentType="collection"
      />,
    );
    expect(mockUseExtensionCards).toHaveBeenCalledWith(
      'test-ext-point',
      entity,
      'collection',
    );
  });
});

// ── ExperienceTabContent ──────────────────────────────────────────────────────

describe('ExperienceTabContent', () => {
  beforeEach(() => {
    mockUseExtensionTabs.mockReturnValue([]);
  });

  it('returns null when the tab index is out of range', () => {
    mockUseExtensionTabs.mockReturnValue([]);
    const { container } = render(
      <ExperienceTabContent
        extensionPoint="test-ext-point"
        activeTabIndex={0}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the tab at the given index', () => {
    mockUseExtensionTabs.mockReturnValue([
      makeTabContribution('tab-0', TabContent),
    ]);

    render(
      <ExperienceTabContent
        extensionPoint="test-ext-point"
        activeTabIndex={0}
      />,
    );
    expect(screen.getByText('Tab content')).toBeInTheDocument();
  });

  it('renders the second tab when tabIndex is 1', () => {
    const Tab0 = () => <div>Tab 0</div>;
    const Tab1 = () => <div>Tab 1</div>;
    mockUseExtensionTabs.mockReturnValue([
      makeTabContribution('tab-0', Tab0),
      makeTabContribution('tab-1', Tab1),
    ]);

    render(
      <ExperienceTabContent
        extensionPoint="test-ext-point"
        activeTabIndex={1}
      />,
    );
    expect(screen.getByText('Tab 1')).toBeInTheDocument();
    expect(screen.queryByText('Tab 0')).not.toBeInTheDocument();
  });
});
