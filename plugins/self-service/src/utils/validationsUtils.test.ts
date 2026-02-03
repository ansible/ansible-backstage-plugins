import { isValidEntityName } from './validationsUtils';

describe('validationsUtils', () => {
  describe('isValidEntityName', () => {
    it('returns valid for correct entity name', () => {
      const result = isValidEntityName('my-entity-name');
      expect(result.valid).toBe(true);
    });

    it('returns invalid for empty name', () => {
      const result = isValidEntityName('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Name is required');
    });

    it('returns invalid for name starting with hyphen', () => {
      const result = isValidEntityName('-invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot start');
    });
  });
});
