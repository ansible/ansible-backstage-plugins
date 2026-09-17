import { Config } from '@backstage/config';

export type RhaapProviderConfig = {
  host: string;
  clientId: string;
  clientSecret: string;
  callbackURL: string;
  checkSSL: boolean;
};

export function readRhaapProviderConfig(
  config: Config,
  baseUrl: string,
): RhaapProviderConfig {
  const env = config.getOptionalString('auth.environment') ?? 'development';
  const providerConfig = config.getConfig(`auth.providers.rhaap.${env}`);

  let host = providerConfig.getString('host');
  host = host.endsWith('/') ? host.slice(0, -1) : host;

  const callbackURL =
    providerConfig.getOptionalString('callbackUrl') ??
    `${baseUrl}/api/auth/rhaap/handler/frame`;

  return {
    host,
    clientId: providerConfig.getString('clientId'),
    clientSecret: providerConfig.getString('clientSecret'),
    callbackURL,
    checkSSL: providerConfig.getOptionalBoolean('checkSSL') ?? true,
  };
}
