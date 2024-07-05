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

import { Config } from '@backstage/config';
import {
  AnalyticsApi,
  AnalyticsEvent,
  IdentityApi,
} from '@backstage/core-plugin-api';

import { AnalyticsBrowser } from '@segment/analytics-next';
import { ENV_DEV, WRITE_KEY_DEV, WRITE_KEY_PROD } from './constant';

/**
 * Segment provider for the Backstage Analytics API.
 * @public
 */
export class AnsibleSegmentAnalytics implements AnalyticsApi {
  private readonly analytics: AnalyticsBrowser;
  private readonly enabled: boolean;
  private readonly testMode: boolean;
  private readonly maskIP: boolean;
  private readonly identityApi: IdentityApi | undefined;

  /**
   * Instantiate the implementation and initialize Segment client.
   */
  private constructor(
    options: { enabled: boolean; testMode: boolean; maskIP: boolean },
    config: Config,
    identityApi?: IdentityApi,
  ) {
    const { enabled, testMode, maskIP } = options;
    const env = config.getString('auth.environment').toLocaleLowerCase('en-US');
    this.identityApi = identityApi;
    this.enabled = enabled;
    this.testMode = testMode;
    this.maskIP = maskIP;
    this.analytics = new AnalyticsBrowser();
    this.analytics.load({
      writeKey: env === ENV_DEV ? WRITE_KEY_DEV : WRITE_KEY_PROD,
    });
  }

  /**
   * Instantiate a fully configured Segment API implementation.
   */
  static fromConfig(config: Config, identityApi?: IdentityApi) {
    const enabled = config.getBoolean('ansible.analytics.enabled') ?? true;
    const testMode =
      config.getOptionalBoolean('ansible.analytics.testMode') ?? false;
    const maskIP =
      config.getOptionalBoolean('ansible.analytics.maskIP') ?? false;

    return new AnsibleSegmentAnalytics(
      {
        enabled,
        testMode,
        maskIP,
      },
      config,
      identityApi,
    );
  }

  async captureEvent(event: AnalyticsEvent) {
    // Don't capture events if analytics not enabled or when in test mode.
    if (!this.enabled || this.testMode) {
      return;
    }
    const { action, subject, context, attributes } = event;

    /**
     * Following events are being tracked by the ansible plugin
     * event.context.pluginId === 'ansible'
     * event.context.pluginId === 'catalog' && subject.includes('ansible') && subject.includes('dev spaces')
     * template choose => navigate event and subject includes template name in the url
     * review step click event and entityRef in context includes template name
     * if action == create and subject includes ansible template name
     * feedback even from ansible plugin
     */

    let canCaptureEvent = false;

    if (context.pluginId === 'ansible') {
      canCaptureEvent = true;
    }

    if (
      !canCaptureEvent &&
      context.pluginId === 'catalog' &&
      subject.toLocaleLowerCase('en-US').includes('ansible')
      && subject.toLocaleLowerCase('en-US').includes('dev spaces')
    ) {
      canCaptureEvent = true;
    }

    if (
      !canCaptureEvent &&
      action === 'navigate' &&
      subject.includes('ansible-')
    ) {
      canCaptureEvent = true;
    }

    if (
      !canCaptureEvent &&
      action === 'click' &&
      context.entityRef &&
      String(context.entityRef).includes('ansible')
    ) {
      canCaptureEvent = true;
    }

    if (
      !canCaptureEvent &&
      action === 'create' &&
      subject.includes('ansible')
    ) {
      canCaptureEvent = true;
    }

    if (!canCaptureEvent) {
      return;
    }

    const analyticsOpts = this.maskIP ? { ip: '0.0.0.0' } : {};

    // Identify users.
    if (action === 'identify') {
      let userId = '';
      if (this.identityApi) {
        const { userEntityRef } = await this.identityApi.getBackstageIdentity();
        userId = await this.getPIIFreeUserID(userEntityRef);
      } else {
        userId = await this.getPIIFreeUserID(subject);
      }
      await this.analytics.identify(userId, {}, analyticsOpts);
      return;
    }

    // Track page views.
    if (action === 'navigate') {
      await this.analytics.page(
        context.pluginId,
        subject,
        context,
        analyticsOpts,
      );
      return;
    }

    // Track other events.
    await this.analytics.track(
      action,
      {
        subject: subject,
        context: context,
        attributes: attributes,
      },
      analyticsOpts,
    );
  }

  private async getPIIFreeUserID(userId: string): Promise<string> {
    return this.hash(userId);
  }

  private async hash(value: string): Promise<string> {
    if (!value) return value;
    const digest = await window.crypto.subtle.digest(
      'sha-256',
      new TextEncoder().encode(value),
    );
    const hashArray = Array.from(new Uint8Array(digest));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}
