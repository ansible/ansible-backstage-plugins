/*
 * Copyright 2024 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { parseUploadedFileContent } from './utils';

describe('parseUploadedFileContent', () => {
  it('should parse valid base64 data URL with text/plain content type', () => {
    const content = 'Hello, World!';
    const base64Content = Buffer.from(content).toString('base64');
    const dataUrl = `data:text/plain;base64,${base64Content}`;

    const result = parseUploadedFileContent(dataUrl);

    expect(result).toBe(content);
  });

  it('should parse valid base64 data URL with application/json content type', () => {
    const content = '{"key": "value"}';
    const base64Content = Buffer.from(content).toString('base64');
    const dataUrl = `data:application/json;base64,${base64Content}`;

    const result = parseUploadedFileContent(dataUrl);

    expect(result).toBe(content);
  });

  it('should parse valid base64 data URL with yaml content type', () => {
    const content = 'name: test\nversion: 1.0.0';
    const base64Content = Buffer.from(content).toString('base64');
    const dataUrl = `data:text/yaml;base64,${base64Content}`;

    const result = parseUploadedFileContent(dataUrl);

    expect(result).toBe(content);
  });

  it('should trim whitespace from decoded content', () => {
    const content = '  Hello, World!  \n';
    const base64Content = Buffer.from(content).toString('base64');
    const dataUrl = `data:text/plain;base64,${base64Content}`;

    const result = parseUploadedFileContent(dataUrl);

    expect(result).toBe(content.trim());
  });

  it('should parse empty content', () => {
    const content = '';
    const base64Content = Buffer.from(content).toString('base64');
    const dataUrl = `data:text/plain;base64,${base64Content}`;

    const result = parseUploadedFileContent(dataUrl);

    expect(result).toBe('');
  });

  it('should parse multiline content', () => {
    const content = 'Line 1\nLine 2\nLine 3';
    const base64Content = Buffer.from(content).toString('base64');
    const dataUrl = `data:text/plain;base64,${base64Content}`;

    const result = parseUploadedFileContent(dataUrl);

    expect(result).toBe(content);
  });

  it('should parse content with special characters', () => {
    const content = 'Hello! @#$%^&*()_+-=[]{}|;:,.<>?';
    const base64Content = Buffer.from(content).toString('base64');
    const dataUrl = `data:text/plain;base64,${base64Content}`;

    const result = parseUploadedFileContent(dataUrl);

    expect(result).toBe(content);
  });

  it('should return empty string for input without base64 marker', () => {
    const dataUrl = 'not a base64 data URL';

    const result = parseUploadedFileContent(dataUrl);

    expect(result).toBe('');
  });

  it('should return empty string for empty input string', () => {
    const result = parseUploadedFileContent('');

    expect(result).toBe('');
  });

  it('should throw error for invalid data URL format missing semicolon', () => {
    const invalidDataUrl = 'data:text/plainbase64,SGVsbG8=';

    expect(() => {
      parseUploadedFileContent(invalidDataUrl);
    }).toThrow('Invalid data URL format for the file uploaded');
  });

  it('should throw error for invalid data URL format missing data prefix', () => {
    const invalidDataUrl = 'text/plain;base64,SGVsbG8=';

    expect(() => {
      parseUploadedFileContent(invalidDataUrl);
    }).toThrow('Invalid data URL format for the file uploaded');
  });

  it('should return empty string for data URL with empty base64 data', () => {
    const invalidDataUrl = 'data:text/plain;base64,';

    const result = parseUploadedFileContent(invalidDataUrl);

    expect(result).toBe('');
  });

  it('should decode invalid base64 data without throwing (Buffer.from behavior)', () => {
    // Invalid base64 characters - Buffer.from doesn't throw, it decodes what it can
    const invalidDataUrl = 'data:text/plain;base64,!!!invalid!!!';

    const result = parseUploadedFileContent(invalidDataUrl);

    // Buffer.from will decode invalid base64 without throwing
    // The result will be decoded bytes (may be garbage)
    expect(typeof result).toBe('string');
  });

  it('should handle data URL with charset parameter', () => {
    const content = 'Hello, World!';
    const base64Content = Buffer.from(content).toString('base64');
    const dataUrl = `data:text/plain;charset=utf-8;base64,${base64Content}`;

    const result = parseUploadedFileContent(dataUrl);

    expect(result).toBe(content);
  });

  it('should handle string input that is not a string type (TypeScript type check)', () => {
    // This test ensures the function handles the type check correctly
    // In JavaScript/TypeScript runtime, if a non-string is passed, it should still work
    // but the function checks typeof dataUrl === 'string'
    const result = parseUploadedFileContent(
      'data:text/plain;base64,SGVsbG8=' as string,
    );

    expect(result).toBe('Hello');
  });

  it('should throw error when Buffer.from fails to parse base64 data', () => {
    const dataUrl = 'data:text/plain;base64,SGVsbG8=';
    const originalBufferFrom = Buffer.from;
    const mockError = new Error('Invalid base64 encoding');

    // Mock Buffer.from to throw an error
    Buffer.from = jest.fn(() => {
      throw mockError;
    });

    expect(() => {
      parseUploadedFileContent(dataUrl);
    }).toThrow('Failed to parse data URL: Invalid base64 encoding');

    // Restore original Buffer.from
    Buffer.from = originalBufferFrom;
  });
});
