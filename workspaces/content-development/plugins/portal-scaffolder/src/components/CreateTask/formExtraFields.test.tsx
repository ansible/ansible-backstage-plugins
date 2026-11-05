import { formExtraFields } from './formExtraFields';

describe('formExtraFields', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(formExtraFields)).toBe(true);
    expect(formExtraFields.length).toBeGreaterThan(0);
  });

  it('every entry has a name and component', () => {
    for (const field of formExtraFields) {
      expect(typeof field.name).toBe('string');
      expect(field.name.length).toBeGreaterThan(0);
      expect(field.component).toBeDefined();
    }
  });

  it('has no duplicate names', () => {
    const names = formExtraFields.map(f => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  const expectedFields = [
    'AAPResourcePicker',
    'AAPTokenField',
    'BaseImagePicker',
    'CollectionsPicker',
    'FileUploadPicker',
    'PackagesPicker',
    'MCPServersPicker',
    'ScmSelector',
    'AdditionalBuildStepsPicker',
    'EEFileNamePicker',
    'EETagsPicker',
    'EntityPicker',
    'EntityNamePicker',
    'EntityTagsPicker',
    'RepoUrlPicker',
    'OwnerPicker',
    'OwnedEntityPicker',
    'MyGroupsPicker',
    'Secret',
    'MultiEntityPicker',
    'RepoBranchPicker',
  ];

  it.each(expectedFields)('includes %s field', fieldName => {
    const field = formExtraFields.find(f => f.name === fieldName);
    expect(field).toBeDefined();
    expect(field!.component).toBeDefined();
  });

  it.each(['EntityNamePicker', 'RepoUrlPicker', 'MultiEntityPicker'])(
    '%s has a component',
    fieldName => {
      const field = formExtraFields.find(f => f.name === fieldName);
      expect(field!.component).toBeDefined();
    },
  );

  it('EntityPicker has a component', () => {
    const field = formExtraFields.find(f => f.name === 'EntityPicker');
    expect(field!.component).toBeDefined();
  });
});
