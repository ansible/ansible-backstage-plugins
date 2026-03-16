import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EntityLinkButton } from './EntityLinkButton';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const renderWithRouter = (ui: React.ReactElement) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
};

describe('EntityLinkButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders children', () => {
    renderWithRouter(
      <EntityLinkButton linkPath="/test">Click Me</EntityLinkButton>,
    );

    expect(screen.getByText('Click Me')).toBeInTheDocument();
  });

  it('renders as a button element', () => {
    renderWithRouter(
      <EntityLinkButton linkPath="/test">Test</EntityLinkButton>,
    );

    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('navigates on click', () => {
    renderWithRouter(
      <EntityLinkButton linkPath="/my-entity">Entity</EntityLinkButton>,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(mockNavigate).toHaveBeenCalledWith('/my-entity');
  });

  it('navigates on mousedown', () => {
    renderWithRouter(
      <EntityLinkButton linkPath="/entity-path">Entity</EntityLinkButton>,
    );

    fireEvent.mouseDown(screen.getByRole('button'));

    expect(mockNavigate).toHaveBeenCalledWith('/entity-path');
  });

  it('navigates on Enter key press', () => {
    renderWithRouter(
      <EntityLinkButton linkPath="/entity">Entity</EntityLinkButton>,
    );

    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });

    expect(mockNavigate).toHaveBeenCalledWith('/entity');
  });

  it('navigates on Space key press', () => {
    renderWithRouter(
      <EntityLinkButton linkPath="/entity">Entity</EntityLinkButton>,
    );

    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });

    expect(mockNavigate).toHaveBeenCalledWith('/entity');
  });

  it('does not navigate on other key presses', () => {
    renderWithRouter(
      <EntityLinkButton linkPath="/entity">Entity</EntityLinkButton>,
    );

    fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab' });
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Escape' });
    fireEvent.keyDown(screen.getByRole('button'), { key: 'a' });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('applies className prop', () => {
    renderWithRouter(
      <EntityLinkButton linkPath="/test" className="custom-class">
        Test
      </EntityLinkButton>,
    );

    expect(screen.getByRole('button')).toHaveClass('custom-class');
  });

  it('has type="button" attribute', () => {
    renderWithRouter(
      <EntityLinkButton linkPath="/test">Test</EntityLinkButton>,
    );

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('prevents default on click and navigates', () => {
    renderWithRouter(
      <EntityLinkButton linkPath="/prevent-test">Test</EntityLinkButton>,
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(mockNavigate).toHaveBeenCalledWith('/prevent-test');
  });

  it('renders complex children', () => {
    renderWithRouter(
      <EntityLinkButton linkPath="/test">
        <span data-testid="child-span">Complex</span>
        <strong>Content</strong>
      </EntityLinkButton>,
    );

    expect(screen.getByTestId('child-span')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });
});
