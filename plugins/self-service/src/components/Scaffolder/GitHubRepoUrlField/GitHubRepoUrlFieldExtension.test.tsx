import { screen, fireEvent } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';
import { GitHubRepoUrlFieldExtension } from './GitHubRepoUrlFieldExtension';

describe('GitHubRepoUrlFieldExtension', () => {
  const mockOnChange = jest.fn();

  const defaultProps = {
    onChange: mockOnChange,
    required: false,
    disabled: false,
    rawErrors: [],
    schema: { title: 'GitHub repository URL' },
    uiSchema: {},
    formData: '',
    idSchema: { $id: 'github-repo-url' },
  } as any;

  const renderField = (props = {}) =>
    renderInTestApp(
      <GitHubRepoUrlFieldExtension {...defaultProps} {...props} />,
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the default helper text when empty', async () => {
    await renderField();

    expect(
      screen.getByText(
        /Paste a github.com URL \(https:\/\/github.com\/owner\/repo\)/,
      ),
    ).toBeInTheDocument();
  });

  it('uses a custom helperText from uiSchema', async () => {
    await renderField({
      uiSchema: { 'ui:options': { helperText: 'Custom helper' } },
    });

    expect(screen.getByText('Custom helper')).toBeInTheDocument();
  });

  it('uses the default title when schema title is omitted', async () => {
    await renderField({ schema: {} });

    expect(screen.getByLabelText('GitHub repository URL')).toBeInTheDocument();
  });

  it('displays a picker-format formData value as an https URL', async () => {
    await renderField({
      formData: 'github.com?owner=acme&repo=playbooks',
    });

    expect(
      screen.getByDisplayValue('https://github.com/acme/playbooks'),
    ).toBeInTheDocument();
    expect(screen.getByText('acme/playbooks')).toBeInTheDocument();
  });

  it('keeps an in-progress https draft from formData', async () => {
    await renderField({
      formData: 'https://github.com/acme/in-progress',
    });

    expect(
      screen.getByDisplayValue('https://github.com/acme/in-progress'),
    ).toBeInTheDocument();
  });

  it('keeps a git@ draft from formData', async () => {
    await renderField({ formData: 'git@github.com:acme/playbooks.git' });

    expect(
      screen.getByDisplayValue('git@github.com:acme/playbooks.git'),
    ).toBeInTheDocument();
  });

  it('keeps a github.com/ draft from formData', async () => {
    await renderField({ formData: 'github.com/acme/playbooks' });

    expect(
      screen.getByDisplayValue('github.com/acme/playbooks'),
    ).toBeInTheDocument();
  });

  it('falls back to the raw formData when picker params are incomplete', async () => {
    await renderField({ formData: 'github.com?foo=bar' });

    expect(screen.getByDisplayValue('github.com?foo=bar')).toBeInTheDocument();
  });

  it('commits a picker value when a valid URL is typed', async () => {
    await renderField();

    fireEvent.change(screen.getByLabelText('GitHub repository URL'), {
      target: { value: 'https://github.com/acme/playbooks' },
    });

    expect(mockOnChange).toHaveBeenCalledWith(
      'github.com?owner=acme&repo=playbooks',
    );
    expect(screen.getByText(/Will register/)).toBeInTheDocument();
    expect(
      screen.getByText(/Organization: acme · Repository: playbooks/),
    ).toBeInTheDocument();
  });

  it('shows a branch hint for tree URLs', async () => {
    await renderField();

    fireEvent.change(screen.getByLabelText('GitHub repository URL'), {
      target: { value: 'https://github.com/acme/playbooks/tree/devel' },
    });

    expect(screen.getByText(/branch from URL: devel/)).toBeInTheDocument();
  });

  it('clears the committed value and shows a parse error for invalid input', async () => {
    await renderField();

    fireEvent.change(screen.getByLabelText('GitHub repository URL'), {
      target: { value: 'https://gitlab.com/o/r' },
    });

    expect(mockOnChange).toHaveBeenCalledWith('');
    expect(
      screen.getByText('Only github.com repositories are supported right now.'),
    ).toBeInTheDocument();
  });

  it('clears the committed value when the field is emptied', async () => {
    await renderField();

    fireEvent.change(screen.getByLabelText('GitHub repository URL'), {
      target: { value: 'https://github.com/acme/playbooks' },
    });
    mockOnChange.mockClear();

    fireEvent.change(screen.getByLabelText('GitHub repository URL'), {
      target: { value: '   ' },
    });

    expect(mockOnChange).toHaveBeenCalledWith('');
  });

  it('canonicalizes the draft to https on blur when the URL is valid', async () => {
    await renderField();

    const input = screen.getByLabelText('GitHub repository URL');
    fireEvent.change(input, {
      target: { value: 'git@github.com:acme/playbooks.git' },
    });
    fireEvent.blur(input);

    expect(input).toHaveValue('https://github.com/acme/playbooks');
    expect(mockOnChange).toHaveBeenCalledWith(
      'github.com?owner=acme&repo=playbooks',
    );
  });

  it('does not canonicalize on blur when the URL is invalid', async () => {
    await renderField();

    const input = screen.getByLabelText('GitHub repository URL');
    fireEvent.change(input, { target: { value: 'not-a-repo' } });
    fireEvent.blur(input);

    expect(input).toHaveValue('not-a-repo');
  });

  it('shows rawErrors instead of parse helper text', async () => {
    await renderField({
      formData: 'https://github.com/acme/playbooks',
      rawErrors: ['Template error'],
    });

    expect(screen.getByText('Template error')).toBeInTheDocument();
  });

  it('marks the field required and disabled when those props are set', async () => {
    await renderField({ required: true, disabled: true });

    const input = screen.getByLabelText('GitHub repository URL');
    expect(input).toBeRequired();
    expect(input).toBeDisabled();
  });
});
