/*
 * Copyright 2021 The Ansible plugin Authors
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

import { createTemplateAction } from "@backstage/plugin-scaffolder-node";
import { ansibleCreatorRun } from "./ansibleContentCreate";
import { readAnsibleConfigs } from "../utils/config";
import { ConfigReader } from "@backstage/config";
import { Logger } from "winston";

export function createAnsibleContentAction() {
  return createTemplateAction<{
    repoUrl: string;
    description: string;
    collectionGroup: string;
    collectionName: string;
  }>({
    id: "ansible:content:create",
    description: "Runs Ansible creator to scaffold Ansible content",
    schema: {
      input: {
        type: "object",
        required: ["repoUrl", "collectionGroup", "collectionName"],
        properties: {
          repoUrl: {
            title: "Repository URL",
            description:
              "The URL of the repository to create the Ansible content",
            type: "RepoUrlPicker",
          },
          collectionGroup: {
            title: "Collection",
            description:
              'The "collectionOrg" part of "collectionOrg.collectionName',
            type: "string",
          },
          collectionName: {
            title: "Collection name",
            description:
              'The "collectionName" part of "collectionOrg.collectionName"',
            type: "string",
          },
          description: {
            title: "Description",
            description:
              "Describe this Collection and its purpose to help other users know what to use it for",
            type: "string",
          },
        },
      },
      output: {
        type: "object",
        required: ["repoUrl", "collectionGroup", "collectionName"],
        properties: {
          devSpacesBaseUrl: {
            type: "string",
          },
        },
      },
    },
    async handler(ctx) {
      const { repoUrl, description, collectionGroup, collectionName } =
        ctx.input;
      ctx.logger.info(
        `Creating Ansible content within ${collectionGroup}.${collectionName} collection at ${repoUrl} with description: ${description}`
      );

      const configuration = new ConfigReader({
        catalog: {
          providers: {
            ansible: {
              devSpacesBaseUrl: "https://localhost:4000",
              baseUrl: "localhost",
              port: "5000",
            },
          },
        },
      });
      const ansibleDetails = readAnsibleConfigs(configuration);

      await ansibleCreatorRun(
        ctx.workspacePath,
        ctx.input.applicationType,
        ctx.logger as Logger,
        repoUrl,
        description,
        collectionGroup,
        collectionName
      );
      ctx.output(
        "devSpacesBaseUrl",
        "https://workspaces.openshift.com/#https://github.com/$" // this to be a variable
      );
    },
  });
}
