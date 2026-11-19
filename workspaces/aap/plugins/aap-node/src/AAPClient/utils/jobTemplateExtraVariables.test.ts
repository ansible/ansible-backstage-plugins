import { normalizeJobTemplateExtraVariables } from './jobTemplateExtraVariables';

describe('normalizeJobTemplateExtraVariables', () => {
  it('preserves large integers parsed from YAML text', () => {
    expect(
      normalizeJobTemplateExtraVariables('account_id: 9007199254740993'),
    ).toEqual({ account_id: 9007199254740993n });
  });

  it('uses YAML 1.1 semantics for quoted boolean-like strings', () => {
    expect(normalizeJobTemplateExtraVariables('flag: "no"')).toEqual({
      flag: 'no',
    });
  });

  it('rejects unsafe integer values already represented as JavaScript numbers', () => {
    expect(() =>
      normalizeJobTemplateExtraVariables({ account_id: 9007199254740993 }),
    ).toThrow(RangeError);
  });

  it.each(['', 'null', '[]', 'value'])('rejects non-mappings: %s', input => {
    expect(() => normalizeJobTemplateExtraVariables(input)).toThrow(
      'Job template extraVariables must be a mapping.',
    );
  });
});
