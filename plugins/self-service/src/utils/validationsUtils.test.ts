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

    it('returns invalid for name ending with hyphen', () => {
      const result = isValidEntityName('invalid-');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot end');
    });

    it('returns invalid for name starting with underscore', () => {
      const result = isValidEntityName('_invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot start');
    });

    it('returns invalid for name starting with dot', () => {
      const result = isValidEntityName('.invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot start');
    });

    it('returns invalid for name ending with underscore', () => {
      const result = isValidEntityName('invalid_');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot end');
    });

    it('returns invalid for name ending with dot', () => {
      const result = isValidEntityName('invalid.');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot end');
    });

    it('returns invalid for name with consecutive hyphens', () => {
      const result = isValidEntityName('invalid--name');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot contain consecutive');
    });

    it('returns invalid for name with consecutive underscores', () => {
      const result = isValidEntityName('invalid__name');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot contain consecutive');
    });

    it('returns invalid for name with consecutive dots', () => {
      const result = isValidEntityName('invalid..name');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot contain consecutive');
    });

    it('returns invalid for name too long (over 63 characters)', () => {
      const longName = 'a'.repeat(64);
      const result = isValidEntityName(longName);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be at most 63 characters');
    });

    it('returns invalid for name with invalid characters', () => {
      const result = isValidEntityName('invalid@name');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must consist of alphanumeric characters');
    });

    it('returns invalid for name ending with .yaml (fails pattern check first)', () => {
      const result = isValidEntityName('my-name.yaml');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must consist of alphanumeric characters');
    });

    it('returns invalid for name ending with .yml (fails pattern check first)', () => {
      const result = isValidEntityName('my-name.yml');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must consist of alphanumeric characters');
    });

    it('returns invalid for name ending with .YAML (case insensitive, fails pattern check first)', () => {
      const result = isValidEntityName('my-name.YAML');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must consist of alphanumeric characters');
    });

    it('returns invalid for name ending with .YML (case insensitive, fails pattern check first)', () => {
      const result = isValidEntityName('my-name.YML');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must consist of alphanumeric characters');
    });

    it('uses Tag field name when isTag is true', () => {
      const result = isValidEntityName('', true);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Tag is required');
    });

    it('uses Name field name when isTag is false', () => {
      const result = isValidEntityName('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Name is required');
    });

    it('returns invalid for tag ending with .yaml when isTag is true (fails pattern check first)', () => {
      const result = isValidEntityName('my-tag.yaml', true);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(
        'Tag must consist of alphanumeric characters',
      );
    });

    it('returns invalid for tag ending with .yml when isTag is true (fails pattern check first)', () => {
      const result = isValidEntityName('my-tag.yml', true);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(
        'Tag must consist of alphanumeric characters',
      );
    });

    it('returns invalid for tag starting with hyphen when isTag is true', () => {
      const result = isValidEntityName('-tag', true);
      expect(result.valid).toBe(false);
      expect(result.error).toBe(
        'Tag cannot start with a hyphen, underscore, or dot',
      );
    });

    it('returns invalid for tag ending with hyphen when isTag is true', () => {
      const result = isValidEntityName('tag-', true);
      expect(result.valid).toBe(false);
      expect(result.error).toBe(
        'Tag cannot end with a hyphen, underscore, or dot',
      );
    });

    it('returns invalid for tag with consecutive hyphens when isTag is true', () => {
      const result = isValidEntityName('tag--name', true);
      expect(result.valid).toBe(false);
      expect(result.error).toBe(
        'Tag cannot contain consecutive hyphens, underscores, or dots',
      );
    });

    it('returns invalid for tag too long when isTag is true', () => {
      const longTag = 'a'.repeat(64);
      const result = isValidEntityName(longTag, true);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Tag must be at most 63 characters long');
    });

    it('returns invalid for tag with invalid characters when isTag is true', () => {
      const result = isValidEntityName('tag@name', true);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(
        'Tag must consist of alphanumeric characters',
      );
    });

    it('returns valid for correct tag when isTag is true', () => {
      const result = isValidEntityName('my-tag-name', true);
      expect(result.valid).toBe(true);
    });

    it('handles whitespace-only name', () => {
      const result = isValidEntityName('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Name is required');
    });

    it('handles whitespace-only tag', () => {
      const result = isValidEntityName('   ', true);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Tag is required');
    });

    it('trims whitespace before validation', () => {
      const result = isValidEntityName('  my-name  ');
      expect(result.valid).toBe(true);
    });

    it('returns invalid for name with only 1 character but valid format', () => {
      const result = isValidEntityName('a');
      expect(result.valid).toBe(true);
    });

    it('returns valid for name with exactly 63 characters', () => {
      const name = 'a'.repeat(63);
      const result = isValidEntityName(name);
      expect(result.valid).toBe(true);
    });

    it('returns valid for name with underscores', () => {
      const result = isValidEntityName('my_entity_name');
      expect(result.valid).toBe(true);
    });

    it('returns invalid for name with dots (dots not allowed in pattern)', () => {
      const result = isValidEntityName('my.entity.name');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must consist of alphanumeric characters');
    });

    it('returns invalid for tag with dots when isTag is true (dots not allowed in pattern)', () => {
      const result = isValidEntityName('my.tag.name', true);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(
        'Tag must consist of alphanumeric characters',
      );
    });
  });
});
