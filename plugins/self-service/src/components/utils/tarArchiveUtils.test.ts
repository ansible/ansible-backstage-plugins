import { createTarArchive } from './tarArchiveUtils';
// eslint-disable-next-line no-restricted-imports
import { TextEncoder, TextDecoder } from 'util';

// Polyfill for Node.js test environment
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;

describe('tarArchiveUtils', () => {
  describe('createTarArchive', () => {
    it('creates a valid Uint8Array', () => {
      const files = [{ name: 'test.txt', content: 'hello world' }];
      const result = createTarArchive(files);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    });

    it('creates archive with correct block size alignment', () => {
      const files = [{ name: 'test.txt', content: 'hello' }];
      const result = createTarArchive(files);

      // Tar archives must be aligned to 512-byte blocks
      expect(result.length % 512).toBe(0);
    });

    it('includes tar magic bytes (ustar format)', () => {
      const files = [{ name: 'test.txt', content: 'hello' }];
      const result = createTarArchive(files);

      // Magic bytes "ustar\0" should be at offset 257
      const magic = String.fromCharCode(
        result[257],
        result[258],
        result[259],
        result[260],
        result[261],
      );
      expect(magic).toBe('ustar');
      expect(result[262]).toBe(0); // null terminator
    });

    it('includes version bytes (00)', () => {
      const files = [{ name: 'test.txt', content: 'hello' }];
      const result = createTarArchive(files);

      // Version "00" at offset 263-264
      expect(result[263]).toBe(0x30); // '0'
      expect(result[264]).toBe(0x30); // '0'
    });

    it('stores filename correctly in header', () => {
      const files = [{ name: 'myfile.txt', content: 'content' }];
      const result = createTarArchive(files);

      // Filename starts at offset 0, max 100 bytes
      const nameBytes = result.slice(0, 100);
      const decoder = new TextDecoder();
      const storedName = decoder.decode(nameBytes).replace(/\0/g, '');

      expect(storedName).toBe('myfile.txt');
    });

    it('handles multiple files in archive', () => {
      const files = [
        { name: 'file1.txt', content: 'content1' },
        { name: 'file2.txt', content: 'content2' },
        { name: 'file3.txt', content: 'content3' },
      ];
      const result = createTarArchive(files);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(512 * 3); // At least 3 blocks for 3 files
    });

    it('handles empty file content', () => {
      const files = [{ name: 'empty.txt', content: '' }];
      const result = createTarArchive(files);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    });

    it('handles files with special characters in name', () => {
      const files = [{ name: 'test-file_v2.0.yaml', content: 'content' }];
      const result = createTarArchive(files);

      expect(result).toBeInstanceOf(Uint8Array);
      const nameBytes = result.slice(0, 100);
      const decoder = new TextDecoder();
      const storedName = decoder.decode(nameBytes).replace(/\0/g, '');

      expect(storedName).toBe('test-file_v2.0.yaml');
    });

    it('handles large file content', () => {
      const largeContent = 'x'.repeat(10000);
      const files = [{ name: 'large.txt', content: largeContent }];
      const result = createTarArchive(files);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(10000);
    });

    it('handles UTF-8 content correctly', () => {
      const files = [{ name: 'utf8.txt', content: 'Hello 世界 🎉' }];
      const result = createTarArchive(files);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    });

    it('adds correct end-of-archive markers (two zero blocks)', () => {
      const files = [{ name: 'test.txt', content: 'hello' }];
      const result = createTarArchive(files);

      // Last 1024 bytes (two 512-byte blocks) should be all zeros
      const lastTwoBlocks = result.slice(-1024);
      const allZeros = lastTwoBlocks.every(byte => byte === 0);

      expect(allZeros).toBe(true);
    });

    it('creates consistent output for same input', () => {
      const files = [{ name: 'test.txt', content: 'consistent' }];

      const result1 = createTarArchive(files);
      const result2 = createTarArchive(files);

      // Note: timestamps may differ, so we check length and structure
      expect(result1.length).toBe(result2.length);
      expect(result1).toBeInstanceOf(Uint8Array);
      expect(result2).toBeInstanceOf(Uint8Array);
    });

    it('handles empty files array', () => {
      const files: Array<{ name: string; content: string }> = [];
      const result = createTarArchive(files);

      // Should still have end-of-archive markers (1024 bytes)
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(1024);
    });

    it('sets file mode to 0644', () => {
      const files = [{ name: 'test.txt', content: 'content' }];
      const result = createTarArchive(files);

      // File mode is at offset 100, stored as octal string
      const modeBytes = result.slice(100, 108);
      const decoder = new TextDecoder();
      const modeStr = decoder.decode(modeBytes).replace(/\0/g, '').trim();

      // Should be "000644 " or similar (octal representation)
      expect(modeStr).toContain('644');
    });

    it('includes files with various extensions', () => {
      const files = [
        { name: 'file.yaml', content: 'key: value' },
        { name: 'README.md', content: '# Readme' },
        { name: 'config.cfg', content: '[section]' },
      ];
      const result = createTarArchive(files);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(512 * 3);
    });

    it('handles newlines in content', () => {
      const files = [{ name: 'multiline.txt', content: 'line1\nline2\nline3' }];
      const result = createTarArchive(files);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    });

    it('pads file content to block boundary', () => {
      // Content that doesn't align to 512 bytes should be padded
      const files = [{ name: 'test.txt', content: 'hello' }]; // 5 bytes
      const result = createTarArchive(files);

      // Should have: header (512) + content (5) + padding + end markers (1024)
      expect(result.length).toBeGreaterThan(512 + 5);
      expect(result.length % 512).toBe(0);
    });

    it('sets correct type flag for regular file', () => {
      const files = [{ name: 'test.txt', content: 'content' }];
      const result = createTarArchive(files);

      // Type flag at offset 156 should be '0' (0x30) for regular file
      expect(result[156]).toBe(0x30);
    });

    it('calculates and stores checksum', () => {
      const files = [{ name: 'test.txt', content: 'content' }];
      const result = createTarArchive(files);

      // Checksum is at offset 148-155
      const checksumBytes = result.slice(148, 155);
      const hasChecksum = checksumBytes.some(byte => byte !== 0);

      expect(hasChecksum).toBe(true);
    });
  });
});
