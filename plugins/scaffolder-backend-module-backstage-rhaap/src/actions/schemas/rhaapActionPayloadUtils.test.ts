/*
 * Copyright 2024 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import {
  formatLaunchTagsString,
  launchJobTemplateInputSchema,
  normalizeCleanUpValues,
  normalizeExecutionEnvironmentInputValues,
  normalizeJobTemplateInputValues,
  normalizeProjectInputValues,
  normalizeTemplateLaunchValues,
  pickCredentialForProject,
  pickLaunchExecutionEnvironment,
  pickOrganization,
  pickProjectInputRecord,
} from './rhaapActionPayloadUtils';
import { projectInputSchema } from './rhaapActionSchemas';

describe('pickOrganization', () => {
  it('returns undefined and null unchanged', () => {
    expect(pickOrganization(undefined)).toBeUndefined();
    expect(pickOrganization(null)).toBeNull();
  });

  it('returns non-objects unchanged (primitives, arrays)', () => {
    expect(pickOrganization(42)).toBe(42);
    expect(pickOrganization('org')).toBe('org');
    expect(pickOrganization(['a'])).toEqual(['a']);
  });

  it('returns objects without numeric id unchanged', () => {
    expect(pickOrganization({ name: 'x' })).toEqual({ name: 'x' });
  });

  it('strips Tower API fields and keeps id, name, optional namespace', () => {
    expect(
      pickOrganization({
        id: 1,
        name: 'Default',
        type: 'organization',
        url: '/api/v2/organizations/1/',
        summary_fields: {},
      }),
    ).toEqual({ id: 1, name: 'Default' });

    expect(
      pickOrganization({
        id: 2,
        name: 'NsOrg',
        namespace: 'my-ns',
      }),
    ).toEqual({ id: 2, name: 'NsOrg', namespace: 'my-ns' });
  });

  it('uses empty string when name is not a string', () => {
    expect(pickOrganization({ id: 1, name: 99 })).toEqual({
      id: 1,
      name: '',
    });
  });

  it('omits namespace when not a string', () => {
    expect(
      pickOrganization({
        id: 1,
        name: 'O',
        namespace: 99 as unknown as string,
      }),
    ).toEqual({ id: 1, name: 'O' });
  });
});

describe('pickCredentialForProject', () => {
  it('returns undefined and null unchanged', () => {
    expect(pickCredentialForProject(undefined)).toBeUndefined();
    expect(pickCredentialForProject(null)).toBeNull();
  });

  it('returns non-plain objects unchanged', () => {
    expect(pickCredentialForProject('cred')).toBe('cred');
  });

  it('returns plain objects without numeric id unchanged', () => {
    expect(pickCredentialForProject({ name: 'x' })).toEqual({ name: 'x' });
  });

  it('strips to id, name, kind defaulting to scm without inputs', () => {
    expect(
      pickCredentialForProject({
        id: 3,
        name: 'GitHub',
        kind: 'scm',
        summary_fields: { credential_type: { name: 'Source Control' } },
      }),
    ).toEqual({ id: 3, name: 'GitHub', kind: 'scm' });
  });

  it('includes inputs when inputs.username is a string', () => {
    expect(
      pickCredentialForProject({
        id: 3,
        name: 'C',
        kind: 'ssh',
        inputs: { username: 'u' },
      }),
    ).toEqual({
      id: 3,
      name: 'C',
      kind: 'ssh',
      inputs: { username: 'u' },
    });
  });

  it('ignores non-plain inputs object', () => {
    expect(
      pickCredentialForProject({
        id: 1,
        name: 'N',
        inputs: 'not-an-object',
      }),
    ).toEqual({ id: 1, name: 'N', kind: 'scm' });
  });

  it('does not add inputs when username is not a string', () => {
    expect(
      pickCredentialForProject({
        id: 1,
        name: 'N',
        inputs: { username: 1 },
      }),
    ).toEqual({ id: 1, name: 'N', kind: 'scm' });
  });
});

describe('pickProjectInputRecord / normalizeProjectInputValues', () => {
  it('returns null, undefined, non-objects, and arrays unchanged', () => {
    expect(pickProjectInputRecord(null)).toBeNull();
    expect(pickProjectInputRecord(undefined)).toBeUndefined();
    expect(pickProjectInputRecord('x')).toBe('x');
    expect(pickProjectInputRecord([1])).toEqual([1]);
  });

  it('maps related with last_job string', () => {
    const out = pickProjectInputRecord({
      projectName: 'p',
      scmUrl: 'https://g.com/x',
      organization: { id: 1, name: 'O' },
      related: { last_job: '/api/job/1/', noise: 1 },
    }) as Record<string, unknown>;
    expect(out.related).toEqual({ last_job: '/api/job/1/' });
  });

  it('skips related when last_job is not a string', () => {
    const out = pickProjectInputRecord({
      projectName: 'p',
      scmUrl: 'https://g.com/x',
      organization: { id: 1, name: 'O' },
      related: { foo: 'bar' },
    }) as Record<string, unknown>;
    expect(out.related).toBeUndefined();
  });

  it('normalizeProjectInputValues strips organization and credentials for create-project', () => {
    const raw = {
      projectName: 'p',
      scmUrl: 'https://github.com/x/y',
      organization: {
        id: 1,
        name: 'Default',
        type: 'organization',
        url: '/api/',
        related: {},
        summary_fields: {},
      },
      credentials: {
        id: 3,
        name: 'GitHub',
        kind: 'scm',
        summary_fields: { credential_type: { name: 'Source Control' } },
      },
    };
    const normalized = normalizeProjectInputValues(raw);
    const parsed = projectInputSchema.safeParse(normalized);
    expect(parsed).toMatchObject({
      success: true,
      data: {
        organization: { id: 1, name: 'Default' },
        credentials: expect.objectContaining({
          id: 3,
          name: 'GitHub',
          kind: 'scm',
        }),
      },
    });
  });
});

describe('normalizeExecutionEnvironmentInputValues', () => {
  it('returns non-plain inputs unchanged', () => {
    expect(normalizeExecutionEnvironmentInputValues(null)).toBeNull();
    expect(normalizeExecutionEnvironmentInputValues('ee')).toBe('ee');
    expect(normalizeExecutionEnvironmentInputValues([1])).toEqual([1]);
  });

  it('delegates to pickLaunchExecutionEnvironment when id is present', () => {
    const out = normalizeExecutionEnvironmentInputValues({
      id: 10,
      name: 'FromName',
      description: 'Desc',
      image: 'quay.io/x:y',
      pull: 'always',
      summary_fields: {
        organization: { id: 2, name: 'OrgFromSummary' },
      },
    }) as Record<string, unknown>;
    expect(out.id).toBe(10);
    expect(out.environmentName).toBe('FromName');
    expect(out.environmentDescription).toBe('Desc');
    expect(out.organization).toEqual({ id: 2, name: 'OrgFromSummary' });
  });

  it('handles org-only create payload without id', () => {
    const normalized = normalizeExecutionEnvironmentInputValues({
      environmentName: 'ee1',
      organization: { id: 1, name: 'Default', url: '/x/' },
      image: 'quay.io/foo/bar:latest',
      pull: 'missing',
    });
    expect(normalized).toMatchObject({
      environmentName: 'ee1',
      organization: { id: 1, name: 'Default' },
      image: 'quay.io/foo/bar:latest',
      pull: 'missing',
    });
  });

  it('includes optional description and url when present', () => {
    const n = normalizeExecutionEnvironmentInputValues({
      environmentName: 'e',
      environmentDescription: 'd',
      organization: { id: 1, name: 'O' },
      image: 'i',
      pull: 'p',
      url: 'https://aap/ee/1',
    }) as Record<string, unknown>;
    expect(n.environmentDescription).toBe('d');
    expect(n.url).toBe('https://aap/ee/1');
  });

  it('omits description when absent and uses name fallback for environment name in EE pick path', () => {
    const n = normalizeExecutionEnvironmentInputValues({
      id: 1,
      name: 'EEByName',
      image: 'i',
      pull: 'p',
      organization: { id: 1, name: 'O' },
    }) as Record<string, unknown>;
    expect(n.environmentName).toBe('EEByName');
  });
});

describe('pickLaunchExecutionEnvironment', () => {
  it('returns undefined for undefined input', () => {
    expect(pickLaunchExecutionEnvironment(undefined)).toBeUndefined();
  });

  it('returns non-plain objects unchanged', () => {
    expect(pickLaunchExecutionEnvironment('x')).toBe('x');
  });

  it('returns plain objects without numeric id unchanged', () => {
    expect(pickLaunchExecutionEnvironment({ foo: 1 })).toEqual({ foo: 1 });
  });

  it('maps full AAP EE record with summary_fields organization', () => {
    const out = pickLaunchExecutionEnvironment({
      id: 5,
      environmentName: 'E1',
      image: 'img',
      pull: 'missing',
      summary_fields: { organization: { id: 9, name: 'Org9' } },
    }) as Record<string, unknown>;
    expect(out.organization).toEqual({ id: 9, name: 'Org9' });
  });

  it('falls back to pickOrganization when summary org is empty', () => {
    const out = pickLaunchExecutionEnvironment({
      id: 5,
      environmentName: 'E1',
      image: 'img',
      pull: 'missing',
      summary_fields: {},
      organization: { id: 3, name: 'Fallback', url: '/x/' },
    }) as Record<string, unknown>;
    expect(out.organization).toEqual({ id: 3, name: 'Fallback' });
  });

  it('includes url when string', () => {
    const out = pickLaunchExecutionEnvironment({
      id: 1,
      name: 'n',
      image: 'i',
      pull: 'p',
      url: 'https://ee',
    }) as Record<string, unknown>;
    expect(out.url).toBe('https://ee');
  });
});

describe('normalizeJobTemplateInputValues', () => {
  it('returns null, non-objects, and arrays unchanged', () => {
    expect(normalizeJobTemplateInputValues(null)).toBeNull();
    expect(normalizeJobTemplateInputValues('jt')).toBe('jt');
    expect(normalizeJobTemplateInputValues([1])).toEqual([1]);
  });

  it('strips nested project.organization and inventory', () => {
    const normalized = normalizeJobTemplateInputValues({
      templateName: 'jt',
      organization: { id: 1, name: 'Default', description: 'x' },
      jobInventory: { id: 2, name: 'Inv', url: '/i/' },
      playbook: 'site.yml',
      project: {
        id: 10,
        name: 'proj',
        projectName: 'proj',
        organization: { id: 1, name: 'Default', type: 'organization' },
        scmUrl: 'https://g.com/a/b',
      },
    });
    expect((normalized as Record<string, unknown>).organization).toEqual({
      id: 1,
      name: 'Default',
    });
    expect((normalized as Record<string, unknown>).jobInventory).toEqual({
      id: 2,
      name: 'Inv',
    });
    const proj = (normalized as Record<string, unknown>).project as Record<
      string,
      unknown
    >;
    expect(proj.organization).toEqual({ id: 1, name: 'Default' });
  });

  it('uses pickLaunchExecutionEnvironment when executionEnvironment has id', () => {
    const n = normalizeJobTemplateInputValues({
      templateName: 't',
      organization: { id: 1, name: 'O' },
      jobInventory: { id: 2, name: 'I' },
      playbook: 'p.yml',
      project: {
        projectName: 'pr',
        scmUrl: 'https://g.com/a',
        organization: { id: 1, name: 'O' },
      },
      executionEnvironment: {
        id: 99,
        name: 'EE',
        image: 'img',
        pull: 'always',
        organization: { id: 1, name: 'O' },
      },
    }) as Record<string, unknown>;
    expect((n.executionEnvironment as Record<string, unknown>).id).toBe(99);
  });

  it('uses normalizeExecutionEnvironmentInputValues when executionEnvironment has no id', () => {
    const n = normalizeJobTemplateInputValues({
      templateName: 't',
      organization: { id: 1, name: 'O' },
      jobInventory: { id: 2, name: 'I' },
      playbook: 'p.yml',
      project: {
        projectName: 'pr',
        scmUrl: 'https://g.com/a',
        organization: { id: 1, name: 'O' },
      },
      executionEnvironment: {
        environmentName: 'ee',
        organization: { id: 1, name: 'O' },
        image: 'img',
        pull: 'missing',
      },
    }) as Record<string, unknown>;
    expect(
      (n.executionEnvironment as Record<string, unknown>).environmentName,
    ).toBe('ee');
  });

  it('normalizes credentials via pickCredentialForProject', () => {
    const n = normalizeJobTemplateInputValues({
      templateName: 't',
      organization: { id: 1, name: 'O' },
      jobInventory: { id: 2, name: 'I' },
      playbook: 'p.yml',
      project: {
        projectName: 'pr',
        scmUrl: 'https://g.com/a',
        organization: { id: 1, name: 'O' },
      },
      credentials: {
        id: 7,
        name: 'Cred',
        kind: 'scm',
      },
    }) as Record<string, unknown>;
    expect(n.credentials).toEqual({ id: 7, name: 'Cred', kind: 'scm' });
  });
});

describe('normalizeCleanUpValues', () => {
  it('returns null, non-objects, and arrays unchanged', () => {
    expect(normalizeCleanUpValues(null)).toBeNull();
    expect(normalizeCleanUpValues('x')).toBe('x');
    expect(normalizeCleanUpValues([])).toEqual([]);
  });

  it('normalizes project, executionEnvironment, and template when present', () => {
    const out = normalizeCleanUpValues({
      project: {
        projectName: 'p',
        scmUrl: 'https://g.com/x',
        organization: { id: 1, name: 'O', extra: 1 },
      },
      executionEnvironment: {
        environmentName: 'ee',
        organization: { id: 2, name: 'O2' },
        image: 'img',
        pull: 'p',
      },
      template: {
        templateName: 'jt',
        organization: { id: 1, name: 'O' },
        jobInventory: { id: 2, name: 'I' },
        playbook: 'site.yml',
        project: {
          projectName: 'pr',
          scmUrl: 'https://g.com/a',
          organization: { id: 1, name: 'O' },
        },
      },
    }) as Record<string, unknown>;
    expect((out.project as Record<string, unknown>).organization).toEqual({
      id: 1,
      name: 'O',
    });
    expect((out.template as Record<string, unknown>).templateName).toBe('jt');
  });
});

describe('formatLaunchTagsString', () => {
  it('returns undefined for undefined or null', () => {
    expect(formatLaunchTagsString(undefined)).toBeUndefined();
    expect(formatLaunchTagsString(null)).toBeUndefined();
  });
});

describe('normalizeTemplateLaunchValues', () => {
  it('returns null, non-objects, and arrays unchanged', () => {
    expect(normalizeTemplateLaunchValues(null)).toBeNull();
    expect(normalizeTemplateLaunchValues('x')).toBe('x');
    expect(normalizeTemplateLaunchValues([1])).toEqual([1]);
  });

  it('aliases snake_case Tower fields to camelCase and removes snake keys', () => {
    const out = normalizeTemplateLaunchValues({
      template: 'T',
      job_type: 'run',
      extra_vars: 'k: v',
      job_tags: 'a,b',
      skip_tags: 'c',
      scm_branch: 'main',
      job_slice_count: 2,
      diff_mode: true,
      instance_groups: [1],
      start_at_task: 'x',
      force_handlers: true,
      use_fact_cache: true,
      execution_environment: { id: 1, name: 'EE', image: 'i', pull: 'p' },
    }) as Record<string, unknown>;
    expect(out.jobType).toBe('run');
    expect(out.extraVariables).toBe('k: v');
    expect(out.jobTags).toBe('a,b');
    expect(out.skipTags).toBe('c');
    expect(out.scmBranch).toBe('main');
    expect(out.jobSliceCount).toBe(2);
    expect(out.diffMode).toBe(true);
    expect(out.instanceGroups).toEqual([1]);
    expect(out.startAtTask).toBe('x');
    expect(out.forceHandlers).toBe(true);
    expect(out.useFactCache).toBe(true);
    expect(out).not.toHaveProperty('job_type');
    expect((out.executionEnvironment as Record<string, unknown>).id).toBe(1);
  });

  it('copies tags to jobTags when jobTags is absent and removes tags', () => {
    const out = normalizeTemplateLaunchValues({
      template: 'T',
      tags: 'one,two',
    }) as Record<string, unknown>;
    expect(out.jobTags).toBe('one,two');
    expect(out).not.toHaveProperty('tags');
  });

  it('formats jobTags and skipTags from arrays (including numeric, bigint, and symbol)', () => {
    const out = normalizeTemplateLaunchValues({
      template: 'T',
      jobTags: [1, 'a', BigInt(2)],
      skipTags: [Symbol('x'), 'y'],
    }) as Record<string, unknown>;
    expect(out.jobTags).toBe('1,a,2');
    expect(out.skipTags).toBe('Symbol(x),y');
  });

  it('returns empty string for empty tag array and undefined for non-scalar object tags', () => {
    const out1 = normalizeTemplateLaunchValues({
      template: 'T',
      jobTags: [],
    }) as Record<string, unknown>;
    expect(out1.jobTags).toBe('');

    const out2 = normalizeTemplateLaunchValues({
      template: 'T',
      skipTags: {},
    }) as Record<string, unknown>;
    expect(out2.skipTags).toBeUndefined();
  });

  it('normalizes inventory: numeric id, object, NaN and Infinity fallthrough, non-array credentials', () => {
    const withNumInv = normalizeTemplateLaunchValues({
      template: 'T',
      inventory: 42,
    }) as Record<string, unknown>;
    expect(withNumInv.inventory).toEqual({ id: 42, name: '' });

    const withInf = normalizeTemplateLaunchValues({
      template: 'T',
      inventory: Infinity,
    }) as Record<string, unknown>;
    expect(withInf.inventory).toBe(Infinity);

    const withNaN = normalizeTemplateLaunchValues({
      template: 'T',
      inventory: Number.NaN,
    }) as Record<string, unknown>;
    expect(withNaN.inventory).toBeNaN();

    const withCredNotArray = normalizeTemplateLaunchValues({
      template: 'T',
      credentials: { not: 'array' },
    }) as Record<string, unknown>;
    expect(withCredNotArray.credentials).toEqual({ not: 'array' });
  });

  it('normalizes verbosity: number, object with string name, object without name uses String(id)', () => {
    const v1 = normalizeTemplateLaunchValues({
      template: 'T',
      verbosity: 2,
    }) as Record<string, unknown>;
    expect(v1.verbosity).toEqual({ id: 2, name: '2' });

    const v2 = normalizeTemplateLaunchValues({
      template: 'T',
      verbosity: { id: 3, name: 'Three' },
    }) as Record<string, unknown>;
    expect(v2.verbosity).toEqual({ id: 3, name: 'Three' });

    const v3 = normalizeTemplateLaunchValues({
      template: 'T',
      verbosity: { id: 4 },
    }) as Record<string, unknown>;
    expect(v3.verbosity).toEqual({ id: 4, name: '4' });
  });

  it('returns verbosity unchanged when not a plain object with numeric id (string, array, null, bad id)', () => {
    expect(
      (
        normalizeTemplateLaunchValues({
          template: 'T',
          verbosity: 'custom',
        }) as Record<string, unknown>
      ).verbosity,
    ).toBe('custom');

    expect(
      (
        normalizeTemplateLaunchValues({
          template: 'T',
          verbosity: [1, 2],
        }) as Record<string, unknown>
      ).verbosity,
    ).toEqual([1, 2]);

    expect(
      (
        normalizeTemplateLaunchValues({
          template: 'T',
          verbosity: null,
        }) as Record<string, unknown>
      ).verbosity,
    ).toBeNull();

    expect(
      (
        normalizeTemplateLaunchValues({
          template: 'T',
          verbosity: { id: 'not-a-number', name: 'x' },
        }) as Record<string, unknown>
      ).verbosity,
    ).toEqual({ id: 'not-a-number', name: 'x' });
  });

  it('maps jobTags null to undefined after formatting', () => {
    const out = normalizeTemplateLaunchValues({
      template: 'T',
      jobTags: null,
    }) as Record<string, unknown>;
    expect(out.jobTags).toBeUndefined();
  });

  it('maps launch credentials with numeric credential_type and via summary_fields', () => {
    const out = normalizeTemplateLaunchValues({
      template: 'T',
      credentials: [
        null,
        {
          id: 1,
          name: 'C1',
          type: 'credential',
          credential_type: 5,
          summary_fields: {},
        },
        {
          id: 2,
          name: 'C2',
          summary_fields: null,
        },
        {
          id: 3,
          name: 'C3',
          summary_fields: [],
        },
        {
          id: 4,
          name: 'C4',
          summary_fields: {
            credential_type: { id: 7, name: 'Machine' },
            org: { id: 1, name: 'O', extra: 'ignored' },
          },
        },
      ],
    }) as Record<string, unknown>;
    const creds = out.credentials as Record<string, unknown>[];
    expect(creds[0]).toBeNull();
    expect(creds[1].credential_type).toBe(5);
    expect(creds[2]).not.toHaveProperty('credential_type');
    expect(creds[2].summary_fields).toEqual({});
    expect(creds[3].summary_fields).toEqual({});
    expect(creds[4].credential_type).toBe(7);
    expect(
      (creds[4].summary_fields as Record<string, { id: number; name: string }>)
        .org,
    ).toEqual({ id: 1, name: 'O' });
  });

  it('returns credential unchanged when id is not a number', () => {
    const out = normalizeTemplateLaunchValues({
      template: 'T',
      credentials: [{ name: 'x' }],
    }) as Record<string, unknown>;
    expect((out.credentials as unknown[])[0]).toEqual({ name: 'x' });
  });
});

describe('launchJobTemplateInputSchema', () => {
  it('preprocesses and parses a minimal valid launch payload', () => {
    const result = launchJobTemplateInputSchema.safeParse({
      template: 'My template',
      job_type: 'check',
      inventory: { id: 1, name: 'Inv' },
    });
    expect(result).toMatchObject({
      success: true,
      data: expect.objectContaining({
        template: 'My template',
        jobType: 'check',
      }),
    });
  });
});
