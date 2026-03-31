import {
  toEEDefinitionUrl,
  getEntityEEDefinitionUrl,
  downloadEntityAsTarArchive,
} from './helpers';
import { Entity } from '@backstage/catalog-model';
import { ANNOTATION_EDIT_URL } from '@backstage/catalog-model';

jest.mock('../../utils/tarArchiveUtils', () => ({
  createTarArchive: jest.fn(() => new Uint8Array(512)),
}));

describe('catalog helpers', () => {
  describe('toEEDefinitionUrl', () => {
    it('returns empty string when url is empty, null, or undefined', () => {
      expect(toEEDefinitionUrl('', 'ee1')).toBe('');
      expect(toEEDefinitionUrl('', '')).toBe('');
      expect(toEEDefinitionUrl(null as any, 'ee1')).toBe('');
      expect(toEEDefinitionUrl(undefined as any, 'ee1')).toBe('');
    });

    it('returns url unchanged when eeName is empty (no resolution)', () => {
      expect(toEEDefinitionUrl('https://example.com/repo', '')).toBe(
        'https://example.com/repo',
      );
    });

    it('strips url: prefix (case insensitive) when url starts with it', () => {
      expect(toEEDefinitionUrl('url:https://example.com/repo', 'ee1')).toBe(
        'https://example.com/repo',
      );
      expect(toEEDefinitionUrl('URL:https://example.com/repo', 'ee1')).toBe(
        'https://example.com/repo',
      );
    });

    it('strips url: and trims when prefix is at start', () => {
      expect(toEEDefinitionUrl('url:  https://example.com/repo  ', 'ee1')).toBe(
        'https://example.com/repo',
      );
    });

    it('replaces catalog-info.yaml with eeName.yml when URL contains catalog-info.yaml', () => {
      expect(
        toEEDefinitionUrl(
          'https://github.com/org/repo/blob/main/catalog-info.yaml',
          'my-ee',
        ),
      ).toBe('https://github.com/org/repo/blob/main/my-ee.yml');
      expect(
        toEEDefinitionUrl(
          'url:https://gitlab.com/a/b/catalog-info.yaml',
          'ee2',
        ),
      ).toBe('https://gitlab.com/a/b/ee2.yml');
    });

    it('returns URL unchanged when it does not contain catalog-info.yaml', () => {
      const url = 'https://github.com/org/repo/tree/main/';
      expect(toEEDefinitionUrl(url, 'ee1')).toBe(url);
      expect(toEEDefinitionUrl('https://example.com/ee-one.yaml', 'ee1')).toBe(
        'https://example.com/ee-one.yaml',
      );
    });
  });

  describe('getEntityEEDefinitionUrl', () => {
    it('returns empty string when entity has no edit or source-location annotation', () => {
      const entity = {
        metadata: { name: 'ee1', annotations: {} },
      } as Entity;
      expect(getEntityEEDefinitionUrl(entity)).toBe('');
    });

    it('prefers ANNOTATION_EDIT_URL over source-location', () => {
      const entity = {
        metadata: {
          name: 'ee1',
          annotations: {
            [ANNOTATION_EDIT_URL]: 'https://edit.example.com/ee1.yaml',
            'backstage.io/source-location':
              'url:https://github.com/org/repo/catalog-info.yaml',
          },
        },
      } as unknown as Entity;
      expect(getEntityEEDefinitionUrl(entity)).toBe(
        'https://edit.example.com/ee1.yaml',
      );
    });

    it('uses source-location when edit URL is not set', () => {
      const entity = {
        metadata: {
          name: 'my-ee',
          annotations: {
            'backstage.io/source-location':
              'url:https://github.com/org/repo/blob/main/catalog-info.yaml',
          },
        },
      } as unknown as Entity;
      expect(getEntityEEDefinitionUrl(entity)).toBe(
        'https://github.com/org/repo/blob/main/my-ee.yml',
      );
    });

    it('strips url: prefix from source-location', () => {
      const entity = {
        metadata: {
          name: 'ee2',
          annotations: {
            'backstage.io/source-location':
              'url:https://gitlab.com/a/b/catalog-info.yaml',
          },
        },
      } as unknown as Entity;
      expect(getEntityEEDefinitionUrl(entity)).toBe(
        'https://gitlab.com/a/b/ee2.yml',
      );
    });

    it('handles entity with missing metadata or annotations', () => {
      expect(getEntityEEDefinitionUrl({} as Entity)).toBe('');
      expect(getEntityEEDefinitionUrl({ metadata: {} } as Entity)).toBe('');
    });

    it('returns empty string when annotation value is empty', () => {
      const entity = {
        metadata: {
          name: 'ee1',
          annotations: {
            'backstage.io/source-location': '',
          },
        },
      } as unknown as Entity;
      expect(getEntityEEDefinitionUrl(entity)).toBe('');
    });
  });

  describe('downloadEntityAsTarArchive', () => {
    let createObjectURLMock: jest.Mock;
    let revokeObjectURLMock: jest.Mock;
    let linkClickSpy: jest.SpyInstance;
    let originalCreateObjectURL: typeof URL.createObjectURL | undefined;
    let originalRevokeObjectURL: typeof URL.revokeObjectURL | undefined;

    beforeEach(() => {
      createObjectURLMock = jest.fn().mockReturnValue('blob:mock-url');
      revokeObjectURLMock = jest.fn();
      if (!URL.createObjectURL) {
        originalCreateObjectURL = undefined;
        originalRevokeObjectURL = undefined;
        (URL as any).createObjectURL = createObjectURLMock;
        (URL as any).revokeObjectURL = revokeObjectURLMock;
      } else {
        originalCreateObjectURL = URL.createObjectURL;
        originalRevokeObjectURL = URL.revokeObjectURL;
        (URL as any).createObjectURL = createObjectURLMock;
        (URL as any).revokeObjectURL = revokeObjectURLMock;
      }
      linkClickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click');
    });

    afterEach(() => {
      if (originalCreateObjectURL !== undefined) {
        (URL as any).createObjectURL = originalCreateObjectURL;
        (URL as any).revokeObjectURL = originalRevokeObjectURL;
      } else {
        delete (URL as any).createObjectURL;
        delete (URL as any).revokeObjectURL;
      }
      linkClickSpy.mockRestore();
    });

    const validEntity = {
      metadata: { name: 'my-ee' },
      spec: {
        definition: 'def',
        readme: 'readme',
        ansible_cfg: 'cfg',
        template: 'tpl',
      },
    } as unknown as Entity;

    it('returns false when definition is missing', () => {
      const entity = {
        ...validEntity,
        spec: { ...validEntity.spec },
      } as Entity;
      delete (entity.spec as any).definition;

      expect(downloadEntityAsTarArchive(entity)).toBe(false);
    });

    it('returns false when readme is missing', () => {
      const entity = {
        ...validEntity,
        spec: { ...validEntity.spec },
      } as Entity;
      delete (entity.spec as any).readme;

      expect(downloadEntityAsTarArchive(entity)).toBe(false);
    });

    it('succeeds when ansible_cfg is missing', () => {
      const { createTarArchive } = require('../../utils/tarArchiveUtils');
      const entity = {
        ...validEntity,
        spec: { ...validEntity.spec },
      } as Entity;
      delete (entity.spec as any).ansible_cfg;

      expect(downloadEntityAsTarArchive(entity)).toBe(true);

      expect(createTarArchive).toHaveBeenLastCalledWith([
        { name: 'my-ee.yaml', content: 'def' },
        { name: 'README-my-ee.md', content: 'readme' },
        { name: 'my-ee-template.yaml', content: 'tpl' },
      ]);
    });

    it('succeeds when ansible_cfg is empty string', () => {
      const { createTarArchive } = require('../../utils/tarArchiveUtils');
      const entity = {
        ...validEntity,
        spec: { ...validEntity.spec, ansible_cfg: '' },
      } as Entity;

      expect(downloadEntityAsTarArchive(entity)).toBe(true);

      expect(createTarArchive).toHaveBeenLastCalledWith([
        { name: 'my-ee.yaml', content: 'def' },
        { name: 'README-my-ee.md', content: 'readme' },
        { name: 'my-ee-template.yaml', content: 'tpl' },
      ]);
    });

    it('returns false when template is missing', () => {
      const entity = {
        ...validEntity,
        spec: { ...validEntity.spec },
      } as Entity;
      delete (entity.spec as any).template;

      expect(downloadEntityAsTarArchive(entity)).toBe(false);
    });

    it('returns false when entity or spec is missing', () => {
      expect(downloadEntityAsTarArchive({} as Entity)).toBe(false);
      expect(downloadEntityAsTarArchive({ metadata: {} } as Entity)).toBe(
        false,
      );
    });

    it('creates archive and triggers download with valid entity', () => {
      const { createTarArchive } = require('../../utils/tarArchiveUtils');

      expect(downloadEntityAsTarArchive(validEntity)).toBe(true);

      expect(createTarArchive).toHaveBeenCalledWith([
        { name: 'my-ee.yaml', content: 'def' },
        { name: 'README-my-ee.md', content: 'readme' },
        { name: 'my-ee-template.yaml', content: 'tpl' },
        { name: 'ansible.cfg', content: 'cfg' },
      ]);
      expect(createObjectURLMock).toHaveBeenCalled();
      expect(linkClickSpy).toHaveBeenCalled();
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
    });

    it('includes mcp_vars in archive when present', () => {
      const { createTarArchive } = require('../../utils/tarArchiveUtils');
      const entityWithMcp = {
        ...validEntity,
        spec: { ...validEntity.spec, mcp_vars: 'mcp-content' },
      } as Entity;

      expect(downloadEntityAsTarArchive(entityWithMcp)).toBe(true);

      expect(createTarArchive).toHaveBeenCalledWith([
        { name: 'my-ee.yaml', content: 'def' },
        { name: 'README-my-ee.md', content: 'readme' },
        { name: 'my-ee-template.yaml', content: 'tpl' },
        { name: 'ansible.cfg', content: 'cfg' },
        { name: 'mcp-vars.yaml', content: 'mcp-content' },
      ]);
    });

    it('uses default name when metadata.name is missing', () => {
      const { createTarArchive } = require('../../utils/tarArchiveUtils');
      const entityNoName = {
        ...validEntity,
        metadata: {},
        spec: validEntity.spec,
      } as Entity;

      expect(downloadEntityAsTarArchive(entityNoName)).toBe(true);

      expect(createTarArchive).toHaveBeenCalledWith([
        { name: 'execution-environment.yaml', content: 'def' },
        { name: 'README-execution-environment.md', content: 'readme' },
        { name: 'execution-environment-template.yaml', content: 'tpl' },
        { name: 'ansible.cfg', content: 'cfg' },
      ]);
    });

    it('returns false when createTarArchive throws', () => {
      const { createTarArchive } = require('../../utils/tarArchiveUtils');
      (createTarArchive as jest.Mock).mockImplementationOnce(() => {
        throw new Error('tar failed');
      });

      expect(downloadEntityAsTarArchive(validEntity)).toBe(false);
    });
  });
});
