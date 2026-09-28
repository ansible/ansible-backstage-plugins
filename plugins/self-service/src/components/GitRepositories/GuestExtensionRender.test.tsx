import { render, screen } from '@testing-library/react';
import { GuestExtensionRender } from './GuestExtensionRender';

describe('GuestExtensionRender', () => {
  it('renders the guest callback output', () => {
    render(
      <GuestExtensionRender
        render={() => <div data-testid="guest-ok">guest ok</div>}
      />,
    );

    expect(screen.getByTestId('guest-ok')).toBeInTheDocument();
  });

  it('catches a synchronous throw from the guest callback', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <div>
        <div data-testid="host">host</div>
        <GuestExtensionRender
          render={() => {
            throw new Error('guest boom');
          }}
        />
      </div>,
    );

    expect(screen.getByTestId('host')).toBeInTheDocument();
    expect(
      screen.getByText('This extension failed to load.'),
    ).toBeInTheDocument();

    errorSpy.mockRestore();
  });
});
