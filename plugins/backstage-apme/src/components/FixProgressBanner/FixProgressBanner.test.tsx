/*
 * Copyright Red Hat
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { FixProgressBanner } from './FixProgressBanner';

const theme = createTheme();

describe('FixProgressBanner', () => {
  it('renders progress message and percentage', () => {
    render(
      <ThemeProvider theme={theme}>
        <FixProgressBanner message="Generating fixes…" progress={42} />
      </ThemeProvider>,
    );

    expect(screen.getByText('Generating fixes…')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('hides when not visible', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FixProgressBanner message="Generating fixes…" visible={false} />
      </ThemeProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('hides when message is empty', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FixProgressBanner message="" />
      </ThemeProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
