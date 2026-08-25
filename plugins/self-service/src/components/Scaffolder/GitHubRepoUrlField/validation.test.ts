import { githubRepoUrlValidation } from './validation';

function makeValidation() {
  const addError = jest.fn();
  return { addError, validation: { addError } as any };
}

describe('githubRepoUrlValidation', () => {
  it('accepts a RepoUrlPicker-compatible value', () => {
    const { addError, validation } = makeValidation();

    githubRepoUrlValidation('github.com?owner=acme&repo=playbooks', validation);

    expect(addError).not.toHaveBeenCalled();
  });

  it('accepts a github.com https URL', () => {
    const { addError, validation } = makeValidation();

    githubRepoUrlValidation('https://github.com/acme/playbooks', validation);

    expect(addError).not.toHaveBeenCalled();
  });

  it('adds a parse error for a non-github host', () => {
    const { addError, validation } = makeValidation();

    githubRepoUrlValidation('https://gitlab.com/o/r', validation);

    expect(addError).toHaveBeenCalledWith(
      'Only github.com repositories are supported right now.',
    );
  });

  it('adds an error for an empty value', () => {
    const { addError, validation } = makeValidation();

    githubRepoUrlValidation('', validation);

    expect(addError).toHaveBeenCalled();
  });

  it('adds an error for a picker string without owner and repo', () => {
    const { addError, validation } = makeValidation();

    githubRepoUrlValidation('github.com?foo=bar', validation);

    expect(addError).toHaveBeenCalled();
  });

  it('treats undefined as empty', () => {
    const { addError, validation } = makeValidation();

    githubRepoUrlValidation(undefined as unknown as string, validation);

    expect(addError).toHaveBeenCalled();
  });
});
