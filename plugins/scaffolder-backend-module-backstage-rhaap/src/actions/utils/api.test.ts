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
import { getVoidLogger } from '@backstage/backend-common';
import { BackendServiceAPI } from './api';

jest.mock('node-fetch');

describe('BackendServiceAPI', () => {
  const mockLogger = getVoidLogger();
  const privateFuncdownloadFile = jest.spyOn(BackendServiceAPI.prototype as any, 'downloadFile');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tests playbook project call', async () => {
    const workspacePath = '/tmp/workspace';
    const collectionOrgName = 'my-org';
    const collectionName = 'my-collection';
    const tarName = 'my-collection-playbook-project.tar';
    const creatorServiceUrl = 'http://localhost:8000/';

    const api = new BackendServiceAPI();

    privateFuncdownloadFile.mockImplementation(() => {});

    const privateFuncsendPostRequest = jest.spyOn(BackendServiceAPI.prototype as any, 'sendPostRequest');
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
    expect(privateFuncsendPostRequest).toHaveBeenCalledWith('http://localhost:8000/v1/creator/playbook', {'project': 'ansible-project', 'scm_org': 'my-org', 'scm_project': 'my-collection'});
  });

  it('tests collection project call', async () => {
    const workspacePath = '/tmp/workspace';
    const collectionOrgName = 'my-org';
    const collectionName = 'my-collection';
    const tarName = 'my-collection-project.tar';
    const creatorServiceUrl = 'http://localhost:8000/';

    const api = new BackendServiceAPI();

    const privateFuncdownloadFile = jest.spyOn(BackendServiceAPI.prototype as any, 'downloadFile');
    privateFuncdownloadFile.mockImplementation(() => {});

    const privateFuncsendPostRequest = jest.spyOn(BackendServiceAPI.prototype as any, 'sendPostRequest');
    privateFuncsendPostRequest.mockImplementation(() => {});

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
      )
    );

    // Assert
    expect(privateFuncdownloadFile).toHaveBeenCalled();
    expect(privateFuncsendPostRequest).toHaveBeenCalledWith('http://localhost:8000/v1/creator/collection', {'collection': 'my-org.my-collection', 'project': 'collection'});
  });
});
