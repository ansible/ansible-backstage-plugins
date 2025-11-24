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
    // these query parameters are required
    // host is optional for now with Github
    const required = ['scm', 'owner', 'repository', 'subdir'];

    const missing = required.filter(p => !req.query[p]);
    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required query parameters: ${missing.join(', ')}\n`,
      });
    }

    const scm = req.query.scm!.toString();
    const owner = req.query.owner!.toString();
    const repository = req.query.repository!.toString();
    const subdir = req.query.subdir!.toString();

    // Only allow supported SCM types
    const allowedScm = ['Github', 'Gitlab'];
    if (!allowedScm.includes(scm)) {
      return res.status(400).json({
        error: `Unsupported SCM type '${scm}'. Supported values are: ${allowedScm.join(', ')}`,
      });
    }
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
      return res
        .status(404)
        .send(
          'Unable to fetch EE README because the repository does not exist\n',
        );
    }

    // Determine the correct README URL
    let readmeContent: string = '';
    if (scm === 'Github') {
      readmeContent = await useCaseMaker.fetchGithubFileContent({
        owner: owner,
        repo: repository,
        filePath: `${subdir}/README.md`,
        branch: 'main',
      });
    } else if (scm === 'Gitlab') {
      readmeContent = await useCaseMaker.fetchGitlabFileContent({
        owner: owner,
        repo: repository,
        filePath: `${subdir}/README.md`,
        branch: 'main',
      });
    }
    res.type('text/markdown');
    return res.send(readmeContent);
  });

  return router;
}
