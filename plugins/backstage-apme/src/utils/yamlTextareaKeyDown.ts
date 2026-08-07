/*
 * Copyright Red Hat
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

export interface YamlTextareaSelection {
  start: number;
  end: number;
}

export interface YamlTextareaEditResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

const TAB_INDENT = '  ';

/** Leading indent chars removable by Shift+Tab (two spaces, else one tab/space). */
function leadingIndentLength(linePrefix: string): number {
  if (linePrefix.startsWith('  ')) {
    return 2;
  }
  if (linePrefix.startsWith('\t') || linePrefix.startsWith(' ')) {
    return 1;
  }
  return 0;
}

function applyShiftTab(
  value: string,
  selection: YamlTextareaSelection,
): YamlTextareaEditResult {
  const lineStart = value.lastIndexOf('\n', selection.start - 1) + 1;
  const removable = leadingIndentLength(
    value.slice(lineStart, selection.start),
  );

  if (removable === 0) {
    return {
      value,
      selectionStart: selection.start,
      selectionEnd: selection.end,
    };
  }

  const nextValue =
    value.slice(0, lineStart) + value.slice(lineStart + removable);
  const nextStart = Math.max(lineStart, selection.start - removable);
  // Selection end moves left only when it sat after the line start (past removed indent).
  const nextEnd =
    selection.end > lineStart
      ? Math.max(nextStart, selection.end - removable)
      : selection.end;

  return {
    value: nextValue,
    selectionStart: nextStart,
    selectionEnd: nextEnd,
  };
}

/** Tab inserts two spaces; Shift+Tab outdents the current line. */
export function applyYamlTextareaKeyDown(
  value: string,
  selection: YamlTextareaSelection,
  key: string,
  shiftKey: boolean,
): YamlTextareaEditResult | null {
  if (key !== 'Tab') {
    return null;
  }

  if (shiftKey) {
    return applyShiftTab(value, selection);
  }

  const nextValue =
    value.slice(0, selection.start) +
    TAB_INDENT +
    value.slice(selection.end);
  const cursor = selection.start + TAB_INDENT.length;
  return {
    value: nextValue,
    selectionStart: cursor,
    selectionEnd: cursor,
  };
}
