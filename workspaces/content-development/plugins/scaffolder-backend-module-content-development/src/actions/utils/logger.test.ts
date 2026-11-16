import { mockServices } from '@backstage/backend-test-utils';
import { ScaffolderLogger } from './logger';

describe('ScaffolderLogger', () => {
  it('prefixes and forwards each log level', () => {
    const logger = mockServices.logger.mock();
    const scaffolderLogger = new ScaffolderLogger(
      'content-development',
      logger,
    );

    scaffolderLogger.info('created');
    scaffolderLogger.warn('retrying');
    scaffolderLogger.error('failed');

    expect(logger.info).toHaveBeenCalledWith('[content-development] created');
    expect(logger.warn).toHaveBeenCalledWith('[content-development] retrying');
    expect(logger.error).toHaveBeenCalledWith('[content-development] failed');
  });
});
