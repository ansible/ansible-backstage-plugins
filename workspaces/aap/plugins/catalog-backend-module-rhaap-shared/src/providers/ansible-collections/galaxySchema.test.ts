import {
  galaxySchema,
  validateGalaxyContent,
  hasRequiredFields,
} from './galaxySchema';

describe('galaxySchema', () => {
  describe('galaxySchema validation', () => {
    const validContent = {
      namespace: 'ansible',
      name: 'posix',
      version: '1.5.0',
      readme: 'README.md',
      authors: ['Ansible Core Team'],
    };

    it('should validate valid galaxy content', () => {
      const result = galaxySchema.safeParse(validContent);
      expect(result.success).toBe(true);
    });

    it('should require namespace to start with a letter', () => {
      const content = { ...validContent, namespace: '123invalid' };
      const result = galaxySchema.safeParse(content);
      expect(result.success).toBe(false);
    });

    it('should require name to start with a letter', () => {
      const content = { ...validContent, name: '_invalid' };
      const result = galaxySchema.safeParse(content);
      expect(result.success).toBe(false);
    });

    it('should allow underscores and dots in namespace', () => {
      const content = { ...validContent, namespace: 'my_namespace.v1' };
      const result = galaxySchema.safeParse(content);
      expect(result.success).toBe(true);
    });

    it('should transform null version to N/A', () => {
      const content = { ...validContent, version: null };
      const result = galaxySchema.safeParse(content);
      expect(result.success).toBe(true);
      expect(
        (result as { success: true; data: { version: string } }).data.version,
      ).toBe('N/A');
    });

    it('should transform missing readme to default value', () => {
      const content = { ...validContent, readme: undefined };
      const result = galaxySchema.safeParse(content);
      expect(result.success).toBe(true);
      expect(
        (result as { success: true; data: { readme: string } }).data.readme,
      ).toBe('Not Available.');
    });

    it('should handle string authors', () => {
      const content = { ...validContent, authors: 'Single Author' };
      const result = galaxySchema.safeParse(content);
      expect(result.success).toBe(true);
      expect(
        (result as { success: true; data: { authors: string[] } }).data.authors,
      ).toEqual(['Single Author']);
    });

    it('should transform null authors to N/A array', () => {
      const content = { ...validContent, authors: null };
      const result = galaxySchema.safeParse(content);
      expect(result.success).toBe(true);
      expect(
        (result as { success: true; data: { authors: string[] } }).data.authors,
      ).toEqual(['N/A']);
    });

    it('should handle optional fields', () => {
      const content = {
        ...validContent,
        description: 'A test collection',
        license: 'MIT',
        tags: ['linux', 'posix'],
        dependencies: { 'ansible.builtin': '>=2.9' },
        repository: 'https://github.com/ansible/ansible.posix',
        documentation: 'https://docs.example.com',
        homepage: 'https://example.com',
        issues: 'https://github.com/ansible/ansible.posix/issues',
      };
      const result = galaxySchema.safeParse(content);
      expect(result.success).toBe(true);
      const data = (result as { success: true; data: Record<string, unknown> })
        .data;
      expect(data.description).toBe('A test collection');
      expect(data.license).toBe('MIT');
      expect(data.tags).toEqual(['linux', 'posix']);
    });

    it('should handle license as array', () => {
      const content = { ...validContent, license: ['MIT', 'Apache-2.0'] };
      const result = galaxySchema.safeParse(content);
      expect(result.success).toBe(true);
      expect(
        (result as { success: true; data: { license: string[] } }).data.license,
      ).toEqual(['MIT', 'Apache-2.0']);
    });

    it('should transform null optional fields to undefined', () => {
      const content = {
        ...validContent,
        description: null,
        tags: null,
        dependencies: null,
      };
      const result = galaxySchema.safeParse(content);
      expect(result.success).toBe(true);
      const data = (result as { success: true; data: Record<string, unknown> })
        .data;
      expect(data.description).toBeUndefined();
      expect(data.tags).toBeUndefined();
      expect(data.dependencies).toBeUndefined();
    });
  });

  describe('validateGalaxyContent', () => {
    const validContent = {
      namespace: 'ansible',
      name: 'posix',
      version: '1.5.0',
      readme: 'README.md',
      authors: ['Ansible Core Team'],
    };

    it('should return success for valid content', () => {
      const result = validateGalaxyContent(validContent);
      expect(result.success).toBe(true);
      const successResult = result as { success: true; data: unknown };
      expect(successResult.data).toBeDefined();
    });

    it('should return error for null content', () => {
      const result = validateGalaxyContent(null);
      expect(result.success).toBe(false);
      const errorResult = result as { success: false; errors: string[] };
      expect(errorResult.errors).toContain(
        'galaxy.yml content is empty or not a valid object',
      );
    });

    it('should return error for undefined content', () => {
      const result = validateGalaxyContent(undefined);
      expect(result.success).toBe(false);
      const errorResult = result as { success: false; errors: string[] };
      expect(errorResult.errors).toContain(
        'galaxy.yml content is empty or not a valid object',
      );
    });

    it('should return error for non-object content', () => {
      const result = validateGalaxyContent('string content');
      expect(result.success).toBe(false);
      const errorResult = result as { success: false; errors: string[] };
      expect(errorResult.errors).toContain(
        'galaxy.yml content is empty or not a valid object',
      );
    });

    it('should return error for empty object', () => {
      const result = validateGalaxyContent({});
      expect(result.success).toBe(false);
      const errorResult = result as { success: false; errors: string[] };
      expect(errorResult.errors).toContain('galaxy.yml content is empty');
    });

    it('should return validation errors with paths', () => {
      const content = { namespace: '', name: 'posix', version: '1.0.0' };
      const result = validateGalaxyContent(content);
      expect(result.success).toBe(false);
      const errorResult = result as { success: false; errors: string[] };
      expect(errorResult.errors).toBeDefined();
      expect(errorResult.errors.some(e => e.includes('namespace'))).toBe(true);
    });

    it('should return multiple errors for multiple invalid fields', () => {
      const content = { namespace: '123', name: '456' };
      const result = validateGalaxyContent(content);
      expect(result.success).toBe(false);
      const errorResult = result as { success: false; errors: string[] };
      expect(errorResult.errors.length).toBeGreaterThan(1);
    });
  });

  describe('hasRequiredFields', () => {
    it('should return true for content with all required fields', () => {
      const content = {
        namespace: 'ansible',
        name: 'posix',
        version: '1.0.0',
        authors: ['Author'],
        readme: 'README.md',
      };
      expect(hasRequiredFields(content)).toBe(true);
    });

    it('should return false for null content', () => {
      expect(hasRequiredFields(null)).toBe(false);
    });

    it('should return false for undefined content', () => {
      expect(hasRequiredFields(undefined)).toBe(false);
    });

    it('should return false for non-object content', () => {
      expect(hasRequiredFields('string')).toBe(false);
      expect(hasRequiredFields(123)).toBe(false);
      expect(hasRequiredFields([])).toBe(false);
    });

    it('should return false for empty namespace', () => {
      const content = {
        namespace: '',
        name: 'posix',
        version: '1.0.0',
        authors: ['Author'],
        readme: 'README.md',
      };
      expect(hasRequiredFields(content)).toBe(false);
    });

    it('should return false for empty name', () => {
      const content = {
        namespace: 'ansible',
        name: '',
        version: '1.0.0',
        authors: ['Author'],
        readme: 'README.md',
      };
      expect(hasRequiredFields(content)).toBe(false);
    });

    it('should return false for missing version', () => {
      const content = {
        namespace: 'ansible',
        name: 'posix',
        authors: ['Author'],
        readme: 'README.md',
      };
      expect(hasRequiredFields(content)).toBe(false);
    });

    it('should return false for missing authors', () => {
      const content = {
        namespace: 'ansible',
        name: 'posix',
        version: '1.0.0',
        readme: 'README.md',
      };
      expect(hasRequiredFields(content)).toBe(false);
    });

    it('should return false for missing readme', () => {
      const content = {
        namespace: 'ansible',
        name: 'posix',
        version: '1.0.0',
        authors: ['Author'],
      };
      expect(hasRequiredFields(content)).toBe(false);
    });

    it('should return true when version is null (version key exists)', () => {
      const content = {
        namespace: 'ansible',
        name: 'posix',
        version: null,
        authors: ['Author'],
        readme: 'README.md',
      };
      expect(hasRequiredFields(content)).toBe(true);
    });
  });
});
