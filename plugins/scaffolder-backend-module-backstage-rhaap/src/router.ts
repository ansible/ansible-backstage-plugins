/*
 * Copyright 2025 The Ansible plugin Authors
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
import express from 'express';
import Router from 'express-promise-router';

import { LoggerService } from '@backstage/backend-plugin-api';
import { UseCaseMaker } from './actions/helpers/useCaseMaker';
import { AnsibleConfig } from '@ansible/backstage-rhaap-common';

export async function createRouter(options: {
  logger: LoggerService;
  ansibleConfig: AnsibleConfig;
}): Promise<express.Router> {
  const { logger, ansibleConfig } = options;
  const router = Router();

  router.get('/aap/get_ee_readme', async (req, res) => {
    const { scm, host, owner, repository, subdir } = req.query;
    let readmeContent = '';

    const useCaseMaker = new UseCaseMaker({
      ansibleConfig: ansibleConfig,
      logger,
      scmType: scm as string,
      apiClient: null,
      useCases: [],
      organization: null,
      token: null,
    });

    const repoExists = await useCaseMaker.checkIfRepositoryExists({
      repoOwner: owner as string,
      repoName: repository as string,
    });

    if (!repoExists) {
      res
        .status(404)
        .send(
          'Unable to fetch EE README because the repository does not exist\n',
        );
    } else {
      let readmeUrl: string = '';
      if (scm?.toString().toLowerCase() === 'github') {
        readmeUrl = `https://raw.githubusercontent.com/${owner}/${repository}/refs/heads/main/${subdir}/README.md`;
      } else if (scm?.toString().toLowerCase() === 'gitlab') {
        readmeUrl = `https://${host}/${owner}/${repository}/-/raw/main/${subdir}/README.md`;
      } else {
        res.status(400).send('Unsupported SCM type\n');
        return;
      }
      readmeContent = await useCaseMaker.fetchReadmeContent({
        readmeUrl: readmeUrl,
      });
      res.type('text/markdown');
      res.send(readmeContent);
    }
  });

  return router;
}
