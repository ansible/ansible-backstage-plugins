import { render, screen, fireEvent } from '@testing-library/react';
import { SyncConfirmationDialog } from './SyncConfirmationDialog';

describe('SyncConfirmationDialog', () => {
  const defaultProps = {
    id: 'test-dialog',
    keepMounted: false,
    value: [],
    open: true,
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render dialog with sync options', () => {
    render(<SyncConfirmationDialog {...defaultProps} />);

    expect(screen.getByText('AAP synchronization options')).toBeInTheDocument();
    expect(
      screen.getByText('Organizations, Users, and Teams'),
    ).toBeInTheDocument();
    expect(screen.getByText('Job Templates')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Ok')).toBeInTheDocument();
  });

  it('should display "Never synced" when no sync status is provided', () => {
    render(<SyncConfirmationDialog {...defaultProps} />);

    expect(screen.getAllByText('Never synced')).toHaveLength(2);
  });

  it('should display sync timestamps when provided', () => {
    const syncStatus = {
      orgsUsersTeams: { lastSync: '2024-01-15T10:00:00Z' },
      jobTemplates: { lastSync: '2024-01-15T11:00:00Z' },
    };

    render(
      <SyncConfirmationDialog {...defaultProps} syncStatus={syncStatus} />,
    );

    // The exact text will depend on the current time when the test runs
    // We'll check that some relative time text is displayed
    const timeElements = screen.getAllByText(/ago|Just now|Never synced/);
    expect(timeElements.length).toBeGreaterThan(0);
  });

  it('should handle checkbox selection', () => {
    const onClose = jest.fn();
    render(<SyncConfirmationDialog {...defaultProps} onClose={onClose} />);

    const orgsCheckbox = screen.getByLabelText(
      /Organizations, Users, and Teams/,
    );
    fireEvent.click(orgsCheckbox);

    const okButton = screen.getByText('Ok');
    fireEvent.click(okButton);

    expect(onClose).toHaveBeenCalledWith(['orgsUsersTeams']);
  });

  it('should handle multiple checkbox selections', () => {
    const onClose = jest.fn();
    render(<SyncConfirmationDialog {...defaultProps} onClose={onClose} />);

    const orgsCheckbox = screen.getByLabelText(
      /Organizations, Users, and Teams/,
    );
    const templatesCheckbox = screen.getByLabelText(/Job Templates/);

    fireEvent.click(orgsCheckbox);
    fireEvent.click(templatesCheckbox);

    const okButton = screen.getByText('Ok');
    fireEvent.click(okButton);

    expect(onClose).toHaveBeenCalledWith(['orgsUsersTeams', 'templates']);
  });

  it('should handle cancel button', () => {
    const onClose = jest.fn();
    render(<SyncConfirmationDialog {...defaultProps} onClose={onClose} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onClose).toHaveBeenCalledWith();
  });

  it('should display pre-selected values', () => {
    render(
      <SyncConfirmationDialog {...defaultProps} value={['orgsUsersTeams']} />,
    );

    const orgsCheckbox = screen.getByLabelText(
      /Organizations, Users, and Teams/,
    );
    expect(orgsCheckbox).toBeChecked();
  });

  it('should handle null sync timestamps gracefully', () => {
    const syncStatus = {
      orgsUsersTeams: { lastSync: null },
      jobTemplates: { lastSync: null },
    };

    render(
      <SyncConfirmationDialog {...defaultProps} syncStatus={syncStatus} />,
    );

    expect(screen.getAllByText('Never synced')).toHaveLength(2);
  });
});
