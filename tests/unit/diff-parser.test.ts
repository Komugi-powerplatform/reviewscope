import { describe, it, expect } from 'vitest';
import { parseDiff, flattenHunks } from '../../packages/core/src/diff-parser.js';

const SAMPLE_DIFF = `diff --git a/src/auth/session.ts b/src/auth/session.ts
index 1234567..abcdefg 100644
--- a/src/auth/session.ts
+++ b/src/auth/session.ts
@@ -10,6 +10,8 @@ export function validateSession(token: string) {
   const decoded = jwt.verify(token, SECRET);
+  if (!decoded.exp || decoded.exp < Date.now()) {
+    throw new Error('Session expired');
+  }
   return decoded;
 }
diff --git a/src/utils/format.ts b/src/utils/format.ts
index 2345678..bcdefgh 100644
--- a/src/utils/format.ts
+++ b/src/utils/format.ts
@@ -1,3 +1,3 @@
-import { capitalize } from './strings';
+import { capitalize } from './strings.js';

 export const formatName = (name: string) => capitalize(name);
`;

describe('parseDiff', () => {
  it('parses files from a unified diff', () => {
    const files = parseDiff(SAMPLE_DIFF);
    expect(files).toHaveLength(2);
    expect(files[0].newPath).toBe('src/auth/session.ts');
    expect(files[1].newPath).toBe('src/utils/format.ts');
  });

  it('extracts hunks per file', () => {
    const files = parseDiff(SAMPLE_DIFF);
    expect(files[0].hunks).toHaveLength(1);
    expect(files[1].hunks).toHaveLength(1);
  });

  it('detects language from file extension', () => {
    const files = parseDiff(SAMPLE_DIFF);
    expect(files[0].hunks[0].language).toBe('typescript');
  });

  it('sets correct start/end lines', () => {
    const files = parseDiff(SAMPLE_DIFF);
    expect(files[0].hunks[0].startLine).toBe(10);
  });

  it('flattenHunks returns all hunks across files', () => {
    const files = parseDiff(SAMPLE_DIFF);
    const hunks = flattenHunks(files);
    expect(hunks).toHaveLength(2);
  });

  it('handles empty diff', () => {
    expect(parseDiff('')).toEqual([]);
  });
});
