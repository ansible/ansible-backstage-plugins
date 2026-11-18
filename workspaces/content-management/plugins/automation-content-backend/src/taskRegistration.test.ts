/**
 * @jest-environment node
 */
import { registerAll } from './taskRegistration';

describe('registerAll', () => {
  it('attempts every registration and reports failures together', async () => {
    const attempted: number[] = [];

    await expect(
      registerAll([
        async () => {
          attempted.push(1);
        },
        async () => {
          attempted.push(2);
          throw new Error('second refused');
        },
        async () => {
          attempted.push(3);
        },
      ]),
    ).rejects.toThrow(
      'failed to complete 1 of 3 task registration(s): ' +
        'Error: second refused',
    );

    expect(attempted).toEqual([1, 2, 3]);
  });

  it('resolves when every registration succeeds', async () => {
    const attempted: number[] = [];

    await registerAll([
      async () => {
        attempted.push(1);
      },
      async () => {
        attempted.push(2);
      },
    ]);

    expect(attempted).toEqual([1, 2]);
  });
});
