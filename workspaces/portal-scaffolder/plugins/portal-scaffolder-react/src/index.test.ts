import * as scaffolderReact from './index';

describe('public exports', () => {
  it.each([
    'FileUploadPickerExtension',
    'FieldValidationProvider',
    'useFieldValidation',
    'EEFileNamePickerExtension',
    'EETagsPickerExtension',
  ])('exports %s for consuming hosts', name => {
    expect(scaffolderReact).toHaveProperty(name, expect.any(Function));
  });
});
