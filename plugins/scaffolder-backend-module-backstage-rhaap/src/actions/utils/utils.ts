/*
Utility functions for the scaffolder backend module.
*/

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
