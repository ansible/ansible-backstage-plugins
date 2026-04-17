/*
Utility functions for the scaffolder backend module.
*/

export function convertUploadToDataUrl(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.data === 'string') {
      return o.data;
    }
    if (typeof o.content === 'string') {
      return o.content;
    }
  }
  return '';
}

export function parseUploadedFileContent(dataUrl: string): string {
  // Start parsing of uploaded file content
  let decodedContent = '';

  if (typeof dataUrl === 'string' && dataUrl.includes('base64,')) {
    const matches = dataUrl.match(/^data:(.*?);base64,(.*)$/);
    if (!matches) {
      throw new Error('Invalid data URL format for the file uploaded');
    }
    const base64Data = matches[2];
    try {
      decodedContent = Buffer.from(base64Data, 'base64')
        .toString('utf-8')
        .trim();
    } catch (error: any) {
      throw new Error(`Failed to parse data URL: ${error.message}`);
    }
  }
  return decodedContent;
}
