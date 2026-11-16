import { createEERegistrationLock } from './EERegistrationLock';

describe('createEERegistrationLock', () => {
  it('retries schema initialization after a transient failure', async () => {
    const query = {
      insert: jest.fn().mockReturnThis(),
      onConflict: jest.fn().mockReturnThis(),
      ignore: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      forUpdate: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(undefined),
    };
    const transaction = jest.fn(() => query);
    const knex = {
      schema: {
        hasTable: jest
          .fn()
          .mockRejectedValueOnce(new Error('Temporary database outage'))
          .mockResolvedValue(true),
      },
      transaction: jest.fn(async callback => callback(transaction)),
    };
    const lock = createEERegistrationLock({
      getClient: async () => knex,
    } as any);
    const operation = jest.fn().mockResolvedValue('registered');

    await expect(lock('component:default/ee', operation)).rejects.toThrow(
      'Temporary database outage',
    );
    await expect(lock('component:default/ee', operation)).resolves.toBe(
      'registered',
    );

    expect(knex.schema.hasTable).toHaveBeenCalledTimes(2);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
