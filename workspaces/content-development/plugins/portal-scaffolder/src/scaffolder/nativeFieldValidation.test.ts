import { validateEEFileName, validateEETags } from './nativeFieldValidation';

describe('native picker validation', () => {
  it('allows empty optional names but rejects whitespace-only filenames', () => {
    expect(validateEEFileName(undefined)).toEqual([]);
    expect(validateEEFileName('')).toEqual([]);
    expect(validateEEFileName('   ')).toEqual(['Name is required']);
    expect(validateEEFileName('valid-ee')).toEqual([]);
    expect(validateEEFileName('invalid/name')).not.toEqual([]);
  });

  it('validates non-empty tags while allowing empty optional values', () => {
    expect(validateEETags(undefined)).toEqual([]);
    expect(validateEETags([])).toEqual([]);
    expect(validateEETags([''])).toEqual([]);
    expect(validateEETags(['   '])).toEqual(['Tag 1: Tag is required']);
    expect(validateEETags(['execution-environment', 'valid+tag'])).toEqual([]);
    expect(validateEETags(['Invalid Tag'])).toHaveLength(1);
  });
});
