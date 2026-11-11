/*
 * Copyright 2024 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { mockServices } from '@backstage/backend-test-utils';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import fetch from 'node-fetch';
import { BackendServiceAPI } from './api';

jest.mock('node-fetch');

describe('BackendServiceAPI', () => {
  const mockLogger = mockServices.logger.mock();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets a request timeout for creator-service POSTs', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValue({ ok: true } as any);
    const api = new BackendServiceAPI();

    const controller = new AbortController();
    await (api as any).sendPostRequest(
      'http://localhost/creator',
      {},
      controller.signal,
    );

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost/creator',
      expect.objectContaining({
        method: 'POST',
        timeout: 60_000,
        signal: controller.signal,
      }),
    );
  });

  it('does not follow an existing archive symlink when downloading', async () => {
    const workspacePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'scaffolder-'),
    );
    const outsidePath = path.join(workspacePath, 'outside.txt');
    const archivePath = path.join(workspacePath, 'archive.tar');
    await fs.writeFile(outsidePath, 'original');
    await fs.symlink(outsidePath, archivePath);

    const api = new BackendServiceAPI();
    await expect(
      (api as any).downloadFile(
        { body: Readable.from('replacement') },
        mockLogger,
        workspacePath,
        'archive.tar',
      ),
    ).rejects.toThrow('Failed to download file');

    expect(await fs.readFile(outsidePath, 'utf8')).toBe('original');
    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('tests playbook project call with V2 API success', async () => {
    const workspacePath = '/tmp/workspace';
    const collectionOrgName = 'my-org';
    const collectionName = 'my-collection';
    const tarName = 'my-collection-playbook-project.tar';
    const creatorServiceUrl = 'http://localhost:8000/';

    const api = new BackendServiceAPI();

    const privateFuncdownloadFile = jest.spyOn(
      BackendServiceAPI.prototype as any,
      'downloadFile',
    );
    privateFuncdownloadFile.mockImplementation(() => {});

    const privateFuncsendPostRequest = jest.spyOn(
      BackendServiceAPI.prototype as any,
      'sendPostRequest',
    );
    privateFuncsendPostRequest.mockImplementation(() => {});

    await api.downloadPlaybookProject(
      workspacePath,
      mockLogger,
      creatorServiceUrl,
      collectionOrgName,
      collectionName,
      tarName,
    );

    // Assert
    expect(privateFuncdownloadFile).toHaveBeenCalled();
    expect(privateFuncsendPostRequest).toHaveBeenCalledWith(
      'http://localhost:8000/v2/creator/playbook',
      {
        project: 'ansible-project',
        namespace: 'my-org',
        collection_name: 'my-collection',
      },
    );
  });

  it('tests playbook project call with V2 API failure and fallback to V1', async () => {
    const workspacePath = '/tmp/workspace';
    const collectionOrgName = 'my-org';
    const collectionName = 'my-collection';
    const tarName = 'my-collection-playbook-project.tar';
    const creatorServiceUrl = 'http://localhost:8000/';

    const api = new BackendServiceAPI();

    const privateFuncdownloadFile = jest.spyOn(
      BackendServiceAPI.prototype as any,
      'downloadFile',
    );
    privateFuncdownloadFile.mockImplementation(() => {});

    const privateFuncsendPostRequest = jest.spyOn(
      BackendServiceAPI.prototype as any,
      'sendPostRequest',
    );
    privateFuncsendPostRequest
      .mockImplementationOnce(() => {
        throw new Error('V2 failed');
      })
      .mockImplementationOnce(() => {});

    await api.downloadPlaybookProject(
      workspacePath,
      mockLogger,
      creatorServiceUrl,
      collectionOrgName,
      collectionName,
      tarName,
    );

    expect(privateFuncsendPostRequest).toHaveBeenCalledTimes(2);
    expect(privateFuncsendPostRequest).toHaveBeenCalledWith(
      'http://localhost:8000/v1/creator/playbook',
      {
        project: 'ansible-project',
        scm_org: 'my-org',
        scm_project: 'my-collection',
      },
    );
  });

  it('tests error handling when both V1 and V2 APIs fail for playbook project', async () => {
    const workspacePath = '/tmp/workspace';
    const collectionOrgName = 'my-org';
    const collectionName = 'my-collection';
    const tarName = 'my-collection-playbook-project.tar';
    const creatorServiceUrl = 'http://localhost:8000/';

    const api = new BackendServiceAPI();

    jest.spyOn(BackendServiceAPI.prototype as any, 'downloadFile');
    const privateFuncsendPostRequest = jest.spyOn(
      BackendServiceAPI.prototype as any,
      'sendPostRequest',
    );
    privateFuncsendPostRequest.mockImplementation(() => {
      throw new Error('API failed');
    });

    await expect(
      api.downloadPlaybookProject(
        workspacePath,
        mockLogger,
        creatorServiceUrl,
        collectionOrgName,
        collectionName,
        tarName,
      ),
    ).rejects.toThrow(':downloadPlaybookProject:');
  });

  it('tests collection project call with V2 API success', async () => {
    const workspacePath = '/tmp/workspace';
    const collectionOrgName = 'my-org';
    const collectionName = 'my-collection';
    const tarName = 'my-collection-project.tar';
    const creatorServiceUrl = 'http://localhost:8000/';

    const api = new BackendServiceAPI();

    const privateFuncdownloadFile = jest.spyOn(
      BackendServiceAPI.prototype as any,
      'downloadFile',
    );
    privateFuncdownloadFile.mockImplementation(() => {});

    const privateFuncsendPostRequest = jest.spyOn(
      BackendServiceAPI.prototype as any,
      'sendPostRequest',
    );
    privateFuncsendPostRequest.mockImplementation(() => {});

    await api.downloadCollectionProject(
      workspacePath,
      mockLogger,
      creatorServiceUrl,
      collectionOrgName,
      collectionName,
      tarName,
    );

    // Assert
    expect(privateFuncdownloadFile).toHaveBeenCalled();
    expect(privateFuncsendPostRequest).toHaveBeenCalledWith(
      'http://localhost:8000/v2/creator/collection',
      {
        collection: 'my-org.my-collection',
        project: 'collection',
      },
    );
  });

  it('tests collection project call with V2 API failure and fallback to V1', async () => {
    const workspacePath = '/tmp/workspace';
    const collectionOrgName = 'my-org';
    const collectionName = 'my-collection';
    const tarName = 'my-collection-project.tar';
    const creatorServiceUrl = 'http://localhost:8000/';

    const api = new BackendServiceAPI();

    const privateFuncdownloadFile = jest.spyOn(
      BackendServiceAPI.prototype as any,
      'downloadFile',
    );
    privateFuncdownloadFile.mockImplementation(() => {});

    const privateFuncsendPostRequest = jest.spyOn(
      BackendServiceAPI.prototype as any,
      'sendPostRequest',
    );
    privateFuncsendPostRequest
      .mockImplementationOnce(() => {
        throw new Error('V2 failed');
      })
      .mockImplementationOnce(() => {});

    await api.downloadCollectionProject(
      workspacePath,
      mockLogger,
      creatorServiceUrl,
      collectionOrgName,
      collectionName,
      tarName,
    );

    expect(privateFuncsendPostRequest).toHaveBeenCalledTimes(2);
    expect(privateFuncsendPostRequest).toHaveBeenCalledWith(
      'http://localhost:8000/v1/creator/collection',
      {
        collection: 'my-org.my-collection',
        project: 'collection',
      },
    );
  });

  it('tests error handling when both V1 and V2 APIs fail for collection project', async () => {
    const workspacePath = '/tmp/workspace';
    const collectionOrgName = 'my-org';
    const collectionName = 'my-collection';
    const tarName = 'my-collection-project.tar';
    const creatorServiceUrl = 'http://localhost:8000/';

    const api = new BackendServiceAPI();

    jest.spyOn(BackendServiceAPI.prototype as any, 'downloadFile');
    const privateFuncsendPostRequest = jest.spyOn(
      BackendServiceAPI.prototype as any,
      'sendPostRequest',
    );
    privateFuncsendPostRequest.mockImplementation(() => {
      throw new Error('API failed');
    });

    await expect(
      api.downloadCollectionProject(
        workspacePath,
        mockLogger,
        creatorServiceUrl,
        collectionOrgName,
        collectionName,
        tarName,
      ),
    ).rejects.toThrow(':downloadCollectionProject:');
  });

  it('tests devfile call with V2 API success', async () => {
    const workspacePath = '/tmp/workspace';
    const tarName = 'devfile.tar';
    const creatorServiceUrl = 'http://localhost:8000/';

    const api = new BackendServiceAPI();

    const privateFuncdownloadFile = jest.spyOn(
      BackendServiceAPI.prototype as any,
      'downloadFile',
    );
    privateFuncdownloadFile.mockImplementation(() => {});

    const privateFuncsendPostRequest = jest.spyOn(
      BackendServiceAPI.prototype as any,
      'sendPostRequest',
    );
    privateFuncsendPostRequest.mockImplementation(() => {});

    await api.downloadDevfileProject(
      workspacePath,
      mockLogger,
      creatorServiceUrl,
      tarName,
    );

    // Assert
    expect(privateFuncdownloadFile).toHaveBeenCalled();
    expect(privateFuncsendPostRequest).toHaveBeenCalledWith(
      'http://localhost:8000/v2/creator/devfile',
      {},
    );
  });

  it('sends scm_provider in params when scmProvider is provided', async () => {
    const api = new BackendServiceAPI();
    const mockSendPost = jest.spyOn(
      BackendServiceAPI.prototype as any,
      'sendPostRequest',
    );
    mockSendPost.mockImplementation(() => {});
    jest
      .spyOn(BackendServiceAPI.prototype as any, 'downloadFile')
      .mockImplementation(() => {});

    const eeConfig = { base_image: 'img:latest', ee_file_name: 'ee.yml' };

    await api.downloadEEScaffold(
      '/tmp/ws',
      mockLogger,
      'http://localhost:8000/',
      eeConfig,
      'ee.tar',
      'gitlab',
    );

    expect(mockSendPost).toHaveBeenCalledWith(
      'http://localhost:8000/v2/creator/scaffold',
      {
        command_path: ['init', 'execution_env'],
        params: { ee_config: eeConfig, scm_provider: 'gitlab' },
      },
    );
  });

  it('omits scm_provider from params when scmProvider is not provided', async () => {
    const api = new BackendServiceAPI();
    const mockSendPost = jest.spyOn(
      BackendServiceAPI.prototype as any,
      'sendPostRequest',
    );
    mockSendPost.mockImplementation(() => {});
    jest
      .spyOn(BackendServiceAPI.prototype as any, 'downloadFile')
      .mockImplementation(() => {});

    const eeConfig = { base_image: 'img:latest', ee_file_name: 'ee.yml' };

    await api.downloadEEScaffold(
      '/tmp/ws',
      mockLogger,
      'http://localhost:8000/',
      eeConfig,
      'ee.tar',
    );

    expect(mockSendPost).toHaveBeenCalledWith(
      'http://localhost:8000/v2/creator/scaffold',
      {
        command_path: ['init', 'execution_env'],
        params: { ee_config: eeConfig },
      },
    );
  });

  it('throws when downloadEEScaffold fails', async () => {
    const api = new BackendServiceAPI();
    jest
      .spyOn(BackendServiceAPI.prototype as any, 'sendPostRequest')
      .mockRejectedValue(new Error('scaffold failed'));
    jest
      .spyOn(BackendServiceAPI.prototype as any, 'downloadFile')
      .mockImplementation(() => {});

    await expect(
      api.downloadEEScaffold(
        '/tmp/ws',
        mockLogger,
        'http://localhost:8000/',
        {},
        'ee.tar',
      ),
    ).rejects.toThrow('Failed to scaffold EE definition');
  });
});
