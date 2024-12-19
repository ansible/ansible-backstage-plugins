import { handleAutocompleteRequest } from './autocomplete';
import { MOCK_CONFIG, MOCK_TOKEN } from '../mock';
import { ConfigReader } from '@backstage/config';
import { mockServices } from '@backstage/backend-test-utils';
import { AAPApiClient } from '../actions/helpers';

describe('ansible-aap:autocomplete', () => {
  const config = new ConfigReader(MOCK_CONFIG.data);
  const logger = mockServices.logger.mock();
  const token = MOCK_TOKEN;
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return verbosity', async () => {
    const resource = 'verbosity';

    const result = await handleAutocompleteRequest({
      resource,
      token,
      config,
      logger,
    });
    expect(result).toEqual({
      results: [
        { id: 0, name: '0 (Normal)' },
        { id: 1, name: '1 (Verbose)' },
        { id: 2, name: '2 (More Verbose)' },
        { id: 3, name: '3 (Debug)' },
        { id: 4, name: '4 (Connection Debug)' },
        { id: 5, name: '5 (WinRM Debug)' },
      ],
    });
  });

  it('should return organizations', async () => {
    const resource = 'organizations';
    jest
      .spyOn(AAPApiClient.prototype, 'getResourceData')
      .mockImplementation((inputResource: string) => {
        expect(inputResource).toEqual('organizations');
        const returnData = {
          count: 2,
          results: [
            { id: 1, name: 'Test one' },
            { id: 2, name: 'Test two' },
          ],
        };
        return Promise.resolve(returnData);
      });
    const result = await handleAutocompleteRequest({
      resource,
      token,
      config,
      logger,
    });

    expect(result).toEqual({
      results: [
        { id: 1, name: 'Test one' },
        { id: 2, name: 'Test two' },
      ],
    });
  });
});
