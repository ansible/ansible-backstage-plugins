import * as scaffolderReact from './index';

describe('public exports', () => {
  it.each([
    'FileUploadPickerExtension',
    'FieldValidationProvider',
    'useFieldValidation',
    'EEFileNamePickerExtension',
    'EETagsPickerExtension',
    'ScmSelectorExtension',
    'AdditionalBuildStepsPickerExtension',
    'PackagesPickerExtension',
    'MCPServersPickerExtension',
    'parseMarkdownLinks',
  ])('exports %s for consuming hosts', name => {
    expect(scaffolderReact).toHaveProperty(name, expect.any(Function));
  });
});
