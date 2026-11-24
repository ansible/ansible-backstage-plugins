import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { PageHeader } from '../../..';

describe('PageHeader', () => {
  it('renders a title without sync configuration or Backstage API providers', () => {
    render(<PageHeader title="Conversions" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Conversions' }),
    ).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText(/sync/i)).not.toBeInTheDocument();
  });

  it('renders consumer-owned descriptions and actions', () => {
    const onConvert = jest.fn();
    render(
      <PageHeader
        title="Conversions"
        description={
          <>
            Convert sources to Ansible. <a href="/guide">Read the guide</a>
          </>
        }
        actions={<button onClick={onConvert}>Start conversion</button>}
      />,
    );

    expect(screen.getByText(/Convert sources to Ansible/)).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Read the guide' }),
    ).toHaveAttribute('href', '/guide');
    expect(onConvert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Start conversion' }));
    expect(onConvert).toHaveBeenCalledTimes(1);
  });

  it('makes optional help available to keyboard users', async () => {
    render(
      <PageHeader title="Conversions" tooltip="About source conversion" />,
    );

    const help = screen.getByRole('button', {
      name: 'About source conversion',
    });
    fireEvent.keyDown(document, { key: 'Tab' });
    act(() => help.focus());
    expect(help).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'About source conversion',
    );
  });
});
