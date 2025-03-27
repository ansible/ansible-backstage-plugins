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

import { LoggerService } from '@backstage/backend-plugin-api';

export class ScaffolderLogger {
  private pluginName: string;
  private ctx: LoggerService;

  constructor(pluginName: string, ctx: LoggerService) {
    this.pluginName = pluginName;
    this.ctx = ctx;
  }

  private formatMessage(message: string): string {
    return `[${this.pluginName}] ${message}`;
  }

  public info(message: string): void {
    const formattedMessage = this.formatMessage(message);
    this.ctx.info(formattedMessage);
  }

  public warn(message: string): void {
    const formattedMessage = this.formatMessage(message);
    this.ctx.warn(formattedMessage);
  }

  public error(message: string): void {
    const formattedMessage = this.formatMessage(message);
    this.ctx.error(formattedMessage);
  }
}
