/*
 * Copyright Red Hat
 */

import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { BranchFileChangesPanel } from './BranchFileChangesPanel';

const theme = createTheme();

const files = [
  {
    file: 'action.yml',
    before: 'default: "."\n',
    after: 'default: .\n',
  },
];

describe('BranchFileChangesPanel', () => {
  it('hides file list when panel is collapsed by default', () => {
    render(
      <ThemeProvider theme={theme}>
        <BranchFileChangesPanel branchName="apme/remediate-abf50874" files={files} />
      </ThemeProvider>,
    );

    expect(
      screen.getByText('Changes on branch · apme/remediate-abf50874'),
    ).toBeInTheDocument();
    expect(screen.queryByText('action.yml')).not.toBeInTheDocument();
    expect(screen.queryByText('Before')).not.toBeInTheDocument();
  });

  it('expands panel on header click, then shows file name without diff until file clicked', () => {
    render(
      <ThemeProvider theme={theme}>
        <BranchFileChangesPanel branchName="apme/remediate-abf50874" files={files} />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByTestId('branch-changes-panel-header'));

    expect(screen.getByText('action.yml')).toBeInTheDocument();
    expect(screen.queryByText('Before')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('branch-changes-file-action.yml'));

    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText('After (proposed)')).toBeInTheDocument();
  });

  it('does not duplicate filename as DiffView title when expanded', () => {
    render(
      <ThemeProvider theme={theme}>
        <BranchFileChangesPanel files={files} defaultExpanded />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByTestId('branch-changes-file-action.yml'));

    // Filename appears once in the file row header, not as DiffView title bar
    expect(screen.getAllByText('action.yml')).toHaveLength(1);
  });
});
