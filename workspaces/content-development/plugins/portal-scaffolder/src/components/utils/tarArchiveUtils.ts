/**
 * Utility functions for creating tar archives
 */

const BLOCK_SIZE = 512;

const writeField = (
  buf: Uint8Array,
  offset: number,
  str: string,
  len: number,
) => {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  const writeLen = Math.min(bytes.length, len - 1);
  for (let i = 0; i < writeLen; i++) {
    buf[offset + i] = bytes[i];
  }
  // Null-terminate
  buf[offset + writeLen] = 0;
};

const writeOctalField = (
  buf: Uint8Array,
  offset: number,
  num: number,
  len: number,
) => {
  const str = num.toString(8).padStart(len - 2, '0');
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  const writeLen = Math.min(bytes.length, len - 2);
  for (let i = 0; i < writeLen; i++) {
    buf[offset + i] = bytes[i];
  }
  buf[offset + writeLen] = 0x20; // space
  buf[offset + len - 1] = 0; // null
};

/**
 * Creates a tar archive from an array of files
 * @param files - Array of objects with name and content properties
 * @returns Uint8Array containing the tar archive data
 */
export const createTarArchive = (
  files: Array<{ name: string; content: string }>,
): Uint8Array => {
  const tarData: number[] = [];

  for (const file of files) {
    const content = new TextEncoder().encode(file.content);
    const header = new Uint8Array(BLOCK_SIZE);
    header.fill(0);

    // File name
    writeField(header, 0, file.name, 100);

    // File mode
    writeOctalField(header, 100, 0o644, 8);

    // UID
    writeOctalField(header, 108, 0, 8);

    // GID
    writeOctalField(header, 116, 0, 8);

    // File size
    writeOctalField(header, 124, content.length, 12);

    // Modification time
    writeOctalField(header, 136, Math.floor(Date.now() / 1000), 12);

    // Checksum field
    for (let i = 148; i < 156; i++) {
      header[i] = 0x20;
    }

    // Type flag
    header[156] = 0x30; // '0'

    // Magic (6 bytes) - "ustar\0"
    const magic = new TextEncoder().encode('ustar');
    for (let i = 0; i < 5; i++) {
      header[257 + i] = magic[i];
    }
    header[262] = 0; // null

    // Version (2 bytes) - "00"
    header[263] = 0x30; // '0'
    header[264] = 0x30; // '0'

    let checksum = 0;
    for (let i = 0; i < BLOCK_SIZE; i++) {
      checksum += header[i];
    }

    const checksumStr = checksum.toString(8).padStart(6, '0');
    const checksumBytes = new TextEncoder().encode(checksumStr);
    for (let i = 0; i < 6 && i < checksumBytes.length; i++) {
      header[148 + i] = checksumBytes[i];
    }
    header[154] = 0x20;
    header[155] = 0;

    const padding = (BLOCK_SIZE - (content.length % BLOCK_SIZE)) % BLOCK_SIZE;
    const paddingArray = padding > 0 ? new Array(padding).fill(0) : [];
    tarData.push(
      ...Array.from(header),
      ...Array.from(content),
      ...paddingArray,
    );
  }

  tarData.push(...new Array(BLOCK_SIZE * 2).fill(0));

  return new Uint8Array(tarData);
};
