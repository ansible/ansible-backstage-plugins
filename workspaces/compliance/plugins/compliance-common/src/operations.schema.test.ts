import Ajv from 'ajv';
import { complianceProfileSaveOperation } from './operations';

describe('compliance.profile.save input schema', () => {
  const validate = new Ajv({ strict: true, allErrors: true }).compile(
    complianceProfileSaveOperation.inputSchema,
  );

  it('accepts the Settings form when templates are unset', () => {
    expect(
      validate({
        profileSlug: '',
        displayName: 'RHEL 9 STIG',
        description: '',
        framework: 'DISA_STIG',
        version: '',
        platform: '',
        platformSpec: null,
        workflowTemplateId: null,
        remediateJtId: null,
        eeId: null,
        remediationPlaybookPath: '',
        scanTags: '',
        certification: {
          status: 'uncertified',
          authority: '',
          validationId: '',
          disclaimer: '',
        },
      }),
    ).toBe(true);
  });

  it('accepts numeric template and execution environment ids', () => {
    expect(
      validate({
        displayName: 'RHEL 9 STIG',
        framework: 'DISA_STIG',
        workflowTemplateId: 10,
        remediateJtId: 11,
        eeId: 2,
      }),
    ).toBe(true);
  });
});
