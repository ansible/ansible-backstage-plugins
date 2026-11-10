/** @jest-environment node */
import { createTarArchive } from './tarArchiveUtils';

describe('createTarArchive octal fields', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([1_800_000_000, 0o77777777777])(
    'preserves mtime %s without truncation',
    seconds => {
      jest.spyOn(Date, 'now').mockReturnValue(seconds * 1000);
      const archive = createTarArchive([
        { name: 'test.txt', content: 'hello' },
      ]);
      const mtime = new TextDecoder().decode(archive.slice(136, 147));
      expect(Number.parseInt(mtime, 8)).toBe(seconds);
      expect(archive[147]).toBe(0);
      expect(
        Number.parseInt(new TextDecoder().decode(archive.slice(124, 135)), 8),
      ).toBe(5);
    },
  );

  it('rejects mtime overflow instead of silently truncating it', () => {
    jest.spyOn(Date, 'now').mockReturnValue(0o100000000000 * 1000);
    expect(() => createTarArchive([{ name: 'test.txt', content: '' }])).toThrow(
      'Tar octal field overflow',
    );
  });
});
