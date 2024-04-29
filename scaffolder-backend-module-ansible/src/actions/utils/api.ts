import * as fs from 'fs';
import fetch from 'node-fetch';

export class BackendServiceAPI {
  private async sendPostRequest(url: string, data: any) {
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    };

    try {
      const response = await fetch(url, requestOptions);
      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }
      return response;
    } catch (error) {
      throw new Error(
        `Failed to send POST request to fetch scaffoled data: ${error.message}`,
      );
    }
  }

  private async downloadFile(
    response: Response,
    logger: any,
    workspacePath: string,
    collectionOrgName: string,
  ) {
    try {
      const contentDisposition = response.headers.get('content-disposition');
      const filenamePattern = /filename="(.+?)"/;
      const fileName = contentDisposition
        ? contentDisposition.match(filenamePattern)[1]
        : collectionOrgName;

      const fileStream = fs.createWriteStream(`${workspacePath}/${fileName}`);
      await new Promise((resolve, reject) => {
        response.body.pipe(fileStream);
        response.body.on('error', (err: any) => {
          reject(err);
        });
        fileStream.on('finish', function () {
          resolve(true);
        });
      });
      logger.info('File downloaded successfully');
    } catch (error) {
      throw new Error(`Failed to download file: ${error.message}`);
    }
  }

  public async downloadPlaybookProject(
    workspacePath: string,
    logger: any,
    creatorServiceUrl: string,
    collectionOrgName: string,
    collectionName: string,
  ) {
    try {
      logger.debug(
        `[ansible-creator] Request for ansible-playbook-project: ${collectionOrgName}`,
      );

      const postData = {
        scm_org: collectionOrgName,
        project: 'ansible-project',
        scm_project: collectionName,
      };

      const response = await this.sendPostRequest(
        creatorServiceUrl + 'v1/creator/playbook',
        postData,
      );
      await this.downloadFile(
        response,
        logger,
        workspacePath,
        collectionOrgName + '.tar',
      );
    } catch (error) {
      console.error('Error:', error);
    }
  }

  public async downloadCollectionProject(
    workspacePath: string,
    logger: any,
    creatorServiceUrl: string,
    collectionOrgName: string,
    collectionName: string,
  ) {
    try {
      logger.debug(
        `[ansible-creator] Request for ansible-collection-project: ${collectionOrgName}`,
      );

      const postData = {
        collection: collectionOrgName + '.' + collectionName,
        project: 'collection',
      };

      const response = await this.sendPostRequest(
        creatorServiceUrl + 'v1/creator/collection',
        postData,
      );
      await this.downloadFile(
        response,
        logger,
        workspacePath,
        collectionOrgName + '.tar',
      );
    } catch (error) {
      console.error('Error:', error);
    }
  }
}
