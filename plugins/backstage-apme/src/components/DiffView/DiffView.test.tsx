/*
 * Copyright Red Hat
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { DiffView } from './DiffView';

const theme = createTheme();

describe('DiffView', () => {
  it('renders unified diff hunks from the gateway', () => {
    render(
      <ThemeProvider theme={theme}>
        <DiffView
          title="Proposal"
          diff={`@@ -1,2 +1,2 @@
-old line
+new line
 context`}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText('Proposal')).toBeInTheDocument();
    expect(screen.getByText('old line')).toBeInTheDocument();
    expect(screen.getByText('new line')).toBeInTheDocument();
  });

  it('computes a diff from before and after yaml', () => {
    render(
      <ThemeProvider theme={theme}>
        <DiffView before="line one" after="line two" />
      </ThemeProvider>,
    );

    expect(screen.getByText('line one')).toBeInTheDocument();
    expect(screen.getByText('line two')).toBeInTheDocument();
  });

  it('renders nothing when no diff input is provided', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <DiffView />
      </ThemeProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
