import { reconcileSubjectRemoval } from './reconcileSubjectRemoval';

describe('catalog removal reconciliation', () => {
  it('waits through stale entity reads before confirming absence', async () => {
    const read = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValue(undefined);
    expect(
      await reconcileSubjectRemoval(read, () => true, { intervalMs: 0 }),
    ).toBe(true);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('bounds reads when cleanup remains pending', async () => {
    const read = jest.fn().mockResolvedValue({});
    expect(
      await reconcileSubjectRemoval(read, () => true, {
        attempts: 2,
        intervalMs: 0,
      }),
    ).toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('never treats read failure as entity removal', async () => {
    const read = jest.fn().mockRejectedValue(new Error('Forbidden'));
    await expect(reconcileSubjectRemoval(read, () => true)).rejects.toThrow(
      'Forbidden',
    );
  });
  it('ignores stale completion after the subject changes', async () => {
    let current = true;
    const read = jest.fn(async () => {
      current = false;
      return undefined;
    });
    expect(await reconcileSubjectRemoval(read, () => current)).toBe(false);
  });
});
