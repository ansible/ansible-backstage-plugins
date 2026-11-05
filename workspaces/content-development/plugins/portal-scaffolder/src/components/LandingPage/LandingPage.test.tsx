import { render, screen } from '@testing-library/react';
import { LandingPage } from './LandingPage';
import { Navigate } from 'react-router-dom';

// Mock Navigate so we can inspect it
jest.mock('react-router-dom', () => ({
  Navigate: jest.fn(({ to }: any) => (
    <div data-testid="navigate">Redirect to {to}</div>
  )),
}));

describe('LandingPage', () => {
  it('renders Navigate with correct path', () => {
    render(<LandingPage />);

    const navigateElement = screen.getByTestId('navigate');
    expect(navigateElement).toBeInTheDocument();
    expect(navigateElement).toHaveTextContent('Redirect to /self-service');

    // Optional: check that Navigate was called with correct prop
    expect(Navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: '/self-service' }),
      expect.anything(),
    );
  });
});
